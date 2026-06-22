import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createAgentRunServiceMock } = vi.hoisted(() => ({
  createAgentRunServiceMock: vi.fn(() => ({
    cancelRun: vi.fn(),
    createRun: vi.fn(),
    streamRun: vi.fn(async function* streamRun() {}),
  })),
}));

vi.mock("../agent/runtime.js", () => ({
  createAgentRunService: createAgentRunServiceMock,
}));

import { buildApp } from "../app.js";
import { createLocalStore } from "../local/store.js";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

async function listReferences(
  app: ReturnType<typeof buildApp>,
  payload: Record<string, unknown>,
): Promise<ListResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/tutti/references/list",
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as ListResponse;
}

async function searchReferences(
  app: ReturnType<typeof buildApp>,
  payload: Record<string, unknown>,
): Promise<ListResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/tutti/references/search",
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as ListResponse;
}

function displayNames(result: ListResponse): string[] {
  return result.items.map(
    (item) => (item.reference as { displayName: string }).displayName,
  );
}

function findGroup(result: ListResponse, projectId: string) {
  return result.items.find((item) => item.id === `project:${projectId}`);
}

function findUnassignedGroup(result: ListResponse) {
  return result.items.find((item) => item.id === "unassigned");
}

describe("POST /tutti/references/list", () => {
  const dataRoots: string[] = [];

  afterEach(async () => {
    createAgentRunServiceMock.mockClear();
    await Promise.all(
      dataRoots
        .splice(0)
        .map((dataRoot) =>
          rm(dataRoot, { force: true, recursive: true, maxRetries: 3 }),
        ),
    );
  });

  async function seedStore() {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-refs-test-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Campaign A" });
    const image = store.uploadFile({
      bucket: "project-assets",
      fileName: "hero.png",
      fileBuffer: Buffer.from("img"),
      mimeType: "image/png",
      projectId: project.id,
    });
    const video = store.uploadFile({
      bucket: "project-assets",
      fileName: "promo.mp4",
      fileBuffer: Buffer.from("vid"),
      mimeType: "video/mp4",
      projectId: project.id,
    });
    // Non-media asset under the project: must be excluded.
    store.uploadFile({
      bucket: "project-assets",
      fileName: "plan.json",
      fileBuffer: Buffer.from("{}"),
      mimeType: "application/json",
      projectId: project.id,
    });
    const unassigned = store.uploadFile({
      bucket: "project-assets",
      fileName: "stray.png",
      fileBuffer: Buffer.from("stray"),
      mimeType: "image/png",
    });
    return {
      dataRoot,
      project,
      assetIds: [image.asset.id, video.asset.id],
      unassignedAssetId: unassigned.asset.id,
    };
  }

  it("lists projects as root groups with exact media reference counts", async () => {
    const { dataRoot, project } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const root = await listReferences(app, {});
    await app.close();

    expect(findGroup(root, project.id)).toMatchObject({
      type: "group",
      id: `project:${project.id}`,
      displayName: "Campaign A",
      referenceCount: 2, // image + video; json excluded
    });
    expect(findUnassignedGroup(root)).toMatchObject({
      type: "group",
      id: "unassigned",
      displayName: "项目外资源",
      referenceCount: 1,
    });
  });

  it("lists unassigned media assets under a special root group", async () => {
    const { dataRoot, unassignedAssetId } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const files = await listReferences(app, { parentGroupId: "unassigned" });
    await app.close();

    expect(files.items).toHaveLength(1);
    expect(files.items[0]).toMatchObject({
      type: "reference",
      reference: {
        kind: "file",
        displayName: `${unassignedAssetId}.png`,
        location: {
          type: "app-data-relative",
        },
        mimeType: "image/png",
      },
    });
    const reference = files.items[0]?.reference as {
      location: { path: string };
    };
    expect(reference.location.path).toMatch(/^assets\//);
    expect(reference.location.path).not.toContain("..");
  });

  it("lists projects without reusable media as empty root groups", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-refs-empty-project-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Fresh Project" });
    store.saveProjectThumbnail(project.id, Buffer.from("thumb"), "image/webp");
    const app = buildApp({ env: { dataRoot } });

    const root = await listReferences(app, {});
    const files = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
    });
    await app.close();

    expect(findGroup(root, project.id)).toMatchObject({
      type: "group",
      id: `project:${project.id}`,
      displayName: "Fresh Project",
      referenceCount: 0,
    });
    expect(files.items).toEqual([]);
    expect(files.nextCursor).toBeNull();
  });

  it("lists a project's media assets as app-data-relative file references", async () => {
    const { dataRoot, project, assetIds } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const files = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
    });
    await app.close();

    expect(files.items).toHaveLength(2);
    for (const item of files.items) {
      expect(item.type).toBe("reference");
      const reference = item.reference as {
        kind: string;
        displayName: string;
        location: { type: string; path: string };
      };
      expect(reference.kind).toBe("file");
      expect(reference.location.type).toBe("app-data-relative");
      expect(reference.location.path).toMatch(/^assets\//);
      expect(reference.location.path).not.toContain("..");
      // displayName is the file name, which embeds the asset id.
      const assetId = assetIds.find((id) =>
        reference.displayName.startsWith(id),
      );
      expect(assetId).toBeTruthy();
    }
  });

  it("lists generated canvas assets under the owning project", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-refs-canvas-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Canvas Outputs" });
    const generated = store.uploadFile({
      bucket: "project-assets",
      fileName: "agent-output.png",
      fileBuffer: Buffer.from("generated"),
      mimeType: "image/png",
    });
    const stray = store.uploadFile({
      bucket: "project-assets",
      fileName: "stray.png",
      fileBuffer: Buffer.from("stray"),
      mimeType: "image/png",
    });
    store.saveCanvas(project.primaryCanvas.id, {
      elements: [
        {
          id: "generated-element",
          type: "image",
          fileId: "generated-file",
          isDeleted: false,
          customData: {
            source: "generated",
            assetId: generated.asset.id,
          },
        } as never,
      ],
      appState: {},
      files: {
        "generated-file": {
          id: "generated-file",
          assetId: generated.asset.id,
          mimeType: "image/png",
        },
      },
    });
    const app = buildApp({ env: { dataRoot } });

    const root = await listReferences(app, {});
    const projectFiles = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
    });
    const unassignedFiles = await listReferences(app, {
      parentGroupId: "unassigned",
    });
    await app.close();

    expect(findGroup(root, project.id)).toMatchObject({
      type: "group",
      id: `project:${project.id}`,
      referenceCount: 1,
    });
    expect(findUnassignedGroup(root)).toMatchObject({
      type: "group",
      id: "unassigned",
      referenceCount: 1,
    });
    expect(displayNames(projectFiles)).toEqual([`${generated.asset.id}.png`]);
    expect(displayNames(unassignedFiles)).toEqual([`${stray.asset.id}.png`]);
  });

  it("does not expose project thumbnail snapshots as app references", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-refs-thumb-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Thumbnail Guard" });
    const image = store.uploadFile({
      bucket: "project-assets",
      fileName: "usable.png",
      fileBuffer: Buffer.from("image"),
      mimeType: "image/png",
      projectId: project.id,
    });
    store.saveProjectThumbnail(project.id, Buffer.from("blank"), "image/webp");
    store.saveProjectThumbnail(
      project.id,
      Buffer.from("current"),
      "image/webp",
    );
    const app = buildApp({ env: { dataRoot } });

    const root = await listReferences(app, {});
    const files = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
    });
    const search = await searchReferences(app, {});
    await app.close();

    expect(findGroup(root, project.id)).toMatchObject({
      type: "group",
      id: `project:${project.id}`,
      referenceCount: 1,
    });
    expect(displayNames(files)).toEqual([`${image.asset.id}.png`]);
    expect(displayNames(search)).toEqual([`${image.asset.id}.png`]);
  });

  it("returns an empty result for an unknown group id", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await listReferences(app, { parentGroupId: "bogus:123" });
    await app.close();

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("paginates project file references via opaque cursor", async () => {
    const { dataRoot, project } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const firstPage = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listReferences(app, {
      parentGroupId: `project:${project.id}`,
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    await app.close();

    expect(secondPage.items).toHaveLength(1);
    const firstId = (firstPage.items[0]?.reference as { displayName: string })
      .displayName;
    const secondId = (secondPage.items[0]?.reference as { displayName: string })
      .displayName;
    expect(firstId).not.toBe(secondId);
  });
});

describe("POST /tutti/references/search", () => {
  const dataRoots: string[] = [];

  afterEach(async () => {
    createAgentRunServiceMock.mockClear();
    await Promise.all(
      dataRoots
        .splice(0)
        .map((dataRoot) =>
          rm(dataRoot, { force: true, recursive: true, maxRetries: 3 }),
        ),
    );
  });

  // Two projects, each with one image + one video, plus an excluded non-media
  // file and an unassigned (project-less) media asset.
  async function seedStore() {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-refs-search-"));
    dataRoots.push(dataRoot);
    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const projectA = store.createProject({ name: "Campaign A" });
    const projectB = store.createProject({ name: "Campaign B" });
    const upload = (
      projectId: string | undefined,
      fileName: string,
      mimeType: string,
    ) =>
      store.uploadFile({
        bucket: "project-assets",
        fileName,
        fileBuffer: Buffer.from(fileName),
        mimeType,
        ...(projectId ? { projectId } : {}),
      });
    upload(projectA.id, "a-hero.png", "image/png");
    upload(projectA.id, "a-promo.mp4", "video/mp4");
    upload(projectB.id, "b-hero.jpg", "image/jpeg");
    upload(projectB.id, "b-promo.mov", "video/quicktime");
    upload(projectA.id, "plan.json", "application/json"); // non-media, excluded
    upload(undefined, "stray.png", "image/png");
    return { dataRoot, projectA, projectB };
  }

  it("searches media references recursively across all projects", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await searchReferences(app, {});
    await app.close();

    // 2 project images + 2 project videos + 1 unassigned image; json excluded.
    expect(result.items).toHaveLength(5);
    for (const item of result.items) {
      const reference = item.reference as {
        kind: string;
        location: { type: string; path: string };
        parentGroupLabel?: string;
      };
      expect(reference.kind).toBe("file");
      expect(reference.location.type).toBe("app-data-relative");
      // Flattened search labels each result with its owning project or the
      // special unassigned group.
      expect(reference.parentGroupLabel).toMatch(
        /^Campaign [AB]$|^项目外资源$/,
      );
    }
  });

  it("filters to images only via the image category id (filter-only)", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await searchReferences(app, { filters: ["image"] });
    await app.close();

    expect(result.items).toHaveLength(3);
    for (const name of displayNames(result)) {
      expect(name).toMatch(/\.(png|jpg|jpeg)$/);
    }
  });

  it("returns the intersection of query and type filters", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    // object_path is "<scope>/<uuid>.<ext>"; uuids are hex, so they never
    // contain "png"/"mp4" and the query only matches via the extension token.
    // query "png" matches the image; narrowing by `image` keeps it.
    const pngAsImage = await searchReferences(app, {
      query: "png",
      filters: ["image"],
    });
    // Same query, incompatible type -> empty. If query/type were OR'd this
    // would return the png image plus every video.
    const pngAsVideo = await searchReferences(app, {
      query: "png",
      filters: ["video"],
    });
    await app.close();

    expect(pngAsImage.items).toHaveLength(2);
    expect(displayNames(pngAsImage)[0]).toMatch(/\.png$/);
    expect(pngAsVideo.items).toEqual([]);
  });

  it("combines categories with OR semantics", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const result = await searchReferences(app, {
      filters: ["image", "video"],
    });
    await app.close();

    expect(result.items).toHaveLength(5);
  });

  it("ignores unknown category ids", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    // Only an unknown id -> no effective filter -> all media returned.
    const unknownOnly = await searchReferences(app, { filters: ["bogus"] });
    // Known + unknown -> behaves as the known filter alone.
    const mixed = await searchReferences(app, {
      filters: ["image", "bogus"],
    });
    await app.close();

    expect(unknownOnly.items).toHaveLength(5);
    expect(mixed.items).toHaveLength(3);
  });

  it("returns nothing for a category that matches no exposed assets", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    // No documents exist; the app only exposes image/video media.
    const result = await searchReferences(app, { filters: ["document"] });
    await app.close();

    expect(result.items).toEqual([]);
  });

  it("paginates flat search results via opaque cursor", async () => {
    const { dataRoot } = await seedStore();
    const app = buildApp({ env: { dataRoot } });

    const firstPage = await searchReferences(app, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await searchReferences(app, {
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    await app.close();

    expect(secondPage.items).toHaveLength(1);
    expect(displayNames(firstPage)[0]).not.toBe(displayNames(secondPage)[0]);
  });
});
