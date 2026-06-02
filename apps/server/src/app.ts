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
  type SkillDetail,
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
import {
  createLocalStore,
  type LocalStore,
} from "./local/store.js";
import type { AuthenticatedUser } from "./auth/types.js";

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

function buildAssistantReply(input: {
  prompt: string;
  model?: string;
  videoGenerationPreference?: {
    models: string[];
    mode: "auto" | "manual";
  };
  attachmentsCount: number;
  mentions: string[];
  enabledSkills: Array<Pick<SkillDetail, "name" | "description" | "skillContent">>;
}) {
  const trimmed = input.prompt.trim();
  if (!trimmed) {
    return "我已经准备好了。你可以让我帮你整理画布想法、拆步骤，或者先在右侧的图片生成面板里试一张图。";
  }

  const contextNotes: string[] = [];
  if (input.model?.trim()) {
    contextNotes.push(`当前使用的本地模型偏好：${input.model.trim()}`);
  }
  if (input.videoGenerationPreference?.models?.length) {
    const planningMode =
      input.videoGenerationPreference.mode === "manual" ? "手动指定" : "自动";
    const planners = input.videoGenerationPreference.models
      .map((model) => model.trim())
      .filter(Boolean)
      .join("、");
    contextNotes.push(
      `当前的视频规划偏好：${planners}（${planningMode}）`,
    );
  }
  if (input.attachmentsCount > 0) {
    contextNotes.push(`我收到了 ${input.attachmentsCount} 个参考附件。`);
  }
  if (input.mentions.length > 0) {
    contextNotes.push(`我也会参考这些补充上下文：${input.mentions.join("、")}`);
  }
  if (input.enabledSkills.length > 0) {
    contextNotes.push(
      `当前已启用的本地技能：${input.enabledSkills.map((skill) => skill.name).join("、")}`,
    );

    const skillGuidance = buildSkillGuidance(trimmed, input.enabledSkills);
    if (skillGuidance.length > 0) {
      contextNotes.push(`这些技能会影响我的回应方式：${skillGuidance.join(" | ")}`);
    }
  }

  return [
    `我已经收到你的本地单机版请求：${trimmed}`,
    ...contextNotes,
    "这是本地模式下的轻量回应链路，没有再经过云端账号、积分或订阅体系。",
    ...(input.videoGenerationPreference
      ? ["我会优先按当前视频规划偏好来组织分镜、镜头顺序和节奏建议。"]
      : []),
    "如果你想生成图片，直接用画布里的图片生成面板会更稳定。",
  ].join("\n\n");
}

function buildSkillGuidance(
  prompt: string,
  skills: Array<Pick<SkillDetail, "name" | "description" | "skillContent">>,
) {
  const normalizedPrompt = prompt.toLowerCase();
  const instructionsPerSkill = skills.length > 3 ? 1 : 2;

  return [...skills]
    .sort((left, right) => scoreSkillForPrompt(right, normalizedPrompt) - scoreSkillForPrompt(left, normalizedPrompt))
    .map((skill) => {
      const instructions = extractSkillInstructions(skill.skillContent).slice(
        0,
        instructionsPerSkill,
      );
      const details = instructions.length > 0
        ? instructions.join("；")
        : skill.description;
      return `${skill.name}：${details}`;
    });
}

function scoreSkillForPrompt(
  skill: Pick<SkillDetail, "name" | "description" | "skillContent">,
  normalizedPrompt: string,
) {
  const haystack = `${skill.name} ${skill.description} ${skill.skillContent}`.toLowerCase();
  let score = 0;

  for (const token of normalizedPrompt.split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= 2)) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  if (normalizedPrompt.includes("品牌") && haystack.includes("brand")) {
    score += 3;
  }
  if (normalizedPrompt.includes("海报") && (haystack.includes("poster") || haystack.includes("design"))) {
    score += 3;
  }
  if (normalizedPrompt.includes("提示词") && haystack.includes("prompt")) {
    score += 3;
  }
  if (normalizedPrompt.includes("画布") && haystack.includes("canvas")) {
    score += 3;
  }

  return score;
}

function extractSkillInstructions(skillContent: string) {
  const sectionMatch = skillContent.match(
    /##\s+Instructions\s+([\s\S]*?)(?:\n##\s+|$)/i,
  );
  if (!sectionMatch) {
    return [];
  }

  return sectionMatch[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ""));
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
  registerAllProviders(env);
  const assetBaseUrl = `http://127.0.0.1:${env.port}`;
  const webDistDir = env.webDistDir ?? DEFAULT_WEB_DIST_DIR;
  const store = createLocalStore({
    assetBaseUrl,
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

  app.post("/api/local-agent/respond", async (request, reply) => {
    try {
      const payload = runCreateRequestSchema.parse(request.body);
      const effectiveEnv = await settingsService.getEffectiveServerEnv(
        LOCAL_WORKSPACE_ID,
      );
      const enabledSkills = store
        .listEnabledSkills()
        .map((skill) => store.getSkillDetail(skill.id))
        .filter((skill): skill is SkillDetail => skill !== null)
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          skillContent: skill.skillContent,
        }));
      const text = buildAssistantReply({
        prompt: payload.prompt,
        model: payload.model ?? effectiveEnv.agentModel,
        ...(payload.videoGenerationPreference
          ? { videoGenerationPreference: payload.videoGenerationPreference }
          : {}),
        attachmentsCount: payload.attachments?.length ?? 0,
        mentions: payload.mentions?.map((mention) => mention.label) ?? [],
        enabledSkills,
      });
      const message = store.createMessage(payload.sessionId, {
        role: "assistant",
        content: text,
        contentBlocks: [{ type: "text", text }],
      });
      if (!message) {
        return sendApplicationError(
          reply,
          "session_not_found",
          "Chat session not found.",
          404,
        );
      }
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
