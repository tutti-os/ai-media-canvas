import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import {
  type RunCreateRequest,
  type RunCreateResponse,
  canvasContentSchema,
  chatMessageCreateRequestSchema,
  createImageJobRequestSchema,
  createVideoJobRequestSchema,
  projectCreateRequestSchema,
  runCreateRequestSchema,
} from "@aimc/shared";

import type { ServerEnv } from "../config/env.js";
import { CanvasServiceError } from "../features/canvas/canvas-service.js";
import { ChatServiceError } from "../features/chat/chat-service.js";
import { JobServiceError } from "../features/jobs/job-service.js";
import type { NextopManagedCredentialService } from "../features/nextop-managed/credential-service.js";
import { ProjectServiceError } from "../features/projects/project-service.js";
import type { SettingsService } from "../features/settings/settings-service.js";
import { SkillServiceError } from "../features/skills/skill-service.js";
import type { CanvasOperations } from "./canvas-operations.js";
import type { ChatOperations } from "./chat-operations.js";
import { listImageModels } from "./image-models.js";
import type { JobOperations } from "./job-operations.js";
import { listAgentModels } from "./models.js";
import { isZodError, sendCliError, sendCliJson } from "./nextop-cli-output.js";
import type { ProjectOperations } from "./project-operations.js";
import type { SkillOperations } from "./skill-operations.js";
import { listVideoModels } from "./video-models.js";

type AgentCliOperations = {
  cancelRun: (runId: string) => Promise<unknown>;
  listRunEvents: (runId: string, cursor: number) => Promise<unknown>;
  startRun: (payload: RunCreateRequest) => Promise<RunCreateResponse>;
};

const emptyBodySchema = z.object({}).passthrough().optional();
const projectCreateCliBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
const canvasSaveCliBodySchema = z.object({
  "canvas-id": z.string().min(1),
  "content-json": z.string().min(1),
});
const canvasInsertImageCliBodySchema = z.object({
  "canvas-id": z.string().min(1),
  "file-path": z.string().min(1),
  "project-id": z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  "mime-type": z.string().min(1).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  "placement-width": z.number().positive().optional(),
  "placement-height": z.number().positive().optional(),
});
const canvasInsertVideoCliBodySchema = canvasInsertImageCliBodySchema.extend({
  duration: z.number().int().positive().optional(),
});
const sessionCreateCliBodySchema = z.object({
  "canvas-id": z.string().min(1),
  title: z.string().min(1).optional(),
});
const messageCreateCliBodySchema = z.object({
  "session-id": z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
const agentRunCliBodySchema = z.object({
  "session-id": z.string().min(1),
  "conversation-id": z.string().min(1),
  prompt: z.string(),
  "canvas-id": z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  "runtime-kind": z.enum(["server-deepagent", "local-agent"]).optional(),
  "runtime-provider": z.string().min(1).optional(),
});
const agentEventsCliBodySchema = z.object({
  "run-id": z.string().min(1),
  cursor: z.number().int().nonnegative().optional(),
});
const jobListCliBodySchema = z.object({
  status: z.string().min(1).optional(),
  "job-type": z.string().min(1).optional(),
});
const generationImageCliBodySchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  "project-id": z.string().min(1).optional(),
  "canvas-id": z.string().min(1).optional(),
  "session-id": z.string().min(1).optional(),
  "aspect-ratio": z.string().min(1).optional(),
  quality: z.enum(["standard", "hd", "ultra"]).optional(),
  size: z.string().min(1).optional(),
  seed: z.number().int().optional(),
  "input-images": z.string().min(1).optional(),
});
const generationVideoCliBodySchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  "project-id": z.string().min(1).optional(),
  "canvas-id": z.string().min(1).optional(),
  "session-id": z.string().min(1).optional(),
  duration: z.number().int().positive().optional(),
  resolution: z.string().min(1).optional(),
  "aspect-ratio": z.string().min(1).optional(),
  "input-images": z.string().min(1).optional(),
  "input-video": z.string().min(1).optional(),
  "negative-prompt": z.string().min(1).optional(),
  seed: z.number().int().optional(),
  "enable-audio": z.boolean().optional(),
});
const skillEnableCliBodySchema = z.object({
  "skill-id": z.string().min(1),
  enabled: z.boolean(),
});

