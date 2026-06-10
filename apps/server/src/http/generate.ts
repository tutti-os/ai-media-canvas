import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { applicationErrorResponseSchema } from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { ServerEnv } from "../config/env.js";
import type { JobService } from "../features/jobs/job-service.js";
import {
  LOCAL_WORKSPACE_ID,
  type SettingsService,
  applyEffectiveProviderEnv,
  refreshGenerationProviders,
} from "../features/settings/settings-service.js";
import type { UploadService } from "../features/uploads/upload-service.js";
import { getDefaultImageModelId } from "../generation/default-models.js";
import { loadGeneratedAsset } from "../generation/generated-asset.js";
import { generateImage } from "../generation/image-generation.js";
import { resolveImageProviderName } from "../generation/providers/registry.js";
import { GenerationError } from "../generation/utils.js";

const generateImageRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  quality: z.enum(["standard", "hd", "ultra"]).optional(),
  inputImages: z.array(z.string()).max(4).optional(),
  size: z
    .string()
    .regex(/^\d+x\d+$/)
    .optional(),
  seed: z.number().int().optional(),
  projectId: z.string().optional(),
});

const generateVideoRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  duration: z.number().int().min(3).max(16).optional(),
  resolution: z.enum(["720p", "1080p", "4k"]).optional(),
  aspectRatio: z.enum(["16:9", "9:16"]).optional(),
  inputImages: z.array(z.string()).max(3).optional(),
  inputVideo: z.string().optional(),
  videoMode: z.enum(["multivideo", "keyframes"]).optional(),
  seed: z.number().int().optional(),
  negativePrompt: z.string().min(1).optional(),
  frameRate: z.number().int().positive().max(60).optional(),
  numFrames: z.number().int().positive().max(441).optional(),
  enableAudio: z.boolean().optional(),
  projectId: z.string().optional(),
  canvasId: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
});

const VIDEO_GENERATION_POLL_INTERVAL_MS = 10_000;
const VIDEO_GENERATION_MAX_WAIT_MS = 1_950_000;

