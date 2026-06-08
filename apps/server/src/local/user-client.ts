import type { LocalStore } from "./store.js";

const LOCAL_WORKSPACE_ID = "local-workspace";

type QueryResult<T> = Promise<{
  data: T;
  error: { message: string } | null;
}>;

type SupportedTable =
  | "brand_kit_assets"
  | "brand_kits"
  | "canvases"
  | "projects"
  | "skill_files"
  | "workspace_skills"
  | "workspaces";

class LocalQueryBuilder {
  private filters = new Map<string, unknown>();
  private inFilters = new Map<string, unknown[]>();
  private limitCount: number | null = null;
  private patch: Record<string, unknown> | null = null;
  private selection = "*";

  constructor(
    private readonly store: LocalStore,
    private readonly table: SupportedTable,
  ) {}

  select(selection: string) {
    this.selection = selection;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.set(field, value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.inFilters.set(field, values);
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  order(_field: string, _options?: { ascending?: boolean }) {
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.patch = patch;
    return this;
  }

  async single() {
    const result = await this.execute(true);
    if (!result.data) {
      return {
        data: null,
        error: result.error ?? { message: "Row not found." },
      };
    }
    return result;
  }

  async maybeSingle() {
    return this.execute(true);
  }

  then<
    TResult1 = Awaited<ReturnType<LocalQueryBuilder["execute"]>>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Awaited<ReturnType<LocalQueryBuilder["execute"]>>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute(false).then(onfulfilled, onrejected);
  }

  private async execute(single: boolean): QueryResult<any> {
    if (this.patch) {
      return this.executeUpdate();
    }

    const rows = this.readRows();
    if (single) {
      const row = rows[0] ?? null;
      return {
        data: row,
        error: row ? null : { message: "Row not found." },
      };
    }

    return {
      data: this.limitCount != null ? rows.slice(0, this.limitCount) : rows,
      error: null,
    };
  }

  private async executeUpdate(): QueryResult<null> {
    if (this.table !== "canvases") {
      return {
        data: null,
        error: { message: `Updates are not supported for ${this.table}.` },
      };
    }

    const canvasId = this.filters.get("id");
    const content = this.patch?.content;
    if (
      typeof canvasId !== "string" ||
      !content ||
      typeof content !== "object"
    ) {
      return {
        data: null,
        error: { message: "Invalid canvas update payload." },
      };
    }

    const ok = this.store.saveCanvas(canvasId, content as any);
    return {
      data: null,
      error: ok ? null : { message: "Canvas not found." },
    };
  }

  private readRows() {
    switch (this.table) {
      case "canvases":
        return this.readCanvases();
      case "projects":
        return this.readProjects();
      case "workspace_skills":
        return this.readWorkspaceSkills();
      case "skill_files":
        return this.readSkillFiles();
      case "brand_kits":
        return this.readBrandKits();
      case "brand_kit_assets":
        return this.readBrandKitAssets();
      case "workspaces":
        return this.readWorkspaces();
      default:
        return [];
    }
  }

  private readCanvases() {
    const canvasId = this.filters.get("id");
    if (typeof canvasId !== "string") {
      return [];
    }
    const canvas = this.store.getCanvas(canvasId);
    if (!canvas) {
      return [];
    }

    if (this.selection.includes("project:projects(workspace_id)")) {
      return [{ project: { workspace_id: LOCAL_WORKSPACE_ID } }];
    }

    if (this.selection.includes("projects!inner(brand_kit_id)")) {
      const project = this.store.getProject(canvas.projectId);
      return [
        {
          project_id: canvas.projectId,
          projects: {
            brand_kit_id: project?.brand_kit_id ?? null,
          },
        },
      ];
    }

    if (this.selection.includes("project_id")) {
      return [{ project_id: canvas.projectId }];
    }

    if (this.selection.includes("content")) {
      return [{ content: canvas.content }];
    }

    return [canvas];
  }

  private readProjects() {
    const projectId = this.filters.get("id");
    if (typeof projectId !== "string") {
      return [];
    }

    const project = this.store.getProject(projectId);
    return project ? [project] : [];
  }

  private readWorkspaceSkills() {
    const workspaceId = this.filters.get("workspace_id");
    if (workspaceId !== LOCAL_WORKSPACE_ID) {
      return [];
    }

    const enabled = this.filters.get("enabled");
    if (enabled !== true && enabled !== 1) {
      return [];
    }

    return this.store.listEnabledSkills().flatMap((skill) => {
      const detail = this.store.getSkillDetail(skill.id);
      if (!detail) {
        return [];
      }

      return [
        {
          skill: {
            id: detail.id,
            slug: detail.slug,
            name: detail.name,
            description: detail.description,
            skill_content: detail.skillContent,
            metadata: detail.metadata,
          },
        },
      ];
    });
  }

  private readSkillFiles() {
    const skillIds = this.inFilters.get("skill_id");
    if (!skillIds?.length) {
      return [];
    }

    return skillIds.flatMap((skillId) => {
      if (typeof skillId !== "string") {
        return [];
      }

      const detail = this.store.getSkillDetail(skillId);
      return (
        detail?.files?.map((file) => ({
          skill_id: skillId,
          file_path: file.filePath,
          content: file.content,
        })) ?? []
      );
    });
  }

  private readBrandKits() {
    const brandKitId = this.filters.get("id");
    if (typeof brandKitId !== "string") {
      return [];
    }

    const brandKit = this.store.getBrandKit(brandKitId);
    if (!brandKit) {
      return [];
    }

    return [
      {
        id: brandKit.id,
        name: brandKit.name,
        guidance_text: brandKit.guidance_text,
      },
    ];
  }

  private readBrandKitAssets() {
    const kitId = this.filters.get("kit_id");
    if (typeof kitId !== "string") {
      return [];
    }

    const brandKit = this.store.getBrandKit(kitId);
    return brandKit?.assets ?? [];
  }

  private readWorkspaces() {
    const workspaceType = this.filters.get("type");
    if (workspaceType !== "personal") {
      return [];
    }

    return [{ id: LOCAL_WORKSPACE_ID }];
  }
}

export function createLocalUserClient(store: LocalStore) {
  const uploadedUrls = new Map<string, string>();

  return {
    from(table: SupportedTable) {
      return new LocalQueryBuilder(store, table);
    },
    storage: {
      from(bucket: "brand-kit-assets" | "project-assets") {
        return {
          async createSignedUrl(path: string, _ttlSeconds: number) {
            return {
              data: { signedUrl: uploadedUrls.get(path) ?? path },
              error: null,
            };
          },
          async createSignedUrls(paths: string[], _ttlSeconds: number) {
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: uploadedUrls.get(path) ?? path,
              })),
              error: null,
            };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: uploadedUrls.get(path) ?? path,
              },
            };
          },
          async upload(
            path: string,
            fileBuffer: Buffer,
            options?: { contentType?: string },
          ) {
            const uploaded = store.uploadFile({
              bucket: bucket as any,
              fileBuffer,
              fileName: path.split("/").pop() ?? "upload.bin",
              mimeType: options?.contentType ?? "application/octet-stream",
            });
            uploadedUrls.set(path, uploaded.url);
            return {
              data: { path },
              error: null,
            };
          },
        };
      },
    },
  };
}