export async function registerNextopCliRoutes(
  app: FastifyInstance,
  options: {
    agentOperations: AgentCliOperations;
    canvasOperations: CanvasOperations;
    chatOperations: ChatOperations;
    env: ServerEnv;
    jobOperations: JobOperations;
    nextopManagedCredentials?: NextopManagedCredentialService;
    projectOperations: ProjectOperations;
    settingsService?: SettingsService;
    skillOperations: SkillOperations;
  },
) {
  const route = (
    path: string,
    handler: (body: unknown) => Promise<unknown>,
    statusCode = 200,
  ) => {
    const register = (routePath: string) =>
      app.post(routePath, async (request, reply) => {
        try {
          const result = await handler(request.body);
          return sendCliJson(reply, result, statusCode);
        } catch (error) {
          return sendCliRouteError(error, reply);
        }
      });
    register(path);
    if (path.startsWith("/tutti/cli/")) {
      register(path.replace("/tutti/cli/", "/nextop/cli/"));
    }
  };

  route("/tutti/cli/status", async (body) => {
    emptyBodySchema.parse(body);
    return {
      ok: true,
      service: "ai-media-canvas-server",
      version: options.env.version,
      runtime: {
        webOrigin: options.env.webOrigin,
        trustedLocalAgentMode: options.env.trustedLocalAgentMode,
      },
    };
  });

  route("/tutti/cli/projects/list", async () =>
    options.projectOperations.listProjects(),
  );
  route("/tutti/cli/projects/get", async (body) => {
    return options.projectOperations.getProject(
      parseRequiredString(body, "project-id"),
    );
  });
  route(
    "/tutti/cli/projects/create",
    async (body) => {
      const payload = projectCreateRequestSchema.parse(
        projectCreateCliBodySchema.parse(body),
      );
      return options.projectOperations.createProject(payload);
    },
    201,
  );

  route("/tutti/cli/canvases/get", async (body) => {
    return options.canvasOperations.getCanvas(
      parseRequiredString(body, "canvas-id"),
    );
  });
  route("/tutti/cli/canvases/save", async (body) => {
    const payload = canvasSaveCliBodySchema.parse(body);
    const content = canvasContentSchema.parse(
      JSON.parse(payload["content-json"]),
    );
    return options.canvasOperations.saveCanvas(payload["canvas-id"], content);
  });
  route("/tutti/cli/canvases/insert-image", async (body) => {
    const payload = canvasInsertImageCliBodySchema.parse(body);
    const placement = {
      ...(payload.x !== undefined ? { x: payload.x } : {}),
      ...(payload.y !== undefined ? { y: payload.y } : {}),
      ...(payload["placement-width"] !== undefined
        ? { width: payload["placement-width"] }
        : {}),
      ...(payload["placement-height"] !== undefined
        ? { height: payload["placement-height"] }
        : {}),
    };
    return options.canvasOperations.importImageFile({
      canvasId: payload["canvas-id"],
      filePath: payload["file-path"],
      ...(payload["project-id"] ? { projectId: payload["project-id"] } : {}),
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload["mime-type"] ? { mimeType: payload["mime-type"] } : {}),
      ...(payload.width !== undefined ? { width: payload.width } : {}),
      ...(payload.height !== undefined ? { height: payload.height } : {}),
      ...(Object.keys(placement).length > 0 ? { placement } : {}),
    });
  });
  route("/tutti/cli/canvases/insert-video", async (body) => {
    const payload = canvasInsertVideoCliBodySchema.parse(body);
    const placement = {
      ...(payload.x !== undefined ? { x: payload.x } : {}),
      ...(payload.y !== undefined ? { y: payload.y } : {}),
      ...(payload["placement-width"] !== undefined
        ? { width: payload["placement-width"] }
        : {}),
      ...(payload["placement-height"] !== undefined
        ? { height: payload["placement-height"] }
        : {}),
    };
    return options.canvasOperations.importVideoFile({
      canvasId: payload["canvas-id"],
      filePath: payload["file-path"],
      ...(payload["project-id"] ? { projectId: payload["project-id"] } : {}),
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload["mime-type"] ? { mimeType: payload["mime-type"] } : {}),
      ...(payload.width !== undefined ? { width: payload.width } : {}),
      ...(payload.height !== undefined ? { height: payload.height } : {}),
      ...(payload.duration !== undefined
        ? { durationSeconds: payload.duration }
        : {}),
      ...(Object.keys(placement).length > 0 ? { placement } : {}),
    });
  });

  route("/tutti/cli/sessions/list", async (body) => {
    return options.chatOperations.listSessions(
      parseRequiredString(body, "canvas-id"),
    );
  });
  route(
    "/tutti/cli/sessions/create",
    async (body) => {
      const payload = sessionCreateCliBodySchema.parse(body);
      return options.chatOperations.createSession(
        payload["canvas-id"],
        payload.title,
      );
    },
    201,
  );
  route("/tutti/cli/messages/list", async (body) => {
    return options.chatOperations.listMessages(
      parseRequiredString(body, "session-id"),
    );
  });
  route(
    "/tutti/cli/messages/create",
    async (body) => {
      const payload = messageCreateCliBodySchema.parse(body);
      return options.chatOperations.createMessage(
        payload["session-id"],
        chatMessageCreateRequestSchema.parse({
          role: payload.role,
          content: payload.content,
        }),
      );
    },
    201,
  );

  route(
    "/tutti/cli/agent/run",
    async (body) => {
      const payload = agentRunCliBodySchema.parse(body);
      return options.agentOperations.startRun(
        runCreateRequestSchema.parse({
          sessionId: payload["session-id"],
          conversationId: payload["conversation-id"],
          prompt: payload.prompt,
          ...(payload["canvas-id"] ? { canvasId: payload["canvas-id"] } : {}),
          ...(payload.model ? { model: payload.model } : {}),
          ...(payload["runtime-kind"]
            ? { runtimeKind: payload["runtime-kind"] }
            : {}),
          ...(payload["runtime-provider"]
            ? { runtimeProvider: payload["runtime-provider"] }
            : {}),
        }),
      );
    },
    202,
  );
  route("/tutti/cli/agent/events", async (body) => {
    const payload = agentEventsCliBodySchema.parse(body);
    return options.agentOperations.listRunEvents(
      payload["run-id"],
      payload.cursor ?? 0,
    );
  });
  route(
    "/tutti/cli/agent/cancel",
    async (body) => {
      return options.agentOperations.cancelRun(
        parseRequiredString(body, "run-id"),
      );
    },
    202,
  );

  route(
    "/tutti/cli/generation/image",
    async (body) => {
      const payload = generationImageCliBodySchema.parse(body);
      return options.jobOperations.createImageJob(
        createImageJobRequestSchema.parse({
          prompt: payload.prompt,
          model: payload.model,
          ...(payload["project-id"]
            ? { project_id: payload["project-id"] }
            : {}),
          ...(payload["canvas-id"] ? { canvas_id: payload["canvas-id"] } : {}),
          ...(payload["session-id"]
            ? { session_id: payload["session-id"] }
            : {}),
          ...(payload["aspect-ratio"]
            ? { aspect_ratio: payload["aspect-ratio"] }
            : {}),
          ...(payload.quality ? { quality: payload.quality } : {}),
          ...(payload.size ? { size: payload.size } : {}),
          ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
          ...(payload["input-images"]
            ? { input_images: splitCsv(payload["input-images"]) }
            : {}),
        }),
      );
    },
    201,
  );
  route(
    "/tutti/cli/generation/video",
    async (body) => {
      const payload = generationVideoCliBodySchema.parse(body);
      return options.jobOperations.createVideoJob(
        createVideoJobRequestSchema.parse({
          prompt: payload.prompt,
          model: payload.model,
          ...(payload["project-id"]
            ? { project_id: payload["project-id"] }
            : {}),
          ...(payload["canvas-id"] ? { canvas_id: payload["canvas-id"] } : {}),
          ...(payload["session-id"]
            ? { session_id: payload["session-id"] }
            : {}),
          ...(payload.duration ? { duration: payload.duration } : {}),
          ...(payload.resolution ? { resolution: payload.resolution } : {}),
          ...(payload["aspect-ratio"]
            ? { aspect_ratio: payload["aspect-ratio"] }
            : {}),
          ...(payload["input-images"]
            ? { input_images: splitCsv(payload["input-images"]) }
            : {}),
          ...(payload["input-video"]
            ? { input_video: payload["input-video"] }
            : {}),
          ...(payload["negative-prompt"]
            ? { negative_prompt: payload["negative-prompt"] }
            : {}),
          ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
          ...(payload["enable-audio"] !== undefined
            ? { enable_audio: payload["enable-audio"] }
            : {}),
        }),
      );
    },
    201,
  );

  route("/tutti/cli/jobs/list", async (body) => {
    const payload = jobListCliBodySchema.parse(body ?? {});
    return options.jobOperations.listJobs({
      ...(payload.status ? { status: payload.status as never } : {}),
      ...(payload["job-type"] ? { jobType: payload["job-type"] as never } : {}),
    });
  });
  route("/tutti/cli/jobs/get", async (body) => {
    return options.jobOperations.getJob(parseRequiredString(body, "job-id"));
  });
  route("/tutti/cli/jobs/cancel", async (body) => {
    return options.jobOperations.cancelJob(parseRequiredString(body, "job-id"));
  });

  route("/tutti/cli/models/list", async () => ({
    models: await listAgentModels({
      env: options.env,
      logger: app.log,
      ...(options.nextopManagedCredentials
        ? { nextopManagedCredentials: options.nextopManagedCredentials }
        : {}),
      ...(options.settingsService
        ? { settingsService: options.settingsService }
        : {}),
    }),
  }));
  route("/tutti/cli/models/image", async () => ({
    models: await listImageModels(options.env, options.settingsService),
  }));
  route("/tutti/cli/models/video", async () => ({
    models: await listVideoModels(options.env, options.settingsService),
  }));

  route("/tutti/cli/skills/list", async () =>
    options.skillOperations.listInstalledSkills(),
  );
  route("/tutti/cli/skills/get", async (body) => {
    return options.skillOperations.getSkill(
      parseRequiredString(body, "skill-id"),
    );
  });
  route("/tutti/cli/skills/enable", async (body) => {
    const payload = skillEnableCliBodySchema.parse(body);
    return options.skillOperations.toggleSkill(
      payload["skill-id"],
      payload.enabled,
    );
  });
  route("/tutti/cli/skills/install", async (body) => {
    return options.skillOperations.installCatalogSkill(
      parseRequiredString(body, "skill-id"),
    );
  });
}

