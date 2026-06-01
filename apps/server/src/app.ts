import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";

import {
  applicationErrorResponseSchema,
  healthResponseSchema,
  profileUpdateRequestSchema,
  profileUpdateResponseSchema,
  runCreateRequestSchema,
  unauthenticatedErrorResponseSchema,
  viewerResponseSchema,
} from "@aimc/shared";

import { registerBrandKitRoutes } from "./http/brand-kits.js";
import { registerCanvasRoutes } from "./http/canvases.js";
import { registerChatRoutes } from "./http/chat.js";
import { registerHealthRoutes } from "./http/health.js";
import { registerProjectRoutes } from "./http/projects.js";
import { registerSettingsRoutes } from "./http/settings.js";
import { registerUploadRoutes } from "./http/uploads.js";
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
  SettingsServiceError,
  type SettingsService,
} from "./features/settings/settings-service.js";
import {
  UploadServiceError,
  type UploadService,
} from "./features/uploads/upload-service.js";
import { loadServerEnv, resolveDefaultAgentModel, type ServerEnv } from "./config/env.js";
import {
  createLocalStore,
  type LocalStore,
} from "./local/store.js";
import type {
  AuthenticatedUser,
  RequestAuthenticator,
} from "./supabase/user.js";

export type BuildAppOptions = {
  env?: Partial<ServerEnv>;
};

const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL("../../web/out/", import.meta.url));

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

function buildLocalAuth(user: AuthenticatedUser): RequestAuthenticator {
  return {
    async authenticate(request) {
      const authorization = request.headers.authorization;
      if (typeof authorization !== "string") {
        return null;
      }
      const [scheme, token] = authorization.trim().split(/\s+/, 2);
      if (scheme?.toLowerCase() !== "bearer" || token !== user.accessToken) {
        return null;
      }
      return user;
    },
  };
}

