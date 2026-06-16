import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type {
  AgentRuntimeProvider,
  AgentRunResumeMode,
  AssetBucket,
  AssetObject,
  BackgroundJob,
  BackgroundJobStatus,
  BackgroundJobType,
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
  ImageGenerationPayload,
  TuttiManagedConnection,
  TuttiManagedModel,
  TuttiManagedProviderId,
  ProjectCreateRequest,
  ProjectSummary,
  ProjectUpdateRequest,
  RuntimeKind,
  SkillCreateRequest,
  SkillDetail,
  SkillFileEntry,
  SkillImportRequest,
  SkillListItem,
  SkillToggleRequest,
  StreamEvent,
  VideoGenerationPayload,
  ViewerResponse,
  WorkspaceSettings,
} from "@aimc/shared";
import { getBundledSkills } from "./skill-catalog.js";

const LOCAL_USER_ID = "local-user";
const LOCAL_WORKSPACE_ID = "local-workspace";
const DEFAULT_PROJECT_NAME = "My First Project";
const DEFAULT_CANVAS_NAME = "Main Canvas";
const DEFAULT_EMAIL = "local@aimc.app";
const DEFAULT_DISPLAY_NAME = "Local User";
const DEFAULT_STALE_RUNNING_JOB_MS = 35 * 60 * 1_000;
const EMPTY_WORKSPACE_SETTINGS: WorkspaceSettings = {
  defaultModel: "",
  defaultModelSource: undefined,
  providerModels: {
    openai: [],
    anthropic: [],
    agnes: [],
    google: [],
    vertex: [],
  },
  openAIApiKey: "",
  openAIApiBase: "",
  anthropicApiKey: "",
  anthropicBaseUrl: "",
  agnesApiKey: "",
  agnesBaseUrl: "",
  agnesDefaultModel: "",
  googleApiKey: "",
  googleVertexProject: "",
  googleVertexLocation: "",
  googleVertexVideoLocation: "",
  replicateApiToken: "",
  kieApiKey: "",
  kieBaseUrl: "",
  volcesApiKey: "",
  volcesBaseUrl: "",
  codexImagegenDelegation: "ask",
};
const EMPTY_TUTTI_MANAGED_CONNECTION: TuttiManagedConnection = {
  connected: false,
  providers: [],
  models: [],
};

function normalizeProviderModelsForStore(
  providerModels: Partial<WorkspaceSettings["providerModels"]> | undefined,
): WorkspaceSettings["providerModels"] {
  return {
    openai: Array.isArray(providerModels?.openai) ? providerModels.openai : [],
    anthropic: Array.isArray(providerModels?.anthropic)
      ? providerModels.anthropic
      : [],
    agnes: Array.isArray(providerModels?.agnes) ? providerModels.agnes : [],
    google: Array.isArray(providerModels?.google) ? providerModels.google : [],
    vertex: Array.isArray(providerModels?.vertex) ? providerModels.vertex : [],
  };
}

function normalizeAgentModelSourceForStore(
  source: string | undefined,
): WorkspaceSettings["defaultModelSource"] | undefined {
  return source === "local-agent" ||
    source === "tutti-managed" ||
    source === "api-provider"
    ? source
    : undefined;
}

function normalizeCodexImagegenDelegationForStore(
  value: string | undefined,
): WorkspaceSettings["codexImagegenDelegation"] {
  return value === "always" || value === "never" ? value : "ask";
}

function normalizeTuttiManagedProviders(
  providers: readonly string[] | undefined,
): TuttiManagedProviderId[] {
  const supported = new Set(["agnes", "openai", "anthropic"]);
  const seen = new Set<string>();
  const normalized: TuttiManagedProviderId[] = [];

  for (const provider of providers ?? []) {
    const value = provider.trim();
    if (!supported.has(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value as TuttiManagedProviderId);
  }

  return normalized;
}

function normalizeTuttiManagedModels(
  models: readonly TuttiManagedModel[] | undefined,
): TuttiManagedModel[] {
  const seen = new Set<string>();
  const normalized: TuttiManagedModel[] = [];

  for (const model of models ?? []) {
    const provider = model.provider.trim();
    const id = model.id.trim();
    const name = model.name.trim() || id;
    if (!id) continue;
    const [normalizedProvider] = normalizeTuttiManagedProviders([provider]);
    if (!normalizedProvider) continue;
    const modelId = id.includes(":") ? id : `${normalizedProvider}:${id}`;
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    normalized.push({
      id: modelId,
      name,
      provider: normalizedProvider,
    });
  }

  return normalized;
}

function normalizeTuttiManagedConnection(
  connection: TuttiManagedConnection,
): TuttiManagedConnection {
  if (!connection.connected || !connection.grantRef?.trim()) {
    return { ...EMPTY_TUTTI_MANAGED_CONNECTION };
  }

  const models = normalizeTuttiManagedModels(connection.models);
  const providers = normalizeTuttiManagedProviders(
    connection.providers.length > 0
      ? connection.providers
      : models.map((model) => model.provider),
  );

  return {
    connected: true,
    grantRef: connection.grantRef.trim(),
    ...(connection.expiresAt ? { expiresAt: connection.expiresAt } : {}),
    providers,
    models,
  };
}

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

type BackgroundJobRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  canvas_id: string | null;
  session_id: string | null;
  thread_id: string | null;
  queue_name: string;
  job_type: BackgroundJobType;
  status: BackgroundJobStatus;
  payload: string;
  result: string | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  canceled_at: string | null;
  next_run_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  remote_provider: string | null;
  remote_task_id: string | null;
  remote_status: string | null;
  remote_updated_at: string | null;
};

type AgentRunStatus = "accepted" | "canceled" | "completed" | "failed" | "running";

