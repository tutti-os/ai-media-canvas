import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type {
  AssetBucket,
  AssetObject,
  BrandKitAsset,
  BrandKitAssetCreateRequest,
  BrandKitAssetType,
  BrandKitAssetUpdateRequest,
  BrandKitCreateRequest,
  BrandKitDetail,
  BrandKitSummary,
  BrandKitUpdateRequest,
  CanvasContent,
  CanvasDetail,
  ChatMessage,
  ChatMessageCreateRequest,
  ChatSessionSummary,
  ProjectCreateRequest,
  ProjectSummary,
  ProjectUpdateRequest,
  SkillCreateRequest,
  SkillDetail,
  SkillFileEntry,
  SkillImportRequest,
  SkillListItem,
  SkillToggleRequest,
  ViewerResponse,
} from "@aimc/shared";
import { getBundledSkills } from "./skill-catalog.js";

const LOCAL_USER_ID = "local-user";
const LOCAL_WORKSPACE_ID = "local-workspace";
const DEFAULT_PROJECT_NAME = "My First Project";
const DEFAULT_CANVAS_NAME = "Main Canvas";
const DEFAULT_EMAIL = "local@aimc.app";
const DEFAULT_DISPLAY_NAME = "Local User";

type AssetRow = {
  id: string;
  bucket: AssetBucket;
  object_path: string;
  mime_type: string | null;
  byte_size: number | null;
  workspace_id: string;
  project_id: string | null;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function slugify(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "untitled";
}

function nextAvailableSlug(existingSlugs: string[], baseSlug: string) {
  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  let maxSuffix = 1;
  const pattern = new RegExp(`^${baseSlug}-(\\d+)$`);
  for (const slug of existingSlugs) {
    const match = pattern.exec(slug);
    if (!match) continue;
    const suffix = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  }

  return `${baseSlug}-${maxSuffix + 1}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mimeToExt(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

export type LocalStore = ReturnType<typeof createLocalStore>;

export function createLocalStore(options: {
  assetBaseUrl: string;
  dataRoot?: string;
}) {
  const dataRoot =
    options.dataRoot ?? resolve(process.cwd(), "../../local-data");
  const assetsRoot = join(dataRoot, "assets");
  const uploadsRoot = join(assetsRoot, "uploads");
  const brandKitRoot = join(assetsRoot, "brand-kits");
  const projectRoot = join(assetsRoot, "projects");
  const generatedRoot = join(assetsRoot, "generated");
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(uploadsRoot, { recursive: true });
  mkdirSync(brandKitRoot, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(generatedRoot, { recursive: true });

  const db = new DatabaseSync(join(dataRoot, "ai-media-canvas.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_profile (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      brand_kit_id TEXT,
      thumbnail_asset_id TEXT,
      primary_canvas_id TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL,
      title TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      content_blocks TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      object_path TEXT NOT NULL,
      mime_type TEXT,
      byte_size INTEGER,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brand_kits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      guidance_text TEXT,
      cover_asset_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brand_kit_assets (
      id TEXT PRIMARY KEY,
      kit_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      text_content TEXT,
      file_asset_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL,
      author TEXT NOT NULL,
      version TEXT NOT NULL,
      category TEXT NOT NULL,
      icon_name TEXT,
      source TEXT NOT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      license TEXT,
      skill_content TEXT NOT NULL,
      created_by TEXT,
      source_url TEXT,
      package_name TEXT,
      is_catalog INTEGER NOT NULL DEFAULT 0,
      installed INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skill_files (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  seedBaseData();
  seedBundledSkills();
  ensureDefaultProject();

  function assetUrl(assetId: string) {
    return `${options.assetBaseUrl}/local-assets/${assetId}`;
  }

  function seedBaseData() {
    db.prepare(
      `
        INSERT INTO app_profile (id, display_name, email)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `,
    ).run(LOCAL_USER_ID, DEFAULT_DISPLAY_NAME, DEFAULT_EMAIL);
  }

  function seedBundledSkills() {
    const bundledSkills = getBundledSkills();

    for (const skill of bundledSkills) {
      const timestamp = nowIso();
      db.prepare(
        `
          INSERT INTO skills (
            id, name, slug, description, author, version, category, icon_name,
            source, is_featured, metadata, license, skill_content, created_by,
            source_url, package_name, is_catalog, installed, enabled, installed_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            description = excluded.description,
            author = excluded.author,
            version = excluded.version,
            category = excluded.category,
            icon_name = excluded.icon_name,
            source = excluded.source,
            is_featured = excluded.is_featured,
            metadata = excluded.metadata,
            license = excluded.license,
            skill_content = excluded.skill_content,
            created_by = excluded.created_by,
            source_url = excluded.source_url,
            package_name = excluded.package_name,
            is_catalog = 1,
            updated_at = excluded.updated_at
        `,
      ).run(
        skill.id,
        skill.name,
        skill.slug,
        skill.description,
        skill.author,
        skill.version,
        skill.category,
        skill.iconName,
        skill.source,
        skill.isFeatured ? 1 : 0,
        JSON.stringify(skill.metadata ?? {}),
        skill.license,
        skill.skillContent,
        skill.createdBy,
        skill.sourceUrl,
        skill.packageName,
        skill.installedByDefault ? 1 : 0,
        skill.installedByDefault ? 1 : 0,
        skill.installedByDefault ? timestamp : null,
        timestamp,
        timestamp,
      );
    }
  }

  function ensureDefaultProject() {
    const existing = db
      .prepare(
        `SELECT id FROM projects WHERE archived_at IS NULL ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    if (existing) return;

    const timestamp = nowIso();
    const projectId = randomUUID();
    const canvasId = randomUUID();
    db.exec("BEGIN");
    try {
      db.prepare(
        `
          INSERT INTO projects (
            id, name, slug, description, primary_canvas_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        projectId,
        DEFAULT_PROJECT_NAME,
        slugify(DEFAULT_PROJECT_NAME),
        null,
        canvasId,
        timestamp,
        timestamp,
      );
      db.prepare(
        `
          INSERT INTO canvases (
            id, project_id, name, is_primary, content, created_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?)
        `,
      ).run(
        canvasId,
        projectId,
        DEFAULT_CANVAS_NAME,
        JSON.stringify({ elements: [], appState: {}, files: {} }),
        timestamp,
        timestamp,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function getProfile() {
    const row = db
      .prepare(`SELECT id, display_name, email FROM app_profile WHERE id = ?`)
      .get(LOCAL_USER_ID) as
      | { id: string; display_name: string; email: string }
      | undefined;
    if (!row) {
      return {
        id: LOCAL_USER_ID,
        displayName: DEFAULT_DISPLAY_NAME,
        email: DEFAULT_EMAIL,
        avatarUrl: null,
      } as const;
    }

    return {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: null,
    } as const;
  }

  function getViewer(): ViewerResponse {
    return {
      profile: getProfile(),
    };
  }

  function updateProfile(displayName: string) {
    db.prepare(`UPDATE app_profile SET display_name = ? WHERE id = ?`).run(
      displayName,
      LOCAL_USER_ID,
    );
    return getProfile();
  }

  function getAssetRow(assetId: string) {
    return db
      .prepare(
        `
          SELECT id, bucket, object_path, mime_type, byte_size, workspace_id, project_id, file_path, created_at
          FROM assets
          WHERE id = ?
        `,
      )
      .get(assetId) as
      | (AssetRow & { file_path: string })
      | undefined;
  }

  function assetObjectFromRow(row: AssetRow): AssetObject {
    return {
      id: row.id,
      bucket: row.bucket,
      objectPath: row.object_path,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      projectId: row.project_id,
      createdAt: row.created_at,
    };
  }

  function writeAssetFile(input: {
    bucket: AssetBucket;
    buffer: Buffer;
    mimeType: string;
    projectId?: string;
    fileName: string;
    scope: "upload" | "brand-kit" | "project" | "generated";
  }) {
    const ext = extname(input.fileName) || mimeToExt(input.mimeType);
    const assetId = randomUUID();
    const objectPath = `${input.scope}/${assetId}${ext}`;
    const dir =
      input.scope === "brand-kit"
        ? brandKitRoot
        : input.scope === "project"
          ? projectRoot
          : input.scope === "generated"
            ? generatedRoot
            : uploadsRoot;
    const filePath = join(dir, `${assetId}${ext}`);
    writeFileSync(filePath, input.buffer);
    const createdAt = nowIso();
    db.prepare(
      `
        INSERT INTO assets (
          id, bucket, object_path, mime_type, byte_size, workspace_id, project_id, file_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      assetId,
      input.bucket,
      objectPath,
      input.mimeType,
      input.buffer.length,
      LOCAL_WORKSPACE_ID,
      input.projectId ?? null,
      filePath,
      createdAt,
    );
    const row = getAssetRow(assetId);
    if (!row) {
      throw new Error("Failed to persist local asset.");
    }
    return {
      asset: assetObjectFromRow(row),
      url: assetUrl(assetId),
      filePath,
    };
  }

  function deleteAsset(assetId: string) {
    return deleteAssetRecord(assetId);
  }

  function findAssetReference(assetId: string) {
    const thumbnailReference = db
      .prepare(
        `SELECT id FROM projects WHERE thumbnail_asset_id = ? LIMIT 1`,
      )
      .get(assetId) as { id: string } | undefined;
    if (thumbnailReference) {
      return { kind: "project_thumbnail", id: thumbnailReference.id };
    }

    const brandKitFileReference = db
      .prepare(
        `SELECT id FROM brand_kit_assets WHERE file_asset_id = ? LIMIT 1`,
      )
      .get(assetId) as { id: string } | undefined;
    if (brandKitFileReference) {
      return { kind: "brand_kit_asset", id: brandKitFileReference.id };
    }

    const brandKitCoverReference = db
      .prepare(
        `SELECT id FROM brand_kits WHERE cover_asset_id = ? LIMIT 1`,
      )
      .get(assetId) as { id: string } | undefined;
    if (brandKitCoverReference) {
      return { kind: "brand_kit_cover", id: brandKitCoverReference.id };
    }

    const chatReference = db
      .prepare(
        `SELECT id FROM chat_messages WHERE content_blocks LIKE ? LIMIT 1`,
      )
      .get(`%"assetId":"${assetId}"%`) as { id: string } | undefined;
    if (chatReference) {
      return { kind: "chat_message", id: chatReference.id };
    }

    const canvasReference = db
      .prepare(
        `SELECT id FROM canvases WHERE content LIKE ? LIMIT 1`,
      )
      .get(`%"id":"${assetId}"%`) as { id: string } | undefined;
    if (canvasReference) {
      return { kind: "canvas_content", id: canvasReference.id };
    }

    return null;
  }

  function deleteAssetRecord(
    assetId: string,
    options?: { force?: boolean },
  ): { ok: true } | { ok: false; reason: "asset_not_found" | "asset_in_use" } {
    const row = getAssetRow(assetId);
    if (!row) return { ok: false, reason: "asset_not_found" };
    if (!options?.force && findAssetReference(assetId)) {
      return { ok: false, reason: "asset_in_use" };
    }
    try {
      unlinkSync(row.file_path);
    } catch {
      // ignore missing local file
    }
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(assetId);
    return { ok: true };
  }

  function resolveAssetUrl(assetId: string | null | undefined) {
    if (!assetId) return null;
    const row = getAssetRow(assetId);
    if (!row) return null;
    return assetUrl(row.id);
  }

  function mapProjectRow(row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    primary_canvas_id: string;
    thumbnail_asset_id: string | null;
    created_at: string;
    updated_at: string;
  }): ProjectSummary {
    const canvas = db
      .prepare(
        `SELECT id, name, is_primary FROM canvases WHERE id = ? LIMIT 1`,
      )
      .get(row.primary_canvas_id) as
      | { id: string; name: string; is_primary: number }
      | undefined;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      thumbnailUrl: resolveAssetUrl(row.thumbnail_asset_id),
      primaryCanvas: {
        id: canvas?.id ?? row.primary_canvas_id,
        name: canvas?.name ?? DEFAULT_CANVAS_NAME,
        isPrimary: !!canvas?.is_primary,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function listProjects() {
    const rows = db
      .prepare(
        `
          SELECT id, name, slug, description, primary_canvas_id, thumbnail_asset_id, created_at, updated_at
          FROM projects
          WHERE archived_at IS NULL
          ORDER BY updated_at DESC
        `,
      )
      .all() as Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      primary_canvas_id: string;
      thumbnail_asset_id: string | null;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map(mapProjectRow);
  }

  function createProject(input: ProjectCreateRequest) {
    const timestamp = nowIso();
    const projectId = randomUUID();
    const canvasId = randomUUID();
    const name = input.name.trim();
    const defaultBrandKit = db
      .prepare(
        `
          SELECT id
          FROM brand_kits
          WHERE is_default = 1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get() as { id: string } | undefined;
    const baseSlug = slugify(name);
    const existingRows = db
      .prepare(
        `
          SELECT slug
          FROM projects
          WHERE archived_at IS NULL
            AND (slug = ? OR slug LIKE ?)
        `,
      )
      .all(baseSlug, `${baseSlug}-%`) as Array<{ slug: string }>;
    const slug = nextAvailableSlug(
      existingRows.map((row) => row.slug),
      baseSlug,
    );

    db.exec("BEGIN");
    try {
      db.prepare(
        `
          INSERT INTO projects (
            id, name, slug, description, primary_canvas_id, brand_kit_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        projectId,
        name,
        slug,
        input.description?.trim() || null,
        canvasId,
        defaultBrandKit?.id ?? null,
        timestamp,
        timestamp,
      );
      db.prepare(
        `
          INSERT INTO canvases (
            id, project_id, name, is_primary, content, created_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?)
        `,
      ).run(
        canvasId,
        projectId,
        DEFAULT_CANVAS_NAME,
        JSON.stringify({ elements: [], appState: {}, files: {} }),
        timestamp,
        timestamp,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const row = db
      .prepare(
        `
          SELECT id, name, slug, description, primary_canvas_id, thumbnail_asset_id, created_at, updated_at
          FROM projects WHERE id = ?
        `,
      )
      .get(projectId) as {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      primary_canvas_id: string;
      thumbnail_asset_id: string | null;
      created_at: string;
      updated_at: string;
    };

    return mapProjectRow(row);
  }

  function getProject(projectId: string) {
    const row = db
      .prepare(
        `
          SELECT id, name, slug, description, brand_kit_id, created_at, updated_at
          FROM projects
          WHERE id = ? AND archived_at IS NULL
          LIMIT 1
        `,
      )
      .get(projectId) as
      | {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          brand_kit_id: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      workspace_id: LOCAL_WORKSPACE_ID,
      brand_kit_id: row.brand_kit_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function updateProject(
    projectId: string,
    input: ProjectUpdateRequest,
  ): { ok: true } | { ok: false; reason: "project_not_found" | "brand_kit_not_found" } {
    const existing = getProject(projectId);
    if (!existing) return { ok: false, reason: "project_not_found" };
    const patch: string[] = [];
    const values: SQLInputValue[] = [];
    if (input.name !== undefined) {
      patch.push("name = ?");
      values.push(input.name.trim());
    }
    if (input.brandKitId !== undefined) {
      if (input.brandKitId !== null && !getBrandKit(input.brandKitId)) {
        return { ok: false, reason: "brand_kit_not_found" };
      }
      patch.push("brand_kit_id = ?");
      values.push(input.brandKitId);
    }
    patch.push("updated_at = ?");
    values.push(nowIso());
    values.push(projectId);
    db.prepare(
      `UPDATE projects SET ${patch.join(", ")} WHERE id = ?`,
    ).run(...values);
    return { ok: true };
  }

  function archiveProject(projectId: string) {
    const existing = getProject(projectId);
    if (!existing) return false;
    db.prepare(`UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?`).run(
      nowIso(),
      nowIso(),
      projectId,
    );
    return true;
  }

  function saveProjectThumbnail(projectId: string, buffer: Buffer, mimeType: string) {
    const existing = getProject(projectId);
    if (!existing) return null;
    const stored = writeAssetFile({
      bucket: "project-assets",
      buffer,
      mimeType,
      projectId,
      fileName: "thumbnail" + mimeToExt(mimeType),
      scope: "project",
    });
    db.prepare(
      `UPDATE projects SET thumbnail_asset_id = ?, updated_at = ? WHERE id = ?`,
    ).run(stored.asset.id, nowIso(), projectId);
    return { thumbnailUrl: stored.url };
  }

  function getCanvas(canvasId: string): CanvasDetail | null {
    const row = db
      .prepare(
        `
          SELECT canvases.id, canvases.name, canvases.project_id, canvases.content
          FROM canvases
          INNER JOIN projects ON projects.id = canvases.project_id
          WHERE canvases.id = ? AND projects.archived_at IS NULL
          LIMIT 1
        `,
      )
      .get(canvasId) as
      | {
          id: string;
          name: string;
          project_id: string;
          content: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      projectId: row.project_id,
      content: parseJson<CanvasContent>(row.content, {
        elements: [],
        appState: {},
        files: {},
      }),
    };
  }

  function hasCanvas(canvasId: string) {
    return !!getCanvas(canvasId);
  }

  function saveCanvas(canvasId: string, content: CanvasContent) {
    const existing = getCanvas(canvasId);
    if (!existing) return false;
    const timestamp = nowIso();
    db.prepare(
      `UPDATE canvases SET content = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(content), timestamp, canvasId);
    db.prepare(
      `
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM canvases WHERE id = ?)
      `,
    ).run(timestamp, canvasId);
    return true;
  }

  function listSessions(canvasId: string): ChatSessionSummary[] | null {
    if (!hasCanvas(canvasId)) return null;
    const rows = db
      .prepare(
        `
          SELECT id, title, updated_at
          FROM chat_sessions
          WHERE canvas_id = ?
          ORDER BY updated_at DESC
        `,
      )
      .all(canvasId) as Array<{
      id: string;
      title: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  }

  function hasSession(sessionId: string) {
    const row = db
      .prepare(
        `
          SELECT chat_sessions.id
          FROM chat_sessions
          INNER JOIN canvases ON canvases.id = chat_sessions.canvas_id
          INNER JOIN projects ON projects.id = canvases.project_id
          WHERE chat_sessions.id = ? AND projects.archived_at IS NULL
          LIMIT 1
        `,
      )
      .get(sessionId) as { id: string } | undefined;
    return !!row;
  }

  function createSession(canvasId: string, title?: string): ChatSessionSummary | null {
    if (!hasCanvas(canvasId)) return null;
    const timestamp = nowIso();
    const id = randomUUID();
    db.prepare(
      `
        INSERT INTO chat_sessions (
          id, canvas_id, title, thread_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      canvasId,
      title?.trim() || "New chat",
      `thread:${id}`,
      timestamp,
      timestamp,
    );
    return {
      id,
      title: title?.trim() || "New chat",
      updatedAt: timestamp,
    };
  }

  function updateSessionTitle(sessionId: string, title: string) {
    const result = db.prepare(
      `UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?`,
    ).run(title, nowIso(), sessionId);
    return result.changes > 0;
  }

  function deleteSession(sessionId: string) {
    if (!hasSession(sessionId)) return false;
    db.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(sessionId);
    return true;
  }

  function listMessages(sessionId: string): ChatMessage[] | null {
    if (!hasSession(sessionId)) return null;
    const rows = db
      .prepare(
        `
          SELECT id, role, content, content_blocks, created_at
          FROM chat_messages
          WHERE session_id = ?
          ORDER BY created_at ASC
        `,
      )
      .all(sessionId) as Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      content_blocks: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      toolActivities: null,
      contentBlocks: parseJson(row.content_blocks, null),
      createdAt: row.created_at,
    }));
  }

  function createMessage(sessionId: string, input: ChatMessageCreateRequest): ChatMessage | null {
    if (!hasSession(sessionId)) return null;
    const id = randomUUID();
    const timestamp = nowIso();
    db.prepare(
      `
        INSERT INTO chat_messages (
          id, session_id, role, content, content_blocks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      sessionId,
      input.role,
      input.content,
      input.contentBlocks ? JSON.stringify(input.contentBlocks) : null,
      timestamp,
    );
    db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(
      timestamp,
      sessionId,
    );
    return {
      id,
      role: input.role,
      content: input.content,
      toolActivities: input.toolActivities ?? null,
      contentBlocks: input.contentBlocks ?? null,
      createdAt: timestamp,
    };
  }

  function listBrandKits(): BrandKitSummary[] {
    const kits = db
      .prepare(
        `
          SELECT id, name, is_default, cover_asset_id, created_at, updated_at
          FROM brand_kits
          ORDER BY created_at ASC
        `,
      )
      .all() as Array<{
      id: string;
      name: string;
      is_default: number;
      cover_asset_id: string | null;
      created_at: string;
      updated_at: string;
    }>;
    return kits.map((kit) => {
      const assetCounts = db
        .prepare(
          `
            SELECT asset_type, COUNT(*) as count
            FROM brand_kit_assets
            WHERE kit_id = ?
            GROUP BY asset_type
          `,
        )
        .all(kit.id) as Array<{ asset_type: BrandKitAssetType; count: number }>;
      const counts = { color: 0, font: 0, logo: 0, image: 0 };
      for (const entry of assetCounts) {
        counts[entry.asset_type] = entry.count;
      }
      return {
        id: kit.id,
        name: kit.name,
        is_default: !!kit.is_default,
        cover_url: resolveAssetUrl(kit.cover_asset_id),
        asset_counts: counts,
        created_at: kit.created_at,
        updated_at: kit.updated_at,
      };
    });
  }

  function mapBrandKitAsset(row: {
    id: string;
    asset_type: BrandKitAssetType;
    display_name: string;
    role: string | null;
    sort_order: number;
    text_content: string | null;
    file_asset_id: string | null;
    metadata: string;
    created_at: string;
    updated_at: string;
  }): BrandKitAsset {
    return {
      id: row.id,
      asset_type: row.asset_type,
      display_name: row.display_name,
      role: row.role,
      sort_order: row.sort_order,
      text_content: row.text_content,
      file_url: resolveAssetUrl(row.file_asset_id),
      metadata: parseJson(row.metadata, {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function getBrandKit(kitId: string): BrandKitDetail | null {
    const row = db
      .prepare(
        `
          SELECT id, name, is_default, guidance_text, cover_asset_id, created_at, updated_at
          FROM brand_kits
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(kitId) as
      | {
          id: string;
          name: string;
          is_default: number;
          guidance_text: string | null;
          cover_asset_id: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    const assets = db
      .prepare(
        `
          SELECT id, asset_type, display_name, role, sort_order, text_content, file_asset_id, metadata, created_at, updated_at
          FROM brand_kit_assets
          WHERE kit_id = ?
          ORDER BY sort_order ASC, created_at ASC
        `,
      )
      .all(kitId) as Array<{
      id: string;
      asset_type: BrandKitAssetType;
      display_name: string;
      role: string | null;
      sort_order: number;
      text_content: string | null;
      file_asset_id: string | null;
      metadata: string;
      created_at: string;
      updated_at: string;
    }>;

    return {
      id: row.id,
      name: row.name,
      is_default: !!row.is_default,
      guidance_text: row.guidance_text,
      cover_url: resolveAssetUrl(row.cover_asset_id),
      assets: assets.map(mapBrandKitAsset),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function createBrandKit(input?: BrandKitCreateRequest): BrandKitDetail {
    const id = randomUUID();
    const timestamp = nowIso();
    db.prepare(
      `
        INSERT INTO brand_kits (id, name, is_default, guidance_text, created_at, updated_at)
        VALUES (?, ?, 0, NULL, ?, ?)
      `,
    ).run(id, input?.name?.trim() || "Untitled", timestamp, timestamp);
    return getBrandKit(id)!;
  }

  function updateBrandKit(kitId: string, input: BrandKitUpdateRequest) {
    const existing = getBrandKit(kitId);
    if (!existing) return null;
    if (input.is_default) {
      db.prepare(`UPDATE brand_kits SET is_default = 0`).run();
    }
    const patch: string[] = [];
    const values: SQLInputValue[] = [];
    if (input.name !== undefined) {
      patch.push("name = ?");
      values.push(input.name.trim());
    }
    if (input.guidance_text !== undefined) {
      patch.push("guidance_text = ?");
      values.push(input.guidance_text);
    }
    if (input.is_default !== undefined) {
      patch.push("is_default = ?");
      values.push(input.is_default ? 1 : 0);
    }
    patch.push("updated_at = ?");
    values.push(nowIso(), kitId);
    db.prepare(`UPDATE brand_kits SET ${patch.join(", ")} WHERE id = ?`).run(
      ...values,
    );
    return getBrandKit(kitId);
  }

  function deleteBrandKit(kitId: string) {
    const existing = getBrandKit(kitId);
    if (!existing) return false;
    const fileAssetIds = db
      .prepare(
        `SELECT file_asset_id FROM brand_kit_assets WHERE kit_id = ? AND file_asset_id IS NOT NULL`,
      )
      .all(kitId) as Array<{ file_asset_id: string }>;
    const coverAssetId = db
      .prepare(`SELECT cover_asset_id FROM brand_kits WHERE id = ?`)
      .get(kitId) as { cover_asset_id: string | null } | undefined;
    db.prepare(`UPDATE projects SET brand_kit_id = NULL, updated_at = ? WHERE brand_kit_id = ?`).run(
      nowIso(),
      kitId,
    );
    db.prepare(`DELETE FROM brand_kit_assets WHERE kit_id = ?`).run(kitId);
    db.prepare(`DELETE FROM brand_kits WHERE id = ?`).run(kitId);
    const ownedAssetIds = new Set(
      fileAssetIds.map((row) => row.file_asset_id).filter(Boolean),
    );
    if (coverAssetId?.cover_asset_id) {
      ownedAssetIds.add(coverAssetId.cover_asset_id);
    }
    for (const assetId of ownedAssetIds) {
      deleteAssetRecord(assetId, { force: true });
    }
    return true;
  }

  function duplicateBrandKit(kitId: string) {
    const existing = getBrandKit(kitId);
    if (!existing) return null;
    const duplicated = createBrandKit({ name: `${existing.name} Copy` });
    const sourceAssets = db
      .prepare(
        `
          SELECT id, asset_type, display_name, role, sort_order, text_content, file_asset_id, metadata
          FROM brand_kit_assets
          WHERE kit_id = ?
          ORDER BY sort_order ASC, created_at ASC
        `,
      )
      .all(kitId) as Array<{
      id: string;
      asset_type: BrandKitAssetType;
      display_name: string;
      role: string | null;
      sort_order: number;
      text_content: string | null;
      file_asset_id: string | null;
      metadata: string;
    }>;
    const copiedAssetIds = new Map<string, string>();
    for (const asset of sourceAssets) {
      let duplicatedFileAssetId: string | null = null;
      if (asset.file_asset_id) {
        const originalFileAsset = getAssetRow(asset.file_asset_id);
        if (originalFileAsset) {
          const duplicatedFile = writeAssetFile({
            bucket: originalFileAsset.bucket,
            buffer: readFileSync(originalFileAsset.file_path),
            mimeType: originalFileAsset.mime_type ?? "application/octet-stream",
            fileName: originalFileAsset.object_path.split("/").at(-1) ?? asset.display_name,
            scope: "brand-kit",
          });
          duplicatedFileAssetId = duplicatedFile.asset.id;
          copiedAssetIds.set(asset.file_asset_id, duplicatedFile.asset.id);
        }
      }
      db.prepare(
        `
          INSERT INTO brand_kit_assets (
            id, kit_id, asset_type, display_name, role, sort_order, text_content, file_asset_id, metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        randomUUID(),
        duplicated.id,
        asset.asset_type,
        asset.display_name,
        asset.role,
        asset.sort_order,
        asset.text_content,
        duplicatedFileAssetId,
        asset.metadata,
        nowIso(),
        nowIso(),
      );
    }
    const sourceCoverAssetId = db
      .prepare(`SELECT cover_asset_id FROM brand_kits WHERE id = ?`)
      .get(kitId) as { cover_asset_id: string | null } | undefined;
    const duplicatedCoverAssetId = sourceCoverAssetId?.cover_asset_id
      ? copiedAssetIds.get(sourceCoverAssetId.cover_asset_id) ?? null
      : null;
    if (duplicatedCoverAssetId) {
      db.prepare(`UPDATE brand_kits SET cover_asset_id = ?, updated_at = ? WHERE id = ?`).run(
        duplicatedCoverAssetId,
        nowIso(),
        duplicated.id,
      );
    }
    return getBrandKit(duplicated.id);
  }

  function createBrandKitAsset(
    kitId: string,
    input: BrandKitAssetCreateRequest,
  ) {
    if (!getBrandKit(kitId)) return null;
    const id = randomUUID();
    const timestamp = nowIso();
    db.prepare(
      `
        INSERT INTO brand_kit_assets (
          id, kit_id, asset_type, display_name, role, sort_order, text_content, file_asset_id, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `,
    ).run(
      id,
      kitId,
      input.asset_type,
      input.display_name.trim(),
      input.role ?? null,
      0,
      input.text_content ?? null,
      JSON.stringify(input.metadata ?? {}),
      timestamp,
      timestamp,
    );
    const detail = getBrandKit(kitId);
    return detail?.assets.find((asset) => asset.id === id) ?? null;
  }

  function updateBrandKitAsset(
    kitId: string,
    assetId: string,
    input: BrandKitAssetUpdateRequest,
  ) {
    const existing = getBrandKit(kitId);
    if (!existing) return null;
    const patch: string[] = [];
    const values: SQLInputValue[] = [];
    if (input.display_name !== undefined) {
      patch.push("display_name = ?");
      values.push(input.display_name.trim());
    }
    if (input.text_content !== undefined) {
      patch.push("text_content = ?");
      values.push(input.text_content);
    }
    if (input.role !== undefined) {
      patch.push("role = ?");
      values.push(input.role);
    }
    if (input.sort_order !== undefined) {
      patch.push("sort_order = ?");
      values.push(input.sort_order);
    }
    if (input.metadata !== undefined) {
      patch.push("metadata = ?");
      values.push(JSON.stringify(input.metadata));
    }
    patch.push("updated_at = ?");
    values.push(nowIso(), assetId, kitId);
    db.prepare(
      `UPDATE brand_kit_assets SET ${patch.join(", ")} WHERE id = ? AND kit_id = ?`,
    ).run(...values);
    const detail = getBrandKit(kitId);
    return detail?.assets.find((asset) => asset.id === assetId) ?? null;
  }

  function deleteBrandKitAsset(kitId: string, assetId: string) {
    const row = db
      .prepare(
        `SELECT file_asset_id FROM brand_kit_assets WHERE id = ? AND kit_id = ?`,
      )
      .get(assetId, kitId) as { file_asset_id: string | null } | undefined;
    if (!row) return false;
    if (row.file_asset_id) {
      db.prepare(`UPDATE brand_kits SET cover_asset_id = NULL, updated_at = ? WHERE id = ? AND cover_asset_id = ?`).run(
        nowIso(),
        kitId,
        row.file_asset_id,
      );
    }
    db.prepare(`DELETE FROM brand_kit_assets WHERE id = ? AND kit_id = ?`).run(
      assetId,
      kitId,
    );
    if (row.file_asset_id) {
      deleteAssetRecord(row.file_asset_id, { force: true });
    }
    return true;
  }

  function uploadBrandKitAsset(
    kitId: string,
    assetType: "logo" | "image",
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
  ) {
    const existing = getBrandKit(kitId);
    if (!existing) return null;
    const stored = writeAssetFile({
      bucket: "project-assets",
      buffer: fileBuffer,
      mimeType,
      fileName,
      scope: "brand-kit",
    });
    const assetId = randomUUID();
    const timestamp = nowIso();
    db.prepare(
      `
        INSERT INTO brand_kit_assets (
          id, kit_id, asset_type, display_name, role, sort_order, text_content, file_asset_id, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 0, NULL, ?, '{}', ?, ?)
      `,
    ).run(
      assetId,
      kitId,
      assetType,
      fileName.replace(/\.[^.]+$/, ""),
      stored.asset.id,
      timestamp,
      timestamp,
    );
    if (!existing.cover_url && assetType === "logo") {
      db.prepare(`UPDATE brand_kits SET cover_asset_id = ?, updated_at = ? WHERE id = ?`).run(
        stored.asset.id,
        timestamp,
        kitId,
      );
    }
    const detail = getBrandKit(kitId);
    return detail?.assets.find((asset) => asset.id === assetId) ?? null;
  }

  function mapSkillRow(row: {
    id: string;
    name: string;
    slug: string;
    description: string;
    author: string;
    version: string;
    category: SkillListItem["category"];
    icon_name: string | null;
    source: SkillListItem["source"];
    is_featured: number;
    metadata: string;
    installed: number;
    enabled: number;
    installed_at: string | null;
    created_at: string;
    updated_at: string;
  }): SkillListItem {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      author: row.author,
      version: row.version,
      category: row.category,
      iconName: row.icon_name,
      source: row.source,
      isFeatured: !!row.is_featured,
      metadata: parseJson(row.metadata, {}),
      installed: !!row.installed,
      enabled: !!row.enabled,
      installedAt: row.installed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function getSkillFiles(skillId: string): SkillFileEntry[] {
    const rows = db
      .prepare(
        `
          SELECT id, file_path, content, mime_type, created_at, updated_at
          FROM skill_files
          WHERE skill_id = ?
          ORDER BY created_at ASC
        `,
      )
      .all(skillId) as Array<{
      id: string;
      file_path: string;
      content: string;
      mime_type: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      content: row.content,
      mimeType: row.mime_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  function listInstalledSkills(): SkillListItem[] {
    const rows = db
      .prepare(
        `
          SELECT id, name, slug, description, author, version, category, icon_name,
            source, is_featured, metadata, installed, enabled, installed_at, created_at, updated_at
          FROM skills
          WHERE installed = 1
          ORDER BY updated_at DESC, name ASC
        `,
      )
      .all() as Array<{
      id: string;
      name: string;
      slug: string;
      description: string;
      author: string;
      version: string;
      category: SkillListItem["category"];
      icon_name: string | null;
      source: SkillListItem["source"];
      is_featured: number;
      metadata: string;
      installed: number;
      enabled: number;
      installed_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map(mapSkillRow);
  }

  function listCatalogSkills(): SkillListItem[] {
    const rows = db
      .prepare(
        `
          SELECT id, name, slug, description, author, version, category, icon_name,
            source, is_featured, metadata, installed, enabled, installed_at, created_at, updated_at
          FROM skills
          WHERE is_catalog = 1
          ORDER BY is_featured DESC, name ASC
        `,
      )
      .all() as Array<{
      id: string;
      name: string;
      slug: string;
      description: string;
      author: string;
      version: string;
      category: SkillListItem["category"];
      icon_name: string | null;
      source: SkillListItem["source"];
      is_featured: number;
      metadata: string;
      installed: number;
      enabled: number;
      installed_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map(mapSkillRow);
  }

  function getSkillDetail(skillId: string): SkillDetail | null {
    const row = db
      .prepare(
        `
          SELECT id, name, slug, description, author, version, category, icon_name,
            source, is_featured, metadata, license, skill_content, created_by,
            source_url, package_name, installed, enabled, installed_at, created_at, updated_at
          FROM skills
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(skillId) as
      | {
          id: string;
          name: string;
          slug: string;
          description: string;
          author: string;
          version: string;
          category: SkillListItem["category"];
          icon_name: string | null;
          source: SkillListItem["source"];
          is_featured: number;
          metadata: string;
          license: string | null;
          skill_content: string;
          created_by: string | null;
          source_url: string | null;
          package_name: string | null;
          installed: number;
          enabled: number;
          installed_at: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      ...mapSkillRow(row),
      license: row.license,
      skillContent: row.skill_content,
      createdBy: row.created_by,
      sourceUrl: row.source_url,
      packageName: row.package_name,
      files: getSkillFiles(skillId),
    };
  }

  function deriveSkillDescription(skillContent: string) {
    const match = /## Description\s+([\s\S]*?)(?:\n## |\n# |$)/i.exec(skillContent);
    return match?.[1]?.trim() || "Imported local skill.";
  }

  function deriveSkillName(skillContent: string, filePath: string) {
    const heading = /^#\s+(.+)$/m.exec(skillContent)?.[1]?.trim();
    if (heading) return heading;
    return filePath
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Imported Skill";
  }

  function insertSkillRecord(input: {
    name: string;
    description: string;
    category: SkillListItem["category"];
    skillContent: string;
    source: SkillListItem["source"];
    author: string;
    files?: Array<{ filePath: string; content: string; mimeType?: string }>;
    metadata?: Record<string, unknown>;
  }) {
    const timestamp = nowIso();
    const skillId = randomUUID();
    const slug = nextAvailableSlug(
      (
        db.prepare(`SELECT slug FROM skills WHERE slug = ? OR slug LIKE ?`).all(
          slugify(input.name),
          `${slugify(input.name)}-%`,
        ) as Array<{ slug: string }>
      ).map((row) => row.slug),
      slugify(input.name),
    );
    db.exec("BEGIN");
    try {
      db.prepare(
        `
          INSERT INTO skills (
            id, name, slug, description, author, version, category, icon_name,
            source, is_featured, metadata, license, skill_content, created_by,
            source_url, package_name, is_catalog, installed, enabled, installed_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, NULL, ?, 0, ?, 'Local', ?, ?, NULL, NULL, 0, 1, 1, ?, ?, ?)
        `,
      ).run(
        skillId,
        input.name.trim(),
        slug,
        input.description.trim(),
        input.author,
        input.category,
        input.source,
        JSON.stringify(input.metadata ?? {}),
        input.skillContent,
        input.author,
        timestamp,
        timestamp,
        timestamp,
      );

      for (const file of input.files ?? []) {
        db.prepare(
          `
            INSERT INTO skill_files (
              id, skill_id, file_path, content, mime_type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          randomUUID(),
          skillId,
          file.filePath,
          file.content,
          file.mimeType ?? "text/plain",
          timestamp,
          timestamp,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return getSkillDetail(skillId)!;
  }

  function createSkill(input: SkillCreateRequest) {
    return insertSkillRecord({
      name: input.name,
      description: input.description,
      category: input.category,
      skillContent: input.skillContent,
      source: "user",
      author: getProfile().displayName,
      ...(input.files
        ? {
            files: input.files.map((file) => ({
              filePath: file.filePath,
              content: file.content,
              ...(file.mimeType ? { mimeType: file.mimeType } : {}),
            })),
          }
        : {}),
      metadata: { origin: "created-local" },
    });
  }

  function importSkill(input: SkillImportRequest) {
    const normalizedFiles = input.files.map((file) => ({
      filePath: file.filePath.replace(/^\.?\//, ""),
      content: file.content,
      mimeType: file.mimeType ?? "text/plain",
    }));
    const skillFile =
      normalizedFiles.find((file) => /(^|\/)SKILL\.md$/i.test(file.filePath)) ??
      normalizedFiles[0];
    const skillContent = skillFile?.content?.trim();
    if (!skillFile || !skillContent) {
      return null;
    }
    return insertSkillRecord({
      name: input.name?.trim() || deriveSkillName(skillContent, skillFile.filePath),
      description:
        input.description?.trim() || deriveSkillDescription(skillContent),
      category: input.category ?? "custom",
      skillContent,
      source: "user",
      author: getProfile().displayName,
      files: normalizedFiles,
      metadata: {
        origin: "imported-local",
        importedFileCount: normalizedFiles.length,
      },
    });
  }

  function installCatalogSkill(skillId: string) {
    const row = db
      .prepare(`SELECT id FROM skills WHERE id = ? AND is_catalog = 1 LIMIT 1`)
      .get(skillId) as { id: string } | undefined;
    if (!row) return null;
    const timestamp = nowIso();
    db.prepare(
      `UPDATE skills SET installed = 1, enabled = 1, installed_at = COALESCE(installed_at, ?), updated_at = ? WHERE id = ?`,
    ).run(timestamp, timestamp, skillId);
    return getSkillDetail(skillId);
  }

  function toggleSkill(skillId: string, input: SkillToggleRequest) {
    const row = db
      .prepare(`SELECT id FROM skills WHERE id = ? AND installed = 1 LIMIT 1`)
      .get(skillId) as { id: string } | undefined;
    if (!row) return null;
    db.prepare(`UPDATE skills SET enabled = ?, updated_at = ? WHERE id = ?`).run(
      input.enabled ? 1 : 0,
      nowIso(),
      skillId,
    );
    return getSkillDetail(skillId);
  }

  function uninstallSkill(skillId: string) {
    const row = db
      .prepare(`SELECT id, is_catalog FROM skills WHERE id = ? LIMIT 1`)
      .get(skillId) as { id: string; is_catalog: number } | undefined;
    if (!row) return false;
    if (row.is_catalog) {
      db.prepare(
        `UPDATE skills SET installed = 0, enabled = 0, updated_at = ? WHERE id = ?`,
      ).run(nowIso(), skillId);
      return true;
    }
    db.prepare(`DELETE FROM skill_files WHERE skill_id = ?`).run(skillId);
    db.prepare(`DELETE FROM skills WHERE id = ?`).run(skillId);
    return true;
  }

  function listEnabledSkills(): SkillListItem[] {
    const rows = db
      .prepare(
        `
          SELECT id, name, slug, description, author, version, category, icon_name,
            source, is_featured, metadata, installed, enabled, installed_at, created_at, updated_at
          FROM skills
          WHERE installed = 1 AND enabled = 1
          ORDER BY updated_at DESC, name ASC
        `,
      )
      .all() as Array<{
      id: string;
      name: string;
      slug: string;
      description: string;
      author: string;
      version: string;
      category: SkillListItem["category"];
      icon_name: string | null;
      source: SkillListItem["source"];
      is_featured: number;
      metadata: string;
      installed: number;
      enabled: number;
      installed_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map(mapSkillRow);
  }

  function uploadFile(input: {
    bucket: AssetBucket;
    fileName: string;
    fileBuffer: Buffer;
    mimeType: string;
    projectId?: string;
  }) {
    return writeAssetFile({
      bucket: input.bucket,
      buffer: input.fileBuffer,
      mimeType: input.mimeType,
      fileName: input.fileName,
      scope: "upload",
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    });
  }

  function createGeneratedImage(prompt: string) {
    const escaped = prompt
      .slice(0, 180)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f5ede1"/>
            <stop offset="100%" stop-color="#e0eef8"/>
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg)" rx="48"/>
        <rect x="72" y="72" width="880" height="880" rx="36" fill="rgba(255,255,255,0.82)" stroke="rgba(15,23,42,0.08)"/>
        <text x="110" y="220" fill="#0f172a" font-size="48" font-family="Arial, sans-serif" font-weight="700">AI Media Canvas Local Preview</text>
        <text x="110" y="300" fill="#334155" font-size="28" font-family="Arial, sans-serif">Prompt</text>
        <foreignObject x="110" y="340" width="780" height="420">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 42px; line-height: 1.35; color: #0f172a;">
            ${escaped}
          </div>
        </foreignObject>
      </svg>
    `.trim();
    const stored = writeAssetFile({
      bucket: "project-assets",
      buffer: Buffer.from(svg, "utf-8"),
      mimeType: "image/svg+xml",
      fileName: "generated-image.svg",
      scope: "generated",
    });
    return {
      assetId: stored.asset.id,
      url: stored.url,
      mimeType: "image/svg+xml",
      width: 1024,
      height: 1024,
      prompt,
    };
  }

  function getAssetResponse(assetId: string) {
    const row = getAssetRow(assetId);
    if (!row) return null;
    return {
      filePath: row.file_path,
      mimeType: row.mime_type ?? "application/octet-stream",
      size: statSync(row.file_path).size,
    };
  }

  function resetAllData() {
    db.close();
    rmSync(dataRoot, { force: true, recursive: true });
  }

  return {
    assetBaseUrl: options.assetBaseUrl,
    dataRoot,
    localUser: {
      email: DEFAULT_EMAIL,
      id: LOCAL_USER_ID,
      userMetadata: { mode: "local" },
    },
    getViewer,
    updateProfile,
    listProjects,
    createProject,
    getProject,
    updateProject,
    archiveProject,
    saveProjectThumbnail,
    getCanvas,
    saveCanvas,
    listSessions,
    createSession,
    updateSessionTitle,
    deleteSession,
    listMessages,
    createMessage,
    listBrandKits,
    getBrandKit,
    createBrandKit,
    updateBrandKit,
    deleteBrandKit,
    duplicateBrandKit,
    createBrandKitAsset,
    updateBrandKitAsset,
    deleteBrandKitAsset,
    uploadBrandKitAsset,
    listInstalledSkills,
    listCatalogSkills,
    getSkillDetail,
    createSkill,
    importSkill,
    installCatalogSkill,
    toggleSkill,
    uninstallSkill,
    listEnabledSkills,
    uploadFile,
    getAssetUrl(assetId: string) {
      return resolveAssetUrl(assetId);
    },
    deleteAsset,
    createGeneratedImage,
    getAssetResponse,
    assetObjectFromId(assetId: string) {
      const row = getAssetRow(assetId);
      return row ? assetObjectFromRow(row) : null;
    },
    resetAllData,
  };
}
