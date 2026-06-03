import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";

import {
  applicationErrorResponseSchema,
  type ContentBlock,
  healthResponseSchema,
  profileUpdateRequestSchema,
  profileUpdateResponseSchema,
  type RunCreateRequest,
  runCreateRequestSchema,
  runCreateResponseSchema,
  type StreamEvent,
  type ToolBlock,
  viewerResponseSchema,
} from "@aimc/shared";

import { registerBrandKitRoutes } from "./http/brand-kits.js";
import { registerCanvasRoutes } from "./http/canvases.js";
import { registerChatRoutes } from "./http/chat.js";
import { registerGenerateRoutes } from "./http/generate.js";
import { registerHealthRoutes } from "./http/health.js";
import { registerImageModelRoutes } from "./http/image-models.js";
import { registerJobRoutes } from "./http/jobs.js";
import { registerModelRoutes } from "./http/models.js";
import { registerProjectRoutes } from "./http/projects.js";
import { registerSettingsRoutes } from "./http/settings.js";
import { registerSkillRoutes } from "./http/skills.js";
import { registerUploadRoutes } from "./http/uploads.js";
import { registerVideoModelRoutes } from "./http/video-models.js";
import {
  BrandKitServiceError,
  type BrandKitService,
} from "./features/brand-kit/brand-kit-service.js";
import {
  CanvasServiceError,
  type CanvasService,
} from "./features/canvas/canvas-service.js";
import {
  ChatServiceError,
  type ChatService,
} from "./features/chat/chat-service.js";
import {
  type ViewerService,
} from "./features/bootstrap/ensure-user-foundation.js";
import {
  ProjectServiceError,
  type ProjectService,
} from "./features/projects/project-service.js";
import {
  UploadServiceError,
  type UploadService,
} from "./features/uploads/upload-service.js";
import {
  SkillServiceError,
  type SkillService,
} from "./features/skills/skill-service.js";
import { createJobService } from "./features/jobs/job-service.js";
import {
  createSettingsService,
  LOCAL_WORKSPACE_ID,
} from "./features/settings/settings-service.js";
import { registerAllProviders } from "./generation/providers/register-all.js";
import { loadServerEnv, type ServerEnv } from "./config/env.js";
import { createAgentRunService } from "./agent/runtime.js";
import {
  createLocalStore,
  type LocalStore,
} from "./local/store.js";
import { createLocalUserClient } from "./local/user-client.js";
import type { RequestAuthenticator } from "./supabase/user.js";
import { ConnectionManager } from "./ws/connection-manager.js";
import { CanvasEventBuffer } from "./ws/event-buffer.js";
import { registerWsRoute } from "./ws/handler.js";

export type BuildAppOptions = {
  env?: Partial<ServerEnv>;
};

const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL("../../web/out/", import.meta.url));
const DEFAULT_SKILLS_ROOT = fileURLToPath(
  new URL("../../../skills/", import.meta.url),
);
const DEFAULT_AGENT_FILES_ROOT = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const LOCAL_AGENT_ACCESS_TOKEN = "standalone-local-access-token";

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const LOCAL_FONT_LIBRARY = [
  { family: "Inter", category: "sans-serif", variants: ["regular", "500", "700"] },
  { family: "Noto Sans SC", category: "sans-serif", variants: ["regular", "500", "700"] },
  { family: "Source Han Serif SC", category: "serif", variants: ["regular", "600", "700"] },
  { family: "Merriweather", category: "serif", variants: ["regular", "700"] },
  { family: "Playfair Display", category: "display", variants: ["regular", "700"] },
  { family: "Bebas Neue", category: "display", variants: ["regular"] },
  { family: "Caveat", category: "handwriting", variants: ["regular", "700"] },
  { family: "JetBrains Mono", category: "monospace", variants: ["regular", "700"] },
];

function isAllowedLocalOrigin(origin: string, expectedOrigin: string) {
  try {
    const url = new URL(origin);
    const expected = new URL(expectedOrigin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === expected.port &&
      /^https?:$/.test(url.protocol)
    );
  } catch {
    return false;
  }
}

function buildViewerService(store: LocalStore): ViewerService {
  return {
    async ensureViewer() {
      return {
        ...store.getViewer(),
        workspace: { id: LOCAL_WORKSPACE_ID },
      } as Awaited<ReturnType<ViewerService["ensureViewer"]>>;
    },
  };
}