export const registerTuttiCliRoutes = registerNextopCliRoutes;

function parseRequiredString(body: unknown, key: string) {
  const payload = z.record(z.string(), z.unknown()).parse(body);
  const value = payload[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required input: ${key}`);
  }
  return value;
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sendCliRouteError(error: unknown, reply: FastifyReply) {
  if (
    error instanceof CanvasServiceError ||
    error instanceof ChatServiceError ||
    error instanceof JobServiceError ||
    error instanceof ProjectServiceError ||
    error instanceof SkillServiceError
  ) {
    return sendCliError(
      reply,
      { code: error.code, message: error.message },
      error.statusCode,
    );
  }

  if (
    isZodError(error) ||
    error instanceof SyntaxError ||
    (error instanceof Error &&
      error.message.startsWith("Missing required input:"))
  ) {
    return sendCliError(
      reply,
      {
        code: "application_error",
        message: "Invalid command input.",
      },
      400,
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "statusCode" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string" &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    const typedError = error as {
      code: string;
      message: string;
      statusCode: number;
    };
    return sendCliError(
      reply,
      { code: typedError.code, message: typedError.message },
      typedError.statusCode,
    );
  }

  return sendCliError(
    reply,
    {
      code: "application_error",
      message: error instanceof Error ? error.message : "Command failed.",
    },
    500,
  );
}