function buildViewerService(store: LocalStore): ViewerService {
  return {
    async ensureViewer() {
      return store.getViewer();
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
            "Project slug is already taken in this workspace.",
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
      if (!store.updateProject(projectId, input)) {
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
      return store.listSessions(canvasId);
    },
    async createSession(_user, canvasId, title) {
      return store.createSession(canvasId, title);
    },
    async updateSessionTitle(_user, sessionId, title) {
      store.updateSessionTitle(sessionId, title);
    },
    async deleteSession(_user, sessionId) {
      store.deleteSession(sessionId);
    },
    async listMessages(_user, sessionId) {
      return store.listMessages(sessionId);
    },
    async createMessage(_user, sessionId, input) {
      return store.createMessage(sessionId, input);
    },
  };
}

function buildSettingsService(store: LocalStore): SettingsService {
  return {
    async getWorkspaceSettings() {
      return store.getWorkspaceSettings();
    },
    async updateWorkspaceSettings(_user, _workspaceId, settings) {
      return store.updateWorkspaceSettings(settings);
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
      if (!store.deleteAsset(assetId)) {
        throw new UploadServiceError("asset_not_found", "Asset not found.", 404);
      }
    },
  };
}

function buildAssistantReply(input: {
  prompt: string;
  model?: string;
  attachmentsCount: number;
  mentions: string[];
}) {
  const trimmed = input.prompt.trim();
  if (!trimmed) {
    return "我已经准备好了。你可以让我帮你整理画布想法、拆步骤，或者先在右侧的图片生成面板里试一张图。";
  }

  const contextNotes: string[] = [];
  if (input.model?.trim()) {
    contextNotes.push(`当前使用的本地模型偏好：${input.model.trim()}`);
  }
  if (input.attachmentsCount > 0) {
    contextNotes.push(`我收到了 ${input.attachmentsCount} 个参考附件。`);
  }
  if (input.mentions.length > 0) {
    contextNotes.push(`我也会参考这些补充上下文：${input.mentions.join("、")}`);
  }

  return [
    `我已经收到你的本地单机版请求：${trimmed}`,
    ...contextNotes,
    "这是本地模式下的轻量回应链路，没有再经过 Supabase、积分或账号体系。",
    "如果你想生成图片，直接用画布里的图片生成面板会更稳定。",
  ].join("\n\n");
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

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = loadServerEnv(options.env);
  const assetBaseUrl = `http://127.0.0.1:${env.port}`;
  const webDistDir = env.webDistDir ?? DEFAULT_WEB_DIST_DIR;
  const store = createLocalStore({
    assetBaseUrl,
    defaultModel: resolveDefaultAgentModel(env),
  });

  const app = Fastify({
    logger: { level: "info" },
  });

  app.addHook("onRequest", async (request, reply) => {
    const requestOrigin = request.headers.origin;
    const allowOrigin =
      requestOrigin && isAllowedLocalOrigin(requestOrigin, env.webOrigin)
        ? requestOrigin
        : env.webOrigin;
    reply.header("Access-Control-Allow-Origin", allowOrigin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  void app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  const auth = buildLocalAuth(store.localUser);
  const viewerService = buildViewerService(store);
  const projectService = buildProjectService(store);
  const canvasService = buildCanvasService(store);
  const chatService = buildChatService(store);
  const settingsService = buildSettingsService(store);
  const brandKitService = buildBrandKitService(store);
  const uploadService = buildUploadService(store);

  void registerHealthRoutes(app, env);
  void registerProjectRoutes(app, { auth, projectService });
  void registerCanvasRoutes(app, { auth, canvasService });
  void registerChatRoutes(app, { auth, chatService });
  void registerSettingsRoutes(app, {
    auth,
    settingsService,
    viewerService,
  });
  void registerBrandKitRoutes(app, { auth, brandKitService });
  void registerUploadRoutes(app, {
    auth,
    uploadService,
    viewerService,
  });

  app.get("/api/viewer", async (request, reply) => {
    const user = await auth.authenticate(request);
    if (!user) {
      return reply.code(401).send(
        unauthenticatedErrorResponseSchema.parse({
          error: {
            code: "unauthorized",
            message: "Missing local access token.",
          },
        }),
      );
    }
    return reply.code(200).send(viewerResponseSchema.parse(store.getViewer()));
  });

  app.patch("/api/viewer/profile", async (request, reply) => {
    try {
      const user = await auth.authenticate(request);
      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing local access token.",
            },
          }),
        );
      }
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

  app.get("/api/models", async (_request, reply) => {
    const models = [
      { id: "local:assistant", name: "Local Assistant", provider: "local" },
      { id: "openai:gpt-4.1", name: "OpenAI GPT-4.1", provider: "openai" },
      { id: "google:gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
    ];
    return reply.code(200).send({ models });
  });

  app.get("/api/image-models", async (_request, reply) => {
    return reply.code(200).send({
      models: [
        {
          id: "local:placeholder-image",
          displayName: "Local Placeholder Image",
          description: "Generate a local placeholder image without cloud dependencies.",
          provider: "local",
          accessible: true,
          iconUrl: undefined,
        },
      ],
    });
  });

  app.get("/api/video-models", async (_request, reply) => {
    return reply.code(200).send({ models: [] });
  });

  app.post("/api/agent/generate-video", async (_request, reply) => {
    return sendStandaloneFeatureUnavailable(reply, "Video generation");
  });

  app.get("/api/jobs/:jobId", async (_request, reply) => {
    return sendStandaloneFeatureUnavailable(reply, "Background jobs", 404);
  });

  app.get("/api/skills/marketplace/search", async (_request, reply) => {
    return reply.code(200).send({ skills: [], total: 0 });
  });

  app.get("/api/skills/marketplace/detail", async (_request, reply) => {
    return sendStandaloneFeatureUnavailable(reply, "The skills marketplace");
  });

  app.post("/api/skills/marketplace/install", async (_request, reply) => {
    return sendStandaloneFeatureUnavailable(reply, "The skills marketplace");
  });

  app.get("/api/workspaces/skills", async (_request, reply) => {
    return reply.code(200).send({ skills: [] });
  });

  app.get("/api/credits", async (_request, reply) => {
    return sendStandaloneFeatureUnavailable(reply, "Credits");
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/credits/*",
    async handler(_request, reply) {
      return sendStandaloneFeatureUnavailable(reply, "Credits");
    },
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/payments/*",
    async handler(_request, reply) {
      return sendStandaloneFeatureUnavailable(reply, "Billing");
    },
  });

  app.get("/api/fonts", async (_request, reply) => {
    return reply.code(200).send({ fonts: [] });
  });

  app.post("/api/agent/generate-image", async (request, reply) => {
    const user = await auth.authenticate(request);
    if (!user) {
      return reply.code(401).send(
        unauthenticatedErrorResponseSchema.parse({
          error: {
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          },
        }),
      );
    }

    const payload = request.body as {
      prompt?: string;
    };
    if (!payload?.prompt?.trim()) {
      return sendApplicationError(
        reply,
        "application_error",
        "Prompt is required.",
        400,
      );
    }

    const result = store.createGeneratedImage(payload.prompt.trim());
    return reply.code(200).send(result);
  });

  app.post("/api/local-agent/respond", async (request, reply) => {
    try {
      const user = await auth.authenticate(request);
      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing local access token.",
            },
          }),
        );
      }
      const payload = runCreateRequestSchema.parse(request.body);
      const text = buildAssistantReply({
        prompt: payload.prompt,
        ...(payload.model ? { model: payload.model } : {}),
        attachmentsCount: payload.attachments?.length ?? 0,
        mentions: payload.mentions?.map((mention) => mention.label) ?? [],
      });
      const message = store.createMessage(payload.sessionId, {
        role: "assistant",
        content: text,
        contentBlocks: [{ type: "text", text }],
      });
      return reply.code(200).send({ message });
    } catch {
      return sendApplicationError(
        reply,
        "application_error",
        "Unable to create local agent response.",
      );
    }
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
        return reply.code(404).send("Static asset not found.");
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