function buildProjectService(store: LocalStore): ProjectService {
  return {
    async archiveProject(_user, projectId) {
      if (!store.archiveProject(projectId)) {
        throw new ProjectServiceError(
          "project_not_found",
          "Project not found.",
          404,
        );
      }
    },
    async createProject(_user, input) {
      try {
        return store.createProject(input);
      } catch (error) {
        if (error instanceof Error && error.message === "project_slug_taken") {
        throw new ProjectServiceError(
          "project_slug_taken",
          "Project slug is already taken in this app.",
          409,
        );
        }
        throw new ProjectServiceError(
          "project_create_failed",
          "Unable to create project.",
          500,
        );
      }
    },
    async getProject(_user, projectId) {
      const project = store.getProject(projectId);
      if (!project) {
        throw new ProjectServiceError(
          "project_not_found",
          "Project not found.",
          404,
        );
      }
      return project;
    },
    async listProjects() {
      return store.listProjects();
    },
    async saveThumbnail(_user, projectId, buffer, mimeType) {
      const result = store.saveProjectThumbnail(projectId, buffer, mimeType);
      if (!result) {
        throw new ProjectServiceError(
          "project_not_found",
          "Project not found.",
          404,
        );
      }
      return result;
    },
    async updateProject(_user, projectId, input) {
      const result = store.updateProject(projectId, input);
      if (!result.ok) {
        if (result.reason === "brand_kit_not_found") {
          throw new ProjectServiceError(
            "brand_kit_not_found",
            "Brand kit not found.",
            404,
          );
        }
        throw new ProjectServiceError(
          "project_not_found",
          "Project not found.",
          404,
        );
      }
    },
  };
}

function buildCanvasService(store: LocalStore): CanvasService {
  return {
    async getCanvas(_user, canvasId) {
      const canvas = store.getCanvas(canvasId);
      if (!canvas) {
        throw new CanvasServiceError("canvas_not_found", "Canvas not found.", 404);
      }
      return canvas;
    },
    async saveCanvasContent(_user, canvasId, content) {
      if (!store.saveCanvas(canvasId, content)) {
        throw new CanvasServiceError("canvas_not_found", "Canvas not found.", 404);
      }
    },
  };
}

function buildChatService(store: LocalStore): ChatService {
  return {
    async listSessions(_user, canvasId) {
      const sessions = store.listSessions(canvasId);
      if (!sessions) {
        throw new ChatServiceError(
          "canvas_not_found",
          "Canvas not found.",
          404,
        );
      }
      return sessions;
    },
    async createSession(_user, canvasId, title) {
      const session = store.createSession(canvasId, title);
      if (!session) {
        throw new ChatServiceError(
          "canvas_not_found",
          "Canvas not found.",
          404,
        );
      }
      return session;
    },
    async updateSessionTitle(_user, sessionId, title) {
      if (!store.updateSessionTitle(sessionId, title)) {
        throw new ChatServiceError(
          "session_not_found",
          "Chat session not found.",
          404,
        );
      }
    },
    async deleteSession(_user, sessionId) {
      if (!store.deleteSession(sessionId)) {
        throw new ChatServiceError(
          "session_not_found",
          "Chat session not found.",
          404,
        );
      }
    },
    async listMessages(_user, sessionId) {
      const messages = store.listMessages(sessionId);
      if (!messages) {
        throw new ChatServiceError(
          "session_not_found",
          "Chat session not found.",
          404,
        );
      }
      return messages;
    },
    async createMessage(_user, sessionId, input) {
      const message = store.createMessage(sessionId, input);
      if (!message) {
        throw new ChatServiceError(
          "session_not_found",
          "Chat session not found.",
          404,
        );
      }
      return message;
    },
  };
}