type AgentRunEventRow = {
  created_at: string;
  event_id: string;
  payload: string;
  run_id: string;
  seq: number;
  type: string;
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
  let workspaceSettingsHasLegacyIdColumn = false;
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
    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY,
      default_model TEXT NOT NULL DEFAULT '',
      default_model_source TEXT,
      provider_models_json TEXT NOT NULL DEFAULT '{}',
      openai_api_key TEXT NOT NULL DEFAULT '',
      openai_api_base TEXT NOT NULL DEFAULT '',
      anthropic_api_key TEXT NOT NULL DEFAULT '',
      anthropic_base_url TEXT NOT NULL DEFAULT '',
      agnes_api_key TEXT NOT NULL DEFAULT '',
      agnes_base_url TEXT NOT NULL DEFAULT '',
      agnes_default_model TEXT NOT NULL DEFAULT '',
      google_api_key TEXT NOT NULL DEFAULT '',
      google_vertex_project TEXT NOT NULL DEFAULT '',
      google_vertex_location TEXT NOT NULL DEFAULT '',
      google_vertex_video_location TEXT NOT NULL DEFAULT '',
      replicate_api_token TEXT NOT NULL DEFAULT '',
      volces_api_key TEXT NOT NULL DEFAULT '',
      volces_base_url TEXT NOT NULL DEFAULT '',
      codex_imagegen_delegation TEXT NOT NULL DEFAULT 'ask'
    );
    CREATE TABLE IF NOT EXISTS tutti_managed_model_connection (
      workspace_id TEXT PRIMARY KEY,
      grant_ref TEXT NOT NULL,
      expires_at TEXT,
      providers_json TEXT NOT NULL DEFAULT '[]',
      models_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
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
      run_id TEXT,
      run_status TEXT,
      last_run_event_id TEXT,
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
    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      canvas_id TEXT,
      session_id TEXT,
      thread_id TEXT,
      queue_name TEXT NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      result TEXT,
      error_code TEXT,
      error_message TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      canceled_at TEXT,
      next_run_at TEXT,
      locked_at TEXT,
      locked_by TEXT,
      remote_provider TEXT,
      remote_task_id TEXT,
      remote_status TEXT,
      remote_updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_background_jobs_status_next_run
      ON background_jobs(status, next_run_at, created_at);
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      canvas_id TEXT,
      session_id TEXT NOT NULL,
      thread_id TEXT,
      model TEXT,
      runtime_kind TEXT,
      runtime_provider TEXT,
      previous_run_id TEXT,
      resume_mode TEXT,
      provider_session_id TEXT,
      resume_token TEXT,
      assistant_message_id TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      canceled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_session_created
      ON agent_runs(session_id, created_at);
    CREATE TABLE IF NOT EXISTS agent_run_events (
      run_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, event_id),
      UNIQUE (run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_seq
      ON agent_run_events(run_id, seq);
  `);

  ensureWorkspaceSettingsSchema();
  ensureAgentRunSchema();
  ensureBackgroundJobSchema();
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
    db.prepare(
      `
        INSERT OR IGNORE INTO workspace_settings (
          workspace_id,
          default_model,
          default_model_source,
          provider_models_json,
          openai_api_key,
          openai_api_base,
          anthropic_api_key,
          anthropic_base_url,
          agnes_api_key,
          agnes_base_url,
          agnes_default_model,
          google_api_key,
          google_vertex_project,
          google_vertex_location,
          google_vertex_video_location,
          replicate_api_token,
          kie_api_key,
          kie_base_url,
          volces_api_key,
          volces_base_url
        ) VALUES (?, '', NULL, '{}', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')
      `,
    ).run(LOCAL_WORKSPACE_ID);
  }

  function ensureWorkspaceSettingsSchema() {
    const columns = db
      .prepare(`PRAGMA table_info(workspace_settings)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    workspaceSettingsHasLegacyIdColumn = columnNames.has("id");

    if (!columnNames.has("workspace_id")) {
      db.exec(
        `ALTER TABLE workspace_settings ADD COLUMN workspace_id TEXT`,
      );
      db.prepare(
        `UPDATE workspace_settings SET workspace_id = ? WHERE workspace_id IS NULL`,
      ).run(LOCAL_WORKSPACE_ID);
      columnNames.add("workspace_id");
    }

    const missingColumns: Array<[string, string]> = [
      ["default_model_source", "TEXT"],
      ["provider_models_json", "TEXT NOT NULL DEFAULT '{}'"],
      ["openai_api_key", "TEXT NOT NULL DEFAULT ''"],
      ["openai_api_base", "TEXT NOT NULL DEFAULT ''"],
      ["anthropic_api_key", "TEXT NOT NULL DEFAULT ''"],
      ["anthropic_base_url", "TEXT NOT NULL DEFAULT ''"],
      ["agnes_api_key", "TEXT NOT NULL DEFAULT ''"],
      ["agnes_base_url", "TEXT NOT NULL DEFAULT ''"],
      ["agnes_default_model", "TEXT NOT NULL DEFAULT ''"],
      ["google_api_key", "TEXT NOT NULL DEFAULT ''"],
      ["google_vertex_project", "TEXT NOT NULL DEFAULT ''"],
      ["google_vertex_location", "TEXT NOT NULL DEFAULT ''"],
      ["google_vertex_video_location", "TEXT NOT NULL DEFAULT ''"],
      ["replicate_api_token", "TEXT NOT NULL DEFAULT ''"],
      ["kie_api_key", "TEXT NOT NULL DEFAULT ''"],
      ["kie_base_url", "TEXT NOT NULL DEFAULT ''"],
      ["volces_api_key", "TEXT NOT NULL DEFAULT ''"],
      ["volces_base_url", "TEXT NOT NULL DEFAULT ''"],
      ["codex_imagegen_delegation", "TEXT NOT NULL DEFAULT 'ask'"],
    ];

    for (const [columnName, columnSql] of missingColumns) {
      if (columnNames.has(columnName)) continue;
      db.exec(
        `ALTER TABLE workspace_settings ADD COLUMN ${columnName} ${columnSql}`,
      );
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_settings_workspace_id
      ON workspace_settings(workspace_id)
    `);
  }

  function ensureAgentRunSchema() {
    const messageColumns = db
      .prepare(`PRAGMA table_info(chat_messages)`)
      .all() as Array<{ name: string }>;
    const messageColumnNames = new Set(
      messageColumns.map((column) => column.name),
    );

    if (!messageColumnNames.has("run_id")) {
      db.exec(`ALTER TABLE chat_messages ADD COLUMN run_id TEXT`);
    }

    if (!messageColumnNames.has("run_status")) {
      db.exec(`ALTER TABLE chat_messages ADD COLUMN run_status TEXT`);
    }

    if (!messageColumnNames.has("last_run_event_id")) {
      db.exec(`ALTER TABLE chat_messages ADD COLUMN last_run_event_id TEXT`);
    }

    const columns = db
      .prepare(`PRAGMA table_info(agent_runs)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("runtime_kind")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN runtime_kind TEXT`);
    }

    if (!columnNames.has("runtime_provider")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN runtime_provider TEXT`);
    }

    if (!columnNames.has("assistant_message_id")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN assistant_message_id TEXT`);
    }

    if (!columnNames.has("previous_run_id")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN previous_run_id TEXT`);
    }

    if (!columnNames.has("resume_mode")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN resume_mode TEXT`);
    }

    if (!columnNames.has("provider_session_id")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN provider_session_id TEXT`);
    }

    if (!columnNames.has("resume_token")) {
      db.exec(`ALTER TABLE agent_runs ADD COLUMN resume_token TEXT`);
    }

    const eventColumns = db
      .prepare(`PRAGMA table_info(agent_run_events)`)
      .all() as Array<{ name: string }>;
    const eventColumnNames = new Set(eventColumns.map((column) => column.name));

    if (!eventColumnNames.has("canvas_id")) {
      db.exec(`ALTER TABLE agent_run_events ADD COLUMN canvas_id TEXT`);
    }

    if (!eventColumnNames.has("canvas_seq")) {
      db.exec(`ALTER TABLE agent_run_events ADD COLUMN canvas_seq INTEGER`);
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_events_canvas_seq
        ON agent_run_events(canvas_id, canvas_seq)
        WHERE canvas_id IS NOT NULL AND canvas_seq IS NOT NULL;
    `);
  }

  function ensureBackgroundJobSchema() {
    const columns = db
      .prepare(`PRAGMA table_info(background_jobs)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    const missingColumns: Array<[string, string]> = [
      ["remote_provider", "TEXT"],
      ["remote_task_id", "TEXT"],
      ["remote_status", "TEXT"],
      ["remote_updated_at", "TEXT"],
    ];

    for (const [columnName, columnSql] of missingColumns) {
      if (columnNames.has(columnName)) continue;
      db.exec(
        `ALTER TABLE background_jobs ADD COLUMN ${columnName} ${columnSql}`,
      );
    }
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

  function getWorkspaceSettings(): WorkspaceSettings {
    const row = db
      .prepare(
        `
          SELECT
            default_model,
            default_model_source,
            provider_models_json,
            openai_api_key,
            openai_api_base,
            anthropic_api_key,
            anthropic_base_url,
            agnes_api_key,
            agnes_base_url,
            agnes_default_model,
            google_api_key,
            google_vertex_project,
            google_vertex_location,
            google_vertex_video_location,
            replicate_api_token,
            kie_api_key,
            kie_base_url,
            volces_api_key,
            volces_base_url,
            codex_imagegen_delegation
          FROM workspace_settings
          WHERE workspace_id = ?
        `,
      )
      .get(LOCAL_WORKSPACE_ID) as
      | {
          default_model: string;
          default_model_source: string | null;
          provider_models_json: string;
          openai_api_key: string;
          openai_api_base: string;
          anthropic_api_key: string;
          anthropic_base_url: string;
          agnes_api_key: string;
          agnes_base_url: string;
          agnes_default_model: string;
          google_api_key: string;
          google_vertex_project: string;
          google_vertex_location: string;
          google_vertex_video_location: string;
          replicate_api_token: string;
          kie_api_key: string;
          kie_base_url: string;
          volces_api_key: string;
          volces_base_url: string;
          codex_imagegen_delegation: string;
        }
      | undefined;

    if (!row) {
      return { ...EMPTY_WORKSPACE_SETTINGS };
    }

    let providerModels = { ...EMPTY_WORKSPACE_SETTINGS.providerModels };
    try {
      const parsed = JSON.parse(row.provider_models_json ?? "{}") as Partial<
        WorkspaceSettings["providerModels"]
      >;
      providerModels = {
        openai: Array.isArray(parsed.openai)
          ? parsed.openai.filter((value): value is string => typeof value === "string")
          : [],
        anthropic: Array.isArray(parsed.anthropic)
          ? parsed.anthropic.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        agnes: Array.isArray(parsed.agnes)
          ? parsed.agnes.filter((value): value is string => typeof value === "string")
          : [],
        google: Array.isArray(parsed.google)
          ? parsed.google.filter((value): value is string => typeof value === "string")
          : [],
        vertex: Array.isArray(parsed.vertex)
          ? parsed.vertex.filter((value): value is string => typeof value === "string")
          : [],
      };
    } catch {
      providerModels = { ...EMPTY_WORKSPACE_SETTINGS.providerModels };
    }

    return {
      defaultModel: row.default_model ?? "",
      defaultModelSource: normalizeAgentModelSourceForStore(
        row.default_model_source ?? undefined,
      ),
      providerModels,
      openAIApiKey: row.openai_api_key ?? "",
      openAIApiBase: row.openai_api_base ?? "",
      anthropicApiKey: row.anthropic_api_key ?? "",
      anthropicBaseUrl: row.anthropic_base_url ?? "",
      agnesApiKey: row.agnes_api_key ?? "",
      agnesBaseUrl: row.agnes_base_url ?? "",
      agnesDefaultModel: row.agnes_default_model ?? "",
      googleApiKey: row.google_api_key ?? "",
      googleVertexProject: row.google_vertex_project ?? "",
      googleVertexLocation: row.google_vertex_location ?? "",
      googleVertexVideoLocation: row.google_vertex_video_location ?? "",
      replicateApiToken: row.replicate_api_token ?? "",
      kieApiKey: row.kie_api_key ?? "",
      kieBaseUrl: row.kie_base_url ?? "",
      volcesApiKey: row.volces_api_key ?? "",
      volcesBaseUrl: row.volces_base_url ?? "",
      codexImagegenDelegation: normalizeCodexImagegenDelegationForStore(
        row.codex_imagegen_delegation ?? undefined,
      ),
    };
  }

  function updateWorkspaceSettings(
    settings: WorkspaceSettings,
  ): WorkspaceSettings {
    const normalizedSettings: WorkspaceSettings = {
      ...EMPTY_WORKSPACE_SETTINGS,
      ...settings,
      defaultModelSource: settings.defaultModel
        ? normalizeAgentModelSourceForStore(settings.defaultModelSource)
        : undefined,
      providerModels: normalizeProviderModelsForStore(settings.providerModels),
      codexImagegenDelegation: normalizeCodexImagegenDelegationForStore(
        settings.codexImagegenDelegation,
      ),
    };

    if (workspaceSettingsHasLegacyIdColumn) {
      db.prepare(
        `
          INSERT INTO workspace_settings (
            id,
            workspace_id,
            default_model,
            default_model_source,
            provider_models_json,
            openai_api_key,
            openai_api_base,
            anthropic_api_key,
            anthropic_base_url,
            agnes_api_key,
            agnes_base_url,
            agnes_default_model,
            google_api_key,
            google_vertex_project,
            google_vertex_location,
            google_vertex_video_location,
            replicate_api_token,
            kie_api_key,
            kie_base_url,
            volces_api_key,
            volces_base_url,
            codex_imagegen_delegation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            default_model = excluded.default_model,
            default_model_source = excluded.default_model_source,
            provider_models_json = excluded.provider_models_json,
            openai_api_key = excluded.openai_api_key,
            openai_api_base = excluded.openai_api_base,
            anthropic_api_key = excluded.anthropic_api_key,
            anthropic_base_url = excluded.anthropic_base_url,
            agnes_api_key = excluded.agnes_api_key,
            agnes_base_url = excluded.agnes_base_url,
            agnes_default_model = excluded.agnes_default_model,
            google_api_key = excluded.google_api_key,
            google_vertex_project = excluded.google_vertex_project,
            google_vertex_location = excluded.google_vertex_location,
            google_vertex_video_location = excluded.google_vertex_video_location,
            replicate_api_token = excluded.replicate_api_token,
            kie_api_key = excluded.kie_api_key,
            kie_base_url = excluded.kie_base_url,
            volces_api_key = excluded.volces_api_key,
            volces_base_url = excluded.volces_base_url,
            codex_imagegen_delegation = excluded.codex_imagegen_delegation
        `,
      ).run(
        1,
        LOCAL_WORKSPACE_ID,
        normalizedSettings.defaultModel,
        normalizedSettings.defaultModelSource ?? null,
        JSON.stringify(normalizedSettings.providerModels),
        normalizedSettings.openAIApiKey,
        normalizedSettings.openAIApiBase,
        normalizedSettings.anthropicApiKey,
        normalizedSettings.anthropicBaseUrl,
        normalizedSettings.agnesApiKey,
        normalizedSettings.agnesBaseUrl,
        normalizedSettings.agnesDefaultModel,
        normalizedSettings.googleApiKey,
        normalizedSettings.googleVertexProject,
        normalizedSettings.googleVertexLocation,
        normalizedSettings.googleVertexVideoLocation,
        normalizedSettings.replicateApiToken,
        normalizedSettings.kieApiKey,
        normalizedSettings.kieBaseUrl,
        normalizedSettings.volcesApiKey,
        normalizedSettings.volcesBaseUrl,
        normalizedSettings.codexImagegenDelegation,
      );
    } else {
      db.prepare(
        `
          INSERT INTO workspace_settings (
            workspace_id,
            default_model,
            default_model_source,
            provider_models_json,
            openai_api_key,
            openai_api_base,
            anthropic_api_key,
            anthropic_base_url,
            agnes_api_key,
            agnes_base_url,
            agnes_default_model,
            google_api_key,
            google_vertex_project,
            google_vertex_location,
            google_vertex_video_location,
            replicate_api_token,
            kie_api_key,
            kie_base_url,
            volces_api_key,
            volces_base_url,
            codex_imagegen_delegation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(workspace_id) DO UPDATE SET
            default_model = excluded.default_model,
            default_model_source = excluded.default_model_source,
            provider_models_json = excluded.provider_models_json,
            openai_api_key = excluded.openai_api_key,
            openai_api_base = excluded.openai_api_base,
            anthropic_api_key = excluded.anthropic_api_key,
            anthropic_base_url = excluded.anthropic_base_url,
            agnes_api_key = excluded.agnes_api_key,
            agnes_base_url = excluded.agnes_base_url,
            agnes_default_model = excluded.agnes_default_model,
            google_api_key = excluded.google_api_key,
            google_vertex_project = excluded.google_vertex_project,
            google_vertex_location = excluded.google_vertex_location,
            google_vertex_video_location = excluded.google_vertex_video_location,
            replicate_api_token = excluded.replicate_api_token,
            kie_api_key = excluded.kie_api_key,
            kie_base_url = excluded.kie_base_url,
            volces_api_key = excluded.volces_api_key,
            volces_base_url = excluded.volces_base_url,
            codex_imagegen_delegation = excluded.codex_imagegen_delegation
        `,
      ).run(
        LOCAL_WORKSPACE_ID,
        normalizedSettings.defaultModel,
        normalizedSettings.defaultModelSource ?? null,
        JSON.stringify(normalizedSettings.providerModels),
        normalizedSettings.openAIApiKey,
        normalizedSettings.openAIApiBase,
        normalizedSettings.anthropicApiKey,
        normalizedSettings.anthropicBaseUrl,
        normalizedSettings.agnesApiKey,
        normalizedSettings.agnesBaseUrl,
        normalizedSettings.agnesDefaultModel,
        normalizedSettings.googleApiKey,
        normalizedSettings.googleVertexProject,
        normalizedSettings.googleVertexLocation,
        normalizedSettings.googleVertexVideoLocation,
        normalizedSettings.replicateApiToken,
        normalizedSettings.kieApiKey,
        normalizedSettings.kieBaseUrl,
        normalizedSettings.volcesApiKey,
        normalizedSettings.volcesBaseUrl,
        normalizedSettings.codexImagegenDelegation,
      );
    }

    return getWorkspaceSettings();
  }

  function getTuttiManagedConnection(): TuttiManagedConnection {
    const row = db
      .prepare(
        `
          SELECT grant_ref, expires_at, providers_json, models_json
          FROM tutti_managed_model_connection
          WHERE workspace_id = ?
        `,
      )
      .get(LOCAL_WORKSPACE_ID) as
      | {
          grant_ref: string;
          expires_at: string | null;
          providers_json: string;
          models_json: string;
        }
      | undefined;

    if (!row) {
      return { ...EMPTY_TUTTI_MANAGED_CONNECTION };
    }

    return normalizeTuttiManagedConnection({
      connected: true,
      grantRef: row.grant_ref,
      ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
      providers: parseJson<TuttiManagedProviderId[]>(
        row.providers_json,
        [],
      ),
      models: parseJson<TuttiManagedModel[]>(row.models_json, []),
    });
  }

  function updateTuttiManagedConnection(
    connection: TuttiManagedConnection,
  ): TuttiManagedConnection {
    const normalized = normalizeTuttiManagedConnection(connection);
    if (!normalized.connected || !normalized.grantRef) {
      clearTuttiManagedConnection();
      return { ...EMPTY_TUTTI_MANAGED_CONNECTION };
    }

    db.prepare(
      `
        INSERT INTO tutti_managed_model_connection (
          workspace_id,
          grant_ref,
          expires_at,
          providers_json,
          models_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          grant_ref = excluded.grant_ref,
          expires_at = excluded.expires_at,
          providers_json = excluded.providers_json,
          models_json = excluded.models_json,
          updated_at = excluded.updated_at
      `,
    ).run(
      LOCAL_WORKSPACE_ID,
      normalized.grantRef,
      normalized.expiresAt ?? null,
      JSON.stringify(normalized.providers),
      JSON.stringify(normalized.models),
      new Date().toISOString(),
    );

    return getTuttiManagedConnection();
  }

  function clearTuttiManagedConnection() {
    db.prepare(
      `
        DELETE FROM tutti_managed_model_connection
        WHERE workspace_id = ?
      `,
    ).run(LOCAL_WORKSPACE_ID);
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

  function mapBackgroundJobRow(row: BackgroundJobRow): BackgroundJob {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      project_id: row.project_id,
      canvas_id: row.canvas_id,
      session_id: row.session_id,
      thread_id: row.thread_id,
      queue_name: row.queue_name,
      job_type: row.job_type,
      status: row.status,
      payload: parseJson(row.payload, {}),
      result: parseJson(row.result, null),
      error_code: row.error_code,
      error_message: row.error_message,
      attempt_count: row.attempt_count,
      max_attempts: row.max_attempts,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      failed_at: row.failed_at,
      canceled_at: row.canceled_at,
      remote_provider: row.remote_provider,
      remote_task_id: row.remote_task_id,
      remote_status: row.remote_status,
      remote_updated_at: row.remote_updated_at,
    };
  }

  function getBackgroundJobRow(jobId: string) {
    return db
      .prepare(
        `
          SELECT id, workspace_id, project_id, canvas_id, session_id, thread_id,
            queue_name, job_type, status, payload, result, error_code, error_message,
            attempt_count, max_attempts, created_by, created_at, updated_at,
            started_at, completed_at, failed_at, canceled_at, next_run_at, locked_at, locked_by,
            remote_provider, remote_task_id, remote_status, remote_updated_at
          FROM background_jobs
          WHERE id = ?
        `,
      )
      .get(jobId) as BackgroundJobRow | undefined;
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
    const timestamp = nowIso();
    const activeRuns = db
      .prepare(
        `
          SELECT id, canvas_id
          FROM agent_runs
          WHERE session_id = ?
            AND status IN ('accepted', 'running')
        `,
      )
      .all(sessionId) as Array<{
        canvas_id: string | null;
        id: string;
      }>;

    for (const run of activeRuns) {
      updateAgentRun({
        runId: run.id,
        status: "canceled",
      });
      appendAgentRunEvent({
        ...(run.canvas_id ? { canvasId: run.canvas_id } : {}),
        runId: run.id,
        event: {
          type: "run.canceled",
          runId: run.id,
          timestamp,
        },
      });
    }

    db.prepare(
      `
        UPDATE background_jobs
        SET status = 'canceled',
            updated_at = ?,
            canceled_at = ?,
            locked_at = NULL,
            locked_by = NULL
        WHERE session_id = ?
          AND status IN ('queued', 'running', 'failed')
      `,
    ).run(timestamp, timestamp, sessionId);

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

  function createMessage(
    sessionId: string,
    input: ChatMessageCreateRequest,
    messageId?: string,
  ): ChatMessage | null {
    if (!hasSession(sessionId)) return null;
    const id = messageId ?? randomUUID();
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

  function updateMessage(
    messageId: string,
    input: ChatMessageCreateRequest,
  ): ChatMessage | null {
    const row = db
      .prepare(
        `
          SELECT session_id, created_at
          FROM chat_messages
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(messageId) as
      | {
          created_at: string;
          session_id: string;
        }
      | undefined;
    if (!row) return null;

    const timestamp = nowIso();
    db.prepare(
      `
        UPDATE chat_messages
        SET role = ?,
            content = ?,
            content_blocks = ?
        WHERE id = ?
      `,
    ).run(
      input.role,
      input.content,
      input.contentBlocks ? JSON.stringify(input.contentBlocks) : null,
      messageId,
    );
    db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(
      timestamp,
      row.session_id,
    );

    return {
      id: messageId,
      role: input.role,
      content: input.content,
      toolActivities: input.toolActivities ?? null,
      contentBlocks: input.contentBlocks ?? null,
      createdAt: row.created_at,
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
    const frontmatter = parseSkillFrontmatter(skillContent);
    if (frontmatter.description) return frontmatter.description;
    const match = /## Description\s+([\s\S]*?)(?:\n## |\n# |$)/i.exec(skillContent);
    return match?.[1]?.trim() || "Imported local skill.";
  }

  function deriveSkillName(skillContent: string, filePath: string) {
    const frontmatter = parseSkillFrontmatter(skillContent);
    if (frontmatter.name) return frontmatter.name;
    const heading = /^#\s+(.+)$/m.exec(skillContent)?.[1]?.trim();
    if (heading) return heading;
    const parts = filePath.split("/").filter(Boolean);
    const basename = parts.at(-1) ?? filePath;
    if (/^SKILL\.md$/i.test(basename) && parts.length > 1) {
      return titleCaseSkillName(parts.at(-2) ?? "Imported Skill");
    }
    return filePath
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Imported Skill";
  }

  function parseSkillFrontmatter(skillContent: string) {
    const lines = skillContent.trimStart().split(/\r?\n/);
    const metadata: Record<string, string> = {};
    let index = lines[0]?.trim() === "---" ? 1 : 0;

    for (; index < lines.length; index++) {
      const line = lines[index];
      if (!line) break;
      const trimmed = line.trim();
      if (!trimmed || trimmed === "---" || trimmed.startsWith("#")) break;
      const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(trimmed);
      if (!match) break;
      metadata[match[1]!.toLowerCase()] = stripYamlScalar(match[2] ?? "");
    }

    return metadata;
  }

  function stripYamlScalar(value: string) {
    const trimmed = value.trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
    return (quoted?.[2] ?? trimmed).trim();
  }

  function titleCaseSkillName(value: string) {
    return (
      value
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()) || "Imported Skill"
    );
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

  function createAgentRun(input: {
    assistantMessageId?: string;
    canvasId?: string;
    model?: string;
    previousRunId?: string;
    resumeMode?: Exclude<AgentRunResumeMode, "auto">;
    runtimeKind?: RuntimeKind;
    runtimeProvider?: AgentRuntimeProvider;
    runId: string;
    sessionId: string;
    threadId?: string;
  }) {
    const timestamp = nowIso();
    db.prepare(
      `
        INSERT INTO agent_runs (
          id, workspace_id, canvas_id, session_id, thread_id, model,
          runtime_kind, runtime_provider, previous_run_id, resume_mode,
          assistant_message_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.runId,
      LOCAL_WORKSPACE_ID,
      input.canvasId ?? null,
      input.sessionId,
      input.threadId ?? null,
      input.model ?? null,
      input.runtimeKind ?? null,
      input.runtimeProvider ?? null,
      input.previousRunId ?? null,
      input.resumeMode ?? null,
      input.assistantMessageId ?? null,
      "accepted",
      timestamp,
      timestamp,
    );
    if (input.assistantMessageId) {
      db.prepare(
        `
          UPDATE chat_messages
          SET run_id = ?,
              run_status = ?
          WHERE id = ?
        `,
      ).run(input.runId, "accepted", input.assistantMessageId);
    }
  }

  function updateAgentRun(input: {
    assistantMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    providerSessionId?: string;
    runId: string;
    resumeToken?: string;
    runtimeKind?: RuntimeKind;
    runtimeProvider?: AgentRuntimeProvider;
    status: AgentRunStatus;
  }) {
    const timestamp = nowIso();
    db.prepare(
      `
        UPDATE agent_runs
        SET status = ?,
            updated_at = ?,
            runtime_kind = COALESCE(?, runtime_kind),
            runtime_provider = COALESCE(?, runtime_provider),
            provider_session_id = COALESCE(?, provider_session_id),
            resume_token = COALESCE(?, resume_token),
            assistant_message_id = COALESCE(?, assistant_message_id),
            started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN ? ELSE started_at END,
            completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END,
            canceled_at = CASE WHEN ? = 'canceled' THEN ? ELSE canceled_at END,
            error_code = CASE WHEN ? = 'failed' THEN ? ELSE error_code END,
            error_message = CASE WHEN ? = 'failed' THEN ? ELSE error_message END
        WHERE id = ?
      `,
    ).run(
      input.status,
      timestamp,
      input.runtimeKind ?? null,
      input.runtimeProvider ?? null,
      input.providerSessionId ?? null,
      input.resumeToken ?? null,
      input.assistantMessageId ?? null,
      input.status,
      timestamp,
      input.status,
      timestamp,
      input.status,
      timestamp,
      input.status,
      input.errorCode ?? "run_failed",
      input.status,
      input.errorMessage ?? null,
      input.runId,
    );
    const run = getAgentRun(input.runId);
    const assistantMessageId = input.assistantMessageId ?? run?.assistant_message_id;
    if (assistantMessageId) {
      db.prepare(
        `
          UPDATE chat_messages
          SET run_id = COALESCE(run_id, ?),
              run_status = ?
          WHERE id = ?
        `,
      ).run(input.runId, input.status, assistantMessageId);
    }
  }

  function getAgentRun(runId: string) {
    return db
      .prepare(
        `
          SELECT id, session_id, status, runtime_kind, runtime_provider,
                 previous_run_id, resume_mode, assistant_message_id,
                 provider_session_id, resume_token, error_code, error_message
          FROM agent_runs
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(runId) as
      | {
          assistant_message_id: string | null;
          error_code: string | null;
          error_message: string | null;
          id: string;
          previous_run_id: string | null;
          provider_session_id: string | null;
          resume_mode: Exclude<AgentRunResumeMode, "auto"> | null;
          resume_token: string | null;
          runtime_kind: RuntimeKind | null;
          runtime_provider: AgentRuntimeProvider | null;
          session_id: string;
          status: AgentRunStatus;
        }
      | undefined;
  }

  function getActiveAgentRun(canvasId: string, sessionId: string) {
    return db
      .prepare(
        `
          SELECT id, session_id, status, runtime_kind, runtime_provider,
                 previous_run_id, resume_mode, assistant_message_id,
                 provider_session_id, resume_token, error_code, error_message
          FROM agent_runs
          WHERE canvas_id = ?
            AND session_id = ?
            AND status IN ('accepted', 'running')
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `,
      )
      .get(canvasId, sessionId) as
      | {
          assistant_message_id: string | null;
          error_code: string | null;
          error_message: string | null;
          id: string;
          previous_run_id: string | null;
          provider_session_id: string | null;
          resume_mode: Exclude<AgentRunResumeMode, "auto"> | null;
          resume_token: string | null;
          runtime_kind: RuntimeKind | null;
          runtime_provider: AgentRuntimeProvider | null;
          session_id: string;
          status: AgentRunStatus;
        }
      | undefined;
  }

  function appendAgentRunEvent(input: {
    canvasId?: string;
    event: StreamEvent;
    runId: string;
  }) {
    const existingTerminal = db
      .prepare(
        `
          SELECT event_id, seq, canvas_seq
          FROM agent_run_events
          WHERE run_id = ?
            AND type IN ('run.completed', 'run.failed', 'run.canceled')
          ORDER BY seq ASC
          LIMIT 1
        `,
      )
      .get(input.runId) as
      | { canvas_seq: number | null; event_id: string; seq: number }
      | undefined;

    if (existingTerminal) {
      return {
        ...(existingTerminal.canvas_seq != null
          ? { canvasSeq: existingTerminal.canvas_seq }
          : {}),
        duplicate: true,
        eventId: existingTerminal.event_id,
        seq: existingTerminal.seq,
      };
    }

    const current = db
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS max_seq FROM agent_run_events WHERE run_id = ?`)
      .get(input.runId) as { max_seq: number | null };
    const nextSeq = (current.max_seq ?? 0) + 1;
    const nextCanvasSeq = input.canvasId
      ? ((db
          .prepare(
            `SELECT COALESCE(MAX(canvas_seq), 0) AS max_seq FROM agent_run_events WHERE canvas_id = ?`,
          )
          .get(input.canvasId) as { max_seq: number | null }).max_seq ?? 0) + 1
      : null;
    const timestamp = nowIso();
    const eventId = `${input.runId}:${nextSeq}`;
    db.prepare(
      `
        INSERT INTO agent_run_events (
          run_id, event_id, seq, canvas_id, canvas_seq, type, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.runId,
      eventId,
      nextSeq,
      input.canvasId ?? null,
      nextCanvasSeq,
      input.event.type,
      JSON.stringify(input.event),
      timestamp,
    );
    db.prepare(
      `
        UPDATE chat_messages
        SET last_run_event_id = ?,
            run_status = CASE
              WHEN ? = 'run.completed' THEN 'completed'
              WHEN ? = 'run.failed' THEN 'failed'
              WHEN ? = 'run.canceled' THEN 'canceled'
              WHEN run_status IS NULL THEN 'running'
              ELSE run_status
            END
        WHERE run_id = ?
      `,
    ).run(eventId, input.event.type, input.event.type, input.event.type, input.runId);
    return {
      ...(input.canvasId && nextCanvasSeq != null ? { canvasSeq: nextCanvasSeq } : {}),
      eventId,
      seq: nextSeq,
    };
  }

  function listAgentRunEvents(runId: string, cursor = 0) {
    const rows = db
      .prepare(
        `
          SELECT run_id, event_id, seq, type, payload, created_at
          FROM agent_run_events
          WHERE run_id = ? AND seq > ?
          ORDER BY seq ASC
        `,
      )
      .all(runId, cursor) as AgentRunEventRow[];
    return rows.map((row) => ({
      createdAt: row.created_at,
      event: parseJson<StreamEvent>(row.payload, {
        type: "run.failed",
        runId,
        error: {
          code: "run_failed",
          message: "Unable to decode persisted agent event.",
        },
        timestamp: row.created_at,
      }),
      eventId: row.event_id,
      seq: row.seq,
      type: row.type,
    }));
  }

  function getLatestCanvasEventSeq(canvasId: string) {
    const row = db
      .prepare(
        `SELECT COALESCE(MAX(canvas_seq), 0) AS max_seq FROM agent_run_events WHERE canvas_id = ?`,
      )
      .get(canvasId) as { max_seq: number | null };
    return row.max_seq ?? 0;
  }

  function listCanvasAgentEvents(canvasId: string, cursor = 0) {
    const rows = db
      .prepare(
        `
          SELECT run_id, event_id, seq, canvas_seq, type, payload, created_at
          FROM agent_run_events
          WHERE canvas_id = ? AND canvas_seq > ?
          ORDER BY canvas_seq ASC
        `,
      )
      .all(canvasId, cursor) as Array<
        AgentRunEventRow & {
          canvas_seq: number | null;
        }
      >;
    return rows.map((row) => ({
      createdAt: row.created_at,
      event: parseJson<StreamEvent>(row.payload, {
        type: "run.failed",
        runId: row.run_id,
        error: {
          code: "run_failed",
          message: "Unable to decode persisted canvas event.",
        },
        timestamp: row.created_at,
      }),
      eventId: row.event_id,
      runId: row.run_id,
      seq: row.seq,
      canvasSeq: row.canvas_seq ?? 0,
      type: row.type,
    }));
  }

  function recoverInterruptedAgentRuns(message = "Server restarted during an active agent run.") {
    const interruptedRuns = db
      .prepare(
        `
          SELECT id, canvas_id
          FROM agent_runs
          WHERE status IN ('accepted', 'running')
        `,
      )
      .all() as Array<{
        canvas_id: string | null;
        id: string;
      }>;

    for (const run of interruptedRuns) {
      updateAgentRun({
        runId: run.id,
        status: "failed",
        errorCode: "run_failed",
        errorMessage: message,
      });

      const lastEvent = db
        .prepare(
          `
            SELECT type
            FROM agent_run_events
            WHERE run_id = ?
            ORDER BY seq DESC
            LIMIT 1
          `,
        )
        .get(run.id) as { type: string } | undefined;
      if (lastEvent && ["run.completed", "run.failed", "run.canceled"].includes(lastEvent.type)) {
        continue;
      }

      appendAgentRunEvent({
        ...(run.canvas_id ? { canvasId: run.canvas_id } : {}),
        runId: run.id,
        event: {
          type: "run.failed",
          runId: run.id,
          error: {
            code: "run_failed",
            message,
          },
          timestamp: nowIso(),
        },
      });
    }

    return interruptedRuns.length;
  }

  function createBackgroundJob(input: {
    jobType: BackgroundJobType;
    queueName: string;
    payload: ImageGenerationPayload | VideoGenerationPayload;
    projectId?: string;
    canvasId?: string;
    sessionId?: string;
    threadId?: string;
    maxAttempts?: number;
  }) {
    const id = randomUUID();
    const createdAt = nowIso();
    db.prepare(
      `
        INSERT INTO background_jobs (
          id, workspace_id, project_id, canvas_id, session_id, thread_id,
          queue_name, job_type, status, payload, attempt_count, max_attempts,
          created_by, created_at, updated_at, next_run_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      LOCAL_WORKSPACE_ID,
      input.projectId ?? null,
      input.canvasId ?? null,
      input.sessionId ?? null,
      input.threadId ?? null,
      input.queueName,
      input.jobType,
      "queued",
      JSON.stringify(input.payload),
      0,
      input.maxAttempts ?? 3,
      LOCAL_USER_ID,
      createdAt,
      createdAt,
      createdAt,
    );
    const row = getBackgroundJobRow(id);
    if (!row) {
      throw new Error("Failed to persist background job.");
    }
    return mapBackgroundJobRow(row);
  }

  function getBackgroundJob(jobId: string) {
    const row = getBackgroundJobRow(jobId);
    return row ? mapBackgroundJobRow(row) : null;
  }

  function updateBackgroundJobRemote(
    jobId: string,
    input: {
      remoteProvider?: string | null;
      remoteTaskId?: string | null;
      remoteStatus?: string | null;
    },
  ) {
    const updatedAt = nowIso();
    db.prepare(
      `
        UPDATE background_jobs
        SET remote_provider = COALESCE(?, remote_provider),
            remote_task_id = COALESCE(?, remote_task_id),
            remote_status = COALESCE(?, remote_status),
            remote_updated_at = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(
      input.remoteProvider ?? null,
      input.remoteTaskId ?? null,
      input.remoteStatus ?? null,
      updatedAt,
      updatedAt,
      jobId,
    );
    return getBackgroundJob(jobId);
  }

  function listBackgroundJobs(filters?: {
    status?: BackgroundJobStatus;
    jobType?: BackgroundJobType;
  }) {
    const conditions = ["created_by = ?"];
    const values: SQLInputValue[] = [LOCAL_USER_ID];
    if (filters?.status) {
      conditions.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.jobType) {
      conditions.push("job_type = ?");
      values.push(filters.jobType);
    }

    const rows = db
      .prepare(
        `
          SELECT id, workspace_id, project_id, canvas_id, session_id, thread_id,
            queue_name, job_type, status, payload, result, error_code, error_message,
            attempt_count, max_attempts, created_by, created_at, updated_at,
            started_at, completed_at, failed_at, canceled_at, next_run_at, locked_at, locked_by,
            remote_provider, remote_task_id, remote_status, remote_updated_at
          FROM background_jobs
          WHERE ${conditions.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT 100
        `,
      )
      .all(...values) as BackgroundJobRow[];

    return rows.map(mapBackgroundJobRow);
  }

  function cancelBackgroundJob(jobId: string) {
    const updatedAt = nowIso();
    const result = db.prepare(
      `
        UPDATE background_jobs
        SET status = 'canceled',
            updated_at = ?,
            canceled_at = ?,
            locked_at = NULL,
            locked_by = NULL
        WHERE id = ?
          AND status IN ('queued', 'running', 'failed')
      `,
    ).run(updatedAt, updatedAt, jobId);

    if (result.changes === 0) {
      return null;
    }
    return getBackgroundJob(jobId);
  }

  function claimBackgroundJobs(input: {
    workerId: string;
    limit?: number;
    staleAfterMs?: number;
  }) {
    const now = nowIso();
    const staleCutoff = new Date(
      Date.now() - (input.staleAfterMs ?? DEFAULT_STALE_RUNNING_JOB_MS),
    ).toISOString();
    const rows = db
      .prepare(
        `
          SELECT id, workspace_id, project_id, canvas_id, session_id, thread_id,
            queue_name, job_type, status, payload, result, error_code, error_message,
            attempt_count, max_attempts, created_by, created_at, updated_at,
            started_at, completed_at, failed_at, canceled_at, next_run_at, locked_at, locked_by,
            remote_provider, remote_task_id, remote_status, remote_updated_at
          FROM background_jobs
          WHERE (
              (
                status IN ('queued', 'failed')
                AND (next_run_at IS NULL OR next_run_at <= ?)
                AND locked_at IS NULL
              )
              OR (
                status = 'running'
                AND locked_at IS NOT NULL
                AND locked_at <= ?
              )
            )
            AND canceled_at IS NULL
          ORDER BY created_at ASC
          LIMIT ?
        `,
      )
      .all(now, staleCutoff, input.limit ?? 5) as BackgroundJobRow[];

    const claimed: BackgroundJob[] = [];
    for (const row of rows) {
      const updatedAt = nowIso();
      const result = db.prepare(
        `
          UPDATE background_jobs
          SET status = 'running',
              attempt_count = CASE
                WHEN status = 'running' THEN attempt_count
                ELSE attempt_count + 1
              END,
              updated_at = ?,
              started_at = COALESCE(started_at, ?),
              failed_at = NULL,
              error_code = NULL,
              error_message = NULL,
              locked_at = ?,
              locked_by = ?
          WHERE id = ?
            AND (
              (
                status IN ('queued', 'failed')
                AND locked_at IS NULL
              )
              OR (
                status = 'running'
                AND locked_at IS NOT NULL
                AND locked_at <= ?
              )
            )
        `,
      ).run(
        updatedAt,
        updatedAt,
        updatedAt,
        input.workerId,
        row.id,
        staleCutoff,
      );
      if (result.changes > 0) {
        const claimedRow = getBackgroundJobRow(row.id);
        if (claimedRow) {
          claimed.push(mapBackgroundJobRow(claimedRow));
        }
      }
    }
    return claimed;
  }

  function markBackgroundJobSucceeded(
    jobId: string,
    resultPayload: Record<string, unknown>,
  ) {
    const updatedAt = nowIso();
    db.prepare(
      `
        UPDATE background_jobs
        SET status = 'succeeded',
            result = ?,
            updated_at = ?,
            completed_at = ?,
            locked_at = NULL,
            locked_by = NULL
        WHERE id = ?
          AND status != 'canceled'
          AND canceled_at IS NULL
      `,
    ).run(JSON.stringify(resultPayload), updatedAt, updatedAt, jobId);
    return getBackgroundJob(jobId);
  }

  function markBackgroundJobFailed(input: {
    jobId: string;
    errorCode: string;
    errorMessage: string;
    retryable?: boolean;
    retryDelayMs?: number;
  }) {
    const row = getBackgroundJobRow(input.jobId);
    if (!row) return null;
    const updatedAt = nowIso();
    const canRetry =
      input.retryable !== false && row.attempt_count < row.max_attempts;
    const nextStatus: BackgroundJobStatus = canRetry ? "failed" : "dead_letter";
    const nextRunAt = canRetry
      ? new Date(Date.now() + (input.retryDelayMs ?? 2_000)).toISOString()
      : null;
    db.prepare(
      `
        UPDATE background_jobs
        SET status = ?,
            error_code = ?,
            error_message = ?,
            updated_at = ?,
            failed_at = ?,
            next_run_at = ?,
            locked_at = NULL,
            locked_by = NULL
        WHERE id = ?
          AND status != 'canceled'
          AND canceled_at IS NULL
      `,
    ).run(
      nextStatus,
      input.errorCode,
      input.errorMessage,
      updatedAt,
      updatedAt,
      nextRunAt,
      input.jobId,
    );
    return getBackgroundJob(input.jobId);
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

  function buildGeneratedPreviewSvg(input: {
    title: string;
    subtitle: string;
    body: string;
    width?: number;
    height?: number;
  }) {
    const escapedBody = input.body
      .slice(0, 320)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const width = input.width ?? 1024;
    const height = input.height ?? 1024;
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f5ede1"/>
            <stop offset="100%" stop-color="#dbeafe"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#bg)" rx="48"/>
        <rect x="72" y="72" width="${width - 144}" height="${height - 144}" rx="36" fill="rgba(255,255,255,0.82)" stroke="rgba(15,23,42,0.08)"/>
        <text x="110" y="190" fill="#0f172a" font-size="44" font-family="Arial, sans-serif" font-weight="700">${input.title}</text>
        <text x="110" y="250" fill="#475569" font-size="28" font-family="Arial, sans-serif">${input.subtitle}</text>
        <text x="110" y="330" fill="#334155" font-size="24" font-family="Arial, sans-serif">Key prompt</text>
        <foreignObject x="110" y="360" width="${width - 220}" height="${Math.max(height - 520, 280)}">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 38px; line-height: 1.35; color: #0f172a;">
            ${escapedBody}
          </div>
        </foreignObject>
      </svg>
    `.trim();
  }

  function createGeneratedImage(prompt: string) {
    const svg = buildGeneratedPreviewSvg({
      title: "AI Media Canvas Local Preview",
      subtitle: "Prompt",
      body: prompt,
    });
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

  function createGeneratedVideoPlan(input: {
    prompt: string;
    model?: string;
    duration?: number;
    resolution?: string;
    projectId?: string;
  }) {
    const duration = input.duration ?? 8;
    const resolution = input.resolution ?? "1080p";
    const previewSvg = buildGeneratedPreviewSvg({
      title: "AI Media Canvas Video Storyboard",
      subtitle: `${input.model ?? "local:storyboard-motion"} · ${duration}s · ${resolution}`,
      body: input.prompt,
      width: 1280,
      height: 720,
    });
    const preview = writeAssetFile({
      bucket: "project-assets",
      buffer: Buffer.from(previewSvg, "utf-8"),
      mimeType: "image/svg+xml",
      fileName: "generated-video-preview.svg",
      scope: "generated",
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    });
    const plan = {
      title: "AI Media Canvas Local Video Plan",
      prompt: input.prompt,
      model: input.model ?? "local:storyboard-motion",
      durationSeconds: duration,
      resolution,
      beats: [
        "Open with the clearest visual hook from the prompt.",
        "Use the middle beats to establish rhythm, motion, and sequencing.",
        "Close on the strongest payoff frame.",
      ],
      generatedAt: nowIso(),
    };
    const planAsset = writeAssetFile({
      bucket: "project-assets",
      buffer: Buffer.from(JSON.stringify(plan, null, 2), "utf-8"),
      mimeType: "application/json",
      fileName: "generated-video-plan.json",
      scope: "generated",
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    });
    return {
      assetId: preview.asset.id,
      url: preview.url,
      mimeType: "image/svg+xml",
      width: 1280,
      height: 720,
      prompt: input.prompt,
      durationSeconds: duration,
      previewAssetId: preview.asset.id,
      previewUrl: preview.url,
      planAssetId: planAsset.asset.id,
      planUrl: planAsset.url,
      resolution,
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
    getWorkspaceSettings,
    updateWorkspaceSettings,
    getTuttiManagedConnection,
    updateTuttiManagedConnection,
    clearTuttiManagedConnection,
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
    updateMessage,
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
    createAgentRun,
    updateAgentRun,
    getAgentRun,
    getActiveAgentRun,
    appendAgentRunEvent,
    listAgentRunEvents,
    listCanvasAgentEvents,
    getLatestCanvasEventSeq,
    recoverInterruptedAgentRuns,
    createBackgroundJob,
    getBackgroundJob,
    updateBackgroundJobRemote,
    listBackgroundJobs,
    cancelBackgroundJob,
    claimBackgroundJobs,
    markBackgroundJobSucceeded,
    markBackgroundJobFailed,
    uploadFile,
    getAssetUrl(assetId: string) {
      return resolveAssetUrl(assetId);
    },
    deleteAsset,
    createGeneratedImage,
    createGeneratedVideoPlan,
    getAssetResponse,
    assetObjectFromId(assetId: string) {
      const row = getAssetRow(assetId);
      return row ? assetObjectFromRow(row) : null;
    },
    resetAllData,
  };
}