export async function registerGenerateRoutes(
  app: FastifyInstance,
  options: {
    env: ServerEnv;
    localUser: AuthenticatedUser;
    jobService: JobService;
    settingsService?: SettingsService;
    uploadService: UploadService;
  },
) {
  app.post("/api/agent/generate-image", async (request, reply) => {
    let payload: z.infer<typeof generateImageRequestSchema>;
    try {
      payload = generateImageRequestSchema.parse(request.body);
    } catch {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Invalid request body.",
          },
        }),
      );
    }

    try {
      const effectiveEnv = options.settingsService
        ? await options.settingsService.getEffectiveServerEnv(
            LOCAL_WORKSPACE_ID,
          )
        : options.env;
      applyEffectiveProviderEnv(effectiveEnv);
      refreshGenerationProviders(effectiveEnv);
      const model = payload.model ?? getDefaultImageModelId();
      const providerName = resolveImageProviderName(model);
      const generated = await generateImage(providerName, {
        prompt: payload.prompt,
        model,
        ...(payload.aspectRatio ? { aspectRatio: payload.aspectRatio } : {}),
        ...(payload.quality ? { quality: payload.quality } : {}),
        ...(payload.size ? { size: payload.size } : {}),
        ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
        ...(payload.inputImages?.length
          ? { inputImages: payload.inputImages }
          : {}),
      });

      const { buffer, mimeType } = await loadGeneratedAsset(
        generated.url,
        generated.mimeType || "image/png",
      );
      const uploaded = await options.uploadService.uploadFile(
        options.localUser,
        {
          bucket: "project-assets",
          fileName: `${providerName}-${Date.now()}`,
          fileBuffer: buffer,
          mimeType,
          ...(payload.projectId ? { projectId: payload.projectId } : {}),
        },
      );

      return reply.code(200).send({
        url: uploaded.url,
        assetId: uploaded.asset.id,
        prompt: payload.prompt,
        mimeType: uploaded.asset.mimeType ?? generated.mimeType,
        width: generated.width,
        height: generated.height,
      });
    } catch (error) {
      return sendGenerationError(reply, error);
    }
  });

  app.post("/api/agent/generate-video", async (request, reply) => {
    let payload: z.infer<typeof generateVideoRequestSchema>;
    try {
      payload = generateVideoRequestSchema.parse(request.body);
    } catch {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Invalid request body.",
          },
        }),
      );
    }

    const model = payload.model ?? "google-official/veo-3.1-generate-preview";
    try {
      const job = await options.jobService.createJob(options.localUser, {
        workspaceId: LOCAL_WORKSPACE_ID,
        ...(payload.projectId ? { projectId: payload.projectId } : {}),
        ...(payload.canvasId ? { canvasId: payload.canvasId } : {}),
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
        ...(payload.threadId ? { threadId: payload.threadId } : {}),
        jobType: "video_generation",
        payload: {
          prompt: payload.prompt,
          model,
          ...(payload.duration ? { duration: payload.duration } : {}),
          ...(payload.resolution ? { resolution: payload.resolution } : {}),
          ...(payload.aspectRatio ? { aspect_ratio: payload.aspectRatio } : {}),
          ...(payload.inputImages ? { input_images: payload.inputImages } : {}),
          ...(payload.inputVideo ? { input_video: payload.inputVideo } : {}),
          ...(payload.videoMode ? { video_mode: payload.videoMode } : {}),
          ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
          ...(payload.negativePrompt
            ? { negative_prompt: payload.negativePrompt }
            : {}),
          ...(payload.frameRate !== undefined
            ? { frame_rate: payload.frameRate }
            : {}),
          ...(payload.numFrames !== undefined
            ? { num_frames: payload.numFrames }
            : {}),
          ...(payload.enableAudio !== undefined
            ? { enable_audio: payload.enableAudio }
            : {}),
        },
      });
      const result = await pollJobUntilDone(
        options.jobService,
        options.localUser,
        job.id,
        VIDEO_GENERATION_POLL_INTERVAL_MS,
        VIDEO_GENERATION_MAX_WAIT_MS,
      );

      if ("error" in result) {
        return reply.code(502).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "generation_failed",
              message: result.error,
            },
          }),
        );
      }

      return reply.code(200).send({
        url: result.signed_url,
        assetId: result.asset_id,
        prompt: payload.prompt,
        mimeType: result.mime_type,
        width: result.width,
        height: result.height,
        durationSeconds: result.duration_seconds,
      });
    } catch (error) {
      return sendGenerationError(reply, error);
    }
  });
}

async function pollJobUntilDone(
  jobService: JobService,
  user: AuthenticatedUser,
  jobId: string,
  pollIntervalMs: number,
  maxWaitMs: number,
): Promise<Record<string, unknown> | { error: string }> {
  const startedAt = Date.now();

  for (;;) {
    const job = await jobService.getJob(user, jobId);
    if (job.status === "succeeded") {
      return (job.result ?? {}) as Record<string, unknown>;
    }

    if (job.status === "dead_letter") {
      return { error: job.error_message ?? "Generation failed." };
    }

    if (job.status === "canceled") {
      return { error: "Generation was canceled." };
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      return { error: `Job ${jobId} timed out after ${maxWaitMs}ms` };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

function sendGenerationError(
  reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "Generation failed.";
  if (error instanceof GenerationError) {
    const statusCode = [
      "provider_not_found",
      "model_not_found",
      "invalid_input",
      "input_fetch_error",
      "safety_filter",
    ].includes(error.code)
      ? 400
      : 502;
    const code =
      error.code === "provider_not_found" || error.code === "model_not_found"
        ? "provider_not_configured"
        : "generation_failed";
    return reply.code(statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code,
          message,
        },
      }),
    );
  }

  return reply.code(502).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: "generation_failed",
        message,
      },
    }),
  );
}