function buildBrandKitService(store: LocalStore): BrandKitService {
  return {
    async listKits() {
      return store.listBrandKits();
    },
    async getKit(_user, kitId) {
      const kit = store.getBrandKit(kitId);
      if (!kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }
      return kit;
    },
    async createKit(_user, input) {
      return store.createBrandKit(input);
    },
    async updateKit(_user, kitId, input) {
      const kit = store.updateBrandKit(kitId, input);
      if (!kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }
      return kit;
    },
    async deleteKit(_user, kitId) {
      if (!store.deleteBrandKit(kitId)) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }
    },
    async createAsset(_user, kitId, input) {
      const asset = store.createBrandKitAsset(kitId, input);
      if (!asset) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }
      return asset;
    },
    async updateAsset(_user, kitId, assetId, input) {
      const asset = store.updateBrandKitAsset(kitId, assetId, input);
      if (!asset) {
        throw new BrandKitServiceError(
          "brand_kit_asset_not_found",
          "Brand kit asset not found.",
          404,
        );
      }
      return asset;
    },
    async deleteAsset(_user, kitId, assetId) {
      if (!store.deleteBrandKitAsset(kitId, assetId)) {
        throw new BrandKitServiceError(
          "brand_kit_asset_not_found",
          "Brand kit asset not found.",
          404,
        );
      }
    },
    async uploadAsset(_user, kitId, assetType, fileName, fileBuffer, mimeType) {
      const asset = store.uploadBrandKitAsset(
        kitId,
        assetType,
        fileName,
        fileBuffer,
        mimeType,
      );
      if (!asset) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }
      return asset;
    },
    async duplicateKit(_user, kitId) {
      const kit = store.duplicateBrandKit(kitId);
      if (!kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }
      return kit;
    },
  };
}

function buildUploadService(store: LocalStore): UploadService {
  return {
    async uploadFile(_user, input) {
      return store.uploadFile({
        bucket: input.bucket,
        fileName: input.fileName,
        fileBuffer: input.fileBuffer,
        mimeType: input.mimeType,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      });
    },
    async getAssetUrl(_user, assetId) {
      const url = store.getAssetUrl(assetId);
      if (!url) {
        throw new UploadServiceError("asset_not_found", "Asset not found.", 404);
      }
      return url;
    },
    async deleteAsset(_user, assetId) {
      const result = store.deleteAsset(assetId);
      if (!result.ok) {
        if (result.reason === "asset_in_use") {
          throw new UploadServiceError(
            "asset_in_use",
            "Asset is still referenced by local app data.",
            409,
          );
        }
        throw new UploadServiceError("asset_not_found", "Asset not found.", 404);
      }
    },
  };
}

function buildSkillService(store: LocalStore): SkillService {
  return {
    async listInstalledSkills() {
      return store.listInstalledSkills();
    },
    async listCatalogSkills() {
      return store.listCatalogSkills();
    },
    async listEnabledSkills() {
      return store.listEnabledSkills();
    },
    async getSkillDetail(_user, skillId) {
      const skill = store.getSkillDetail(skillId);
      if (!skill) {
        throw new SkillServiceError("skill_not_found", "Skill not found.", 404);
      }
      return skill;
    },
    async createSkill(_user, input) {
      try {
        return store.createSkill(input);
      } catch {
        throw new SkillServiceError(
          "skill_create_failed",
          "Unable to create local skill.",
          500,
        );
      }
    },
    async importSkill(_user, input) {
      try {
        const skill = store.importSkill(input);
        if (!skill) {
          throw new SkillServiceError(
            "skill_import_failed",
            "Imported files do not contain a usable SKILL.md payload.",
            400,
          );
        }
        return skill;
      } catch (error) {
        if (error instanceof SkillServiceError) throw error;
        throw new SkillServiceError(
          "skill_import_failed",
          "Unable to import local skill.",
          500,
        );
      }
    },
    async installCatalogSkill(_user, skillId) {
      const skill = store.installCatalogSkill(skillId);
      if (!skill) {
        throw new SkillServiceError("skill_not_found", "Skill not found.", 404);
      }
      return skill;
    },
    async toggleSkill(_user, skillId, input) {
      const skill = store.toggleSkill(skillId, input);
      if (!skill) {
        throw new SkillServiceError("skill_not_found", "Skill not found.", 404);
      }
      return skill;
    },
    async uninstallSkill(_user, skillId) {
      if (!store.uninstallSkill(skillId)) {
        throw new SkillServiceError("skill_not_found", "Skill not found.", 404);
      }
    },
  };
}

function getStaticContentType(filePath: string) {
  return STATIC_CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function normalizeStaticCandidate(pathname: string) {
  const stripped = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (stripped === "/") {
    return "/index.html";
  }
  return stripped.endsWith("/") ? `${stripped}index.html` : stripped;
}

async function resolveStaticFile(webDistDir: string, requestPath: string) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalizedPath = normalizeStaticCandidate(decodedPath);
  const candidates = new Set<string>([normalizedPath]);

  if (!extname(normalizedPath)) {
    candidates.add(`${normalizedPath}.html`);
    candidates.add(`${normalizedPath}/index.html`);
  }

  for (const candidate of candidates) {
    const safeCandidate = candidate.replace(/^\/+/, "");
    const absolutePath = resolve(webDistDir, safeCandidate);
    const relPath = relative(webDistDir, absolutePath);
    if (relPath.startsWith("..")) {
      continue;
    }
    try {
      const entry = await stat(absolutePath);
      if (entry.isFile()) {
        return absolutePath;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function sendApplicationError(
  reply: { code: (status: number) => { send: (payload: unknown) => unknown } },
  code: string,
  message: string,
  statusCode = 500,
) {
  return reply.code(statusCode).send(
    applicationErrorResponseSchema.parse({
      error: {
        code,
        message,
      },
    }),
  );
}

function sendStandaloneFeatureUnavailable(
  reply: { code: (status: number) => { send: (payload: unknown) => unknown } },
  feature: string,
  statusCode = 410,
) {
  return sendApplicationError(
    reply,
    "application_error",
    `${feature} is not available in the standalone AI Media Canvas build.`,
    statusCode,
  );
}

type LocalAgentRunState = {
  controller: AbortController | null;
  done: boolean;
  events: StreamEvent[];
  lastUpdatedAt: number;
};

function createLocalAgentRunState(): LocalAgentRunState {
  return {
    controller: null,
    done: false,
    events: [],
    lastUpdatedAt: Date.now(),
  };
}

function appendLocalAgentEvent(
  state: LocalAgentRunState,
  event: StreamEvent,
) {
  state.events.push(event);
  state.lastUpdatedAt = Date.now();
  if (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.canceled"
  ) {
    state.done = true;
  }
}

function createStandaloneAgentEnv(baseEnv: ServerEnv): ServerEnv {
  return {
    ...baseEnv,
    ...(baseEnv.skillsRoot ? {} : { skillsRoot: DEFAULT_SKILLS_ROOT }),
    ...(baseEnv.agentBackendMode === "filesystem" || baseEnv.agentFilesRoot
      ? {}
      : { agentFilesRoot: DEFAULT_AGENT_FILES_ROOT }),
  };
}

type AssistantMessageState = {
  blocks: ContentBlock[];
  textParts: string[];
};

function appendAssistantMessageEvent(
  state: AssistantMessageState,
  event: StreamEvent,
) {
  if (event.type === "message.delta") {
    const lastBlock = state.blocks[state.blocks.length - 1];
    if (lastBlock?.type === "text") {
      lastBlock.text += event.delta;
    } else {
      state.blocks.push({ type: "text", text: event.delta });
    }
    state.textParts.push(event.delta);
    return;
  }

  if (event.type === "tool.started") {
    state.blocks.push({
      type: "tool",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: "running",
      ...(event.input ? { input: event.input } : {}),
    });
    return;
  }

  if (event.type === "tool.completed") {
    const index = state.blocks.findIndex(
      (block) =>
        block.type === "tool" && block.toolCallId === event.toolCallId,
    );
    if (index < 0) {
      return;
    }

    const currentBlock = state.blocks[index] as ToolBlock;
    state.blocks[index] = {
      ...currentBlock,
      status: "completed",
      ...(event.output ? { output: event.output } : {}),
      ...(event.outputSummary ? { outputSummary: event.outputSummary } : {}),
      ...(event.artifacts ? { artifacts: event.artifacts } : {}),
    };
  }
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = loadServerEnv(options.env);
  registerAllProviders(env);
  const assetBaseUrl = `http://127.0.0.1:${env.port}`;
  const webDistDir = env.webDistDir ?? DEFAULT_WEB_DIST_DIR;
  const store = createLocalStore({
    assetBaseUrl,
  });

  const app = Fastify({
    logger: { level: "info" },
  });
  const connectionManager = new ConnectionManager();
  const eventBuffer = new CanvasEventBuffer();

  app.addHook("onRequest", async (request, reply) => {
    const requestOrigin = request.headers.origin;
    const allowOrigin =
      requestOrigin && isAllowedLocalOrigin(requestOrigin, env.webOrigin)
        ? requestOrigin
        : env.webOrigin;
    reply.header("Access-Control-Allow-Origin", allowOrigin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  void app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  const localUser = store.localUser;
  const viewerService = buildViewerService(store);
  const projectService = buildProjectService(store);
  const canvasService = buildCanvasService(store);
  const chatService = buildChatService(store);
  const brandKitService = buildBrandKitService(store);
  const uploadService = buildUploadService(store);
  const skillService = buildSkillService(store);
  const jobService = createJobService(store);
  const settingsService = createSettingsService(store, env);
  const createUserClient = (_accessToken: string) =>
    createLocalUserClient(store);
  const localAuth: RequestAuthenticator = {
    async authenticate(request) {
      const authorization = request.headers.authorization;
      const token = authorization?.replace(/^Bearer\s+/i, "").trim();
      if (token !== LOCAL_AGENT_ACCESS_TOKEN) {
        return null;
      }
      return {
        ...localUser,
        accessToken: LOCAL_AGENT_ACCESS_TOKEN,
      };
    },
  };
  const agentRuns = createAgentRunService({
    connectionManager,
    createUserClient,
    env: createStandaloneAgentEnv(env),
  });
  const localAgentRuns = new Map<string, LocalAgentRunState>();

  void app.addHook("onClose", async () => {
    eventBuffer.dispose();
  });

  const launchLocalAgentRun = (options: {
    payload: RunCreateRequest;
    runId: string;
    runState: LocalAgentRunState;
  }) => {
    void (async () => {
      const assistantMessageState: AssistantMessageState = {
        blocks: [],
        textParts: [],
      };

      try {
        for await (const event of agentRuns.streamRun(options.runId)) {
          appendLocalAgentEvent(options.runState, event);
          appendAssistantMessageEvent(assistantMessageState, event);
        }

        if (
          assistantMessageState.textParts.length > 0 ||
          assistantMessageState.blocks.length > 0
        ) {
          await chatService.createMessage(localUser, options.payload.sessionId, {
            role: "assistant",
            content: assistantMessageState.textParts.join(""),
            ...(assistantMessageState.blocks.length > 0
              ? { contentBlocks: assistantMessageState.blocks }
              : {}),
          });
        }
      } catch (error) {
        if (options.runState.done) {
          return;
        }
        appendLocalAgentEvent(options.runState, {
          type: "run.failed",
          runId: options.runId,
          error: {
            code: "run_failed",
            message:
              error instanceof Error
                ? error.message
                : "Model request failed.",
          },
          timestamp: new Date().toISOString(),
        });
      } finally {
        options.runState.controller = null;
        options.runState.done = true;
        options.runState.lastUpdatedAt = Date.now();
        setTimeout(() => {
          localAgentRuns.delete(options.runId);
        }, 10 * 60 * 1000).unref?.();
      }
    })();
  };

  void registerHealthRoutes(app, env);
  void registerProjectRoutes(app, { localUser, projectService });
  void registerCanvasRoutes(app, { localUser, canvasService });
  void registerChatRoutes(app, { localUser, chatService });
  void registerBrandKitRoutes(app, { localUser, brandKitService });
  void registerSkillRoutes(app, { localUser, skillService });
  void registerUploadRoutes(app, {
    localUser,
    uploadService,
  });
  void registerSettingsRoutes(app, { localUser, settingsService });
  void registerModelRoutes(app, env, settingsService);
  void registerImageModelRoutes(app, env, settingsService);
  void registerVideoModelRoutes(app, env, settingsService);
  void registerJobRoutes(app, { localUser, jobService });
  void registerGenerateRoutes(app, {
    env,
    localUser,
    jobService,
    settingsService,
    uploadService,
  });
  void app.register(async (wsApp) => {
    await wsApp.register(websocket);
    await registerWsRoute(wsApp, {
      agentRuns,
      auth: localAuth,
      chatService,
      connectionManager,
      eventBuffer,
      settingsService,
      viewerService,
    });
  });

  app.get("/api/viewer", async (_request, reply) => {
    return reply.code(200).send(viewerResponseSchema.parse(store.getViewer()));
  });

  app.patch("/api/viewer/profile", async (request, reply) => {
    try {
      const payload = profileUpdateRequestSchema.parse(request.body);
      return reply.code(200).send(
        profileUpdateResponseSchema.parse({
          profile: store.updateProfile(payload.displayName),
        }),
      );
    } catch {
      return sendApplicationError(
        reply,
        "profile_update_failed",
        "Unable to update profile.",
      );
    }
  });

  app.get("/api/fonts", async (request, reply) => {
    const query = request.query as { search?: string; category?: string } | undefined;
    const search = query?.search?.trim().toLowerCase() ?? "";
    const category = query?.category?.trim().toLowerCase() ?? "";
    const fonts = LOCAL_FONT_LIBRARY.filter((font) => {
      const categoryMatches = !category || font.category === category;
      const searchMatches =
        !search || font.family.toLowerCase().includes(search);
      return categoryMatches && searchMatches;
    });
    return reply.code(200).send({ fonts });
  });

  app.post("/api/agent/runs", async (request, reply) => {
    try {
      const payload = runCreateRequestSchema.parse(request.body);
      if (store.listMessages(payload.sessionId) === null) {
        return sendApplicationError(
          reply,
          "session_not_found",
          "Chat session not found.",
          404,
        );
      }

      const effectiveEnv = await settingsService.getEffectiveServerEnv(
        LOCAL_WORKSPACE_ID,
      );
      const runtimeEnv = createStandaloneAgentEnv(effectiveEnv);
      const resolvedModel = payload.model ?? runtimeEnv.agentModel;
      const response = runCreateResponseSchema.parse(
        agentRuns.createRun(payload, {
          accessToken: LOCAL_AGENT_ACCESS_TOKEN,
          env: runtimeEnv,
          ...(resolvedModel ? { model: resolvedModel } : {}),
          userId: localUser.id,
        }),
      );
      const runState = createLocalAgentRunState();
      localAgentRuns.set(response.runId, runState);
      launchLocalAgentRun({
        payload,
        runId: response.runId,
        runState,
      });
      return reply.code(202).send(response);
    } catch {
      return sendApplicationError(
        reply,
        "application_error",
        "Unable to start local agent run.",
      );
    }
  });

  app.get("/api/agent/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const state = localAgentRuns.get(runId);
    if (!state) {
      return sendApplicationError(
        reply,
        "run_not_found",
        "Run not found.",
        404,
      );
    }

    const query = request.query as { cursor?: string } | undefined;
    const parsedCursor = Number.parseInt(query?.cursor ?? "0", 10);
    const cursor =
      Number.isFinite(parsedCursor) && parsedCursor >= 0 ? parsedCursor : 0;

    return reply.code(200).send({
      done: state.done,
      events: state.events.slice(cursor),
      nextCursor: state.events.length,
    });
  });

  app.post("/api/agent/runs/:runId/cancel", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const state = localAgentRuns.get(runId);
    if (!state) {
      return sendApplicationError(
        reply,
        "run_not_found",
        "Run not found.",
        404,
      );
    }

    const canceledRun = agentRuns.cancelRun(runId);
    if (!canceledRun) {
      return sendApplicationError(
        reply,
        "run_not_found",
        "Run not found.",
        404,
      );
    }

    return reply.code(202).send(canceledRun);
  });

  app.get("/local-assets/:assetId", async (request, reply) => {
    const asset = store.getAssetResponse(
      (request.params as { assetId: string }).assetId,
    );
    if (!asset) {
      return reply.code(404).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "asset_not_found",
            message: "Asset not found.",
          },
        }),
      );
    }

    const payload = await readFile(asset.filePath);
    reply.header("content-type", asset.mimeType);
    return reply.code(200).send(payload);
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/*",
    async handler(request, reply) {
      const requestPath = request.url.split("?")[0] ?? "/";
      if (requestPath === "/api" || requestPath.startsWith("/api/")) {
        return reply.code(404).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "route_not_found",
              message: "API route not found.",
            },
          }),
        );
      }

      if (requestPath === "/local-assets" || requestPath.startsWith("/local-assets/")) {
        return reply.code(404).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "asset_not_found",
              message: "Asset not found.",
            },
          }),
        );
      }

      const filePath = await resolveStaticFile(webDistDir, requestPath);
      if (!filePath) {
        const notFoundFilePath = await resolveStaticFile(webDistDir, "/404");
        if (!notFoundFilePath) {
          return reply.code(404).send("Static asset not found.");
        }
        const notFoundPayload = await readFile(notFoundFilePath);
        reply.header("content-type", getStaticContentType(notFoundFilePath));
        reply.header("cache-control", "no-cache");
        return reply.code(404).send(notFoundPayload);
      }

      const payload = await readFile(filePath);
      reply.header("content-type", getStaticContentType(filePath));
      if (filePath.includes("/_next/")) {
        reply.header("cache-control", "public, max-age=31536000, immutable");
      } else if (filePath.endsWith(".html")) {
        reply.header("cache-control", "no-cache");
      }
      return reply.code(200).send(payload);
    },
  });

  return app;
}
