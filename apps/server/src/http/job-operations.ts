import {
  type BackgroundJobStatus,
  type BackgroundJobType,
  type CreateImageJobRequest,
  type CreateVideoJobRequest,
  jobListResponseSchema,
  jobResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { ServerEnv } from "../config/env.js";
import type { JobService } from "../features/jobs/job-service.js";
import {
  LOCAL_WORKSPACE_ID,
  type SettingsService,
  refreshGenerationProviders,
} from "../features/settings/settings-service.js";
import { evaluateCodexImagegenDelegation } from "../generation/codex-imagegen-delegation.js";
import {
  getDefaultImageModelId,
  getDefaultVideoModelId,
} from "../generation/default-models.js";
import {
  validateImageGenerationParams,
  validateVideoGenerationParams,
} from "../generation/model-schemas.js";
import { resolveImageProviderName } from "../generation/providers/registry.js";

export type JobOperations = ReturnType<typeof createJobOperations>;

export function createJobOperations(options: {
  env?: ServerEnv;
  localUser: AuthenticatedUser;
  jobService: JobService;
  settingsService?: SettingsService;
}) {
  const getEffectiveEnv = async () => {
    if (options.settingsService) {
      return options.settingsService.getEffectiveServerEnv(LOCAL_WORKSPACE_ID);
    }
    return options.env;
  };

  const resolveDefaultModel = async (kind: "image" | "video") => {
    const effectiveEnv = await getEffectiveEnv();
    if (effectiveEnv) {
      refreshGenerationProviders(effectiveEnv);
    }
    return kind === "image"
      ? getDefaultImageModelId()
      : getDefaultVideoModelId();
  };

  return {
    async createImageJob(payload: CreateImageJobRequest) {
      const model = payload.model ?? (await resolveDefaultModel("image"));
      validateImageGenerationParams({
        prompt: payload.prompt,
        model,
        ...(payload.aspect_ratio ? { aspectRatio: payload.aspect_ratio } : {}),
        ...(payload.quality ? { quality: payload.quality } : {}),
        ...(payload.input_images ? { inputImages: payload.input_images } : {}),
        ...(payload.size ? { size: payload.size } : {}),
        ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
      });
      const workspaceSettings = options.settingsService
        ? await options.settingsService.getWorkspaceSettings(
            options.localUser,
            LOCAL_WORKSPACE_ID,
          )
        : undefined;
      const imageProvider = resolveImageProviderName(model);
      const codexImagegenDelegation =
        workspaceSettings?.codexImagegenDelegation ?? "ask";
      const delegationDecision = evaluateCodexImagegenDelegation({
        imageProvider,
        setting: codexImagegenDelegation,
        consentBudget: payload.codex_imagegen_consent === "allow-once" ? 1 : 0,
        ...(payload.caller_provider
          ? { callerProvider: payload.caller_provider }
          : {}),
      });
      if (delegationDecision.status === "blocked") {
        throw {
          code:
            delegationDecision.reason === "needs_confirmation"
              ? "codex_imagegen_confirmation_required"
              : "codex_imagegen_disabled_by_user",
          message:
            delegationDecision.reason === "needs_confirmation"
              ? "Codex image generation requires user confirmation before a non-Codex agent can use it."
              : "Codex image generation is disabled for non-Codex agents in workspace settings.",
          statusCode: 409,
        };
      }
      const shouldPersistCodexDelegation =
        imageProvider === "codex-imagegen" &&
        Boolean(payload.caller_provider) &&
        payload.caller_provider !== "codex";
      const job = await options.jobService.createJob(options.localUser, {
        workspaceId: LOCAL_WORKSPACE_ID,
        ...(payload.project_id ? { projectId: payload.project_id } : {}),
        ...(payload.canvas_id ? { canvasId: payload.canvas_id } : {}),
        ...(payload.session_id ? { sessionId: payload.session_id } : {}),
        ...(payload.thread_id ? { threadId: payload.thread_id } : {}),
        jobType: "image_generation",
        payload: {
          prompt: payload.prompt,
          ...(payload.title ? { title: payload.title } : {}),
          model,
          ...(payload.aspect_ratio
            ? { aspect_ratio: payload.aspect_ratio }
            : {}),
          ...(payload.quality ? { quality: payload.quality } : {}),
          ...(payload.input_images
            ? { input_images: payload.input_images }
            : {}),
          ...(payload.size ? { size: payload.size } : {}),
          ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
          ...(payload.caller_provider
            ? { caller_provider: payload.caller_provider }
            : {}),
          ...(payload.codex_imagegen_consent
            ? { codex_imagegen_consent: payload.codex_imagegen_consent }
            : {}),
          ...(shouldPersistCodexDelegation
            ? { codex_imagegen_delegation_allowed: true }
            : {}),
        },
      });
      return jobResponseSchema.parse({ job });
    },
    async createVideoJob(payload: CreateVideoJobRequest) {
      const model = payload.model ?? (await resolveDefaultModel("video"));
      validateVideoGenerationParams({
        prompt: payload.prompt,
        model,
        ...(payload.duration ? { duration: payload.duration } : {}),
        ...(payload.resolution
          ? {
              resolution: payload.resolution as
                | "480p"
                | "720p"
                | "1080p"
                | "4k"
                | "2160p",
            }
          : {}),
        ...(payload.aspect_ratio ? { aspectRatio: payload.aspect_ratio } : {}),
        ...(payload.input_images ? { inputImages: payload.input_images } : {}),
        ...(payload.input_video ? { inputVideo: payload.input_video } : {}),
        ...(payload.video_mode ? { videoMode: payload.video_mode } : {}),
        ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
        ...(payload.negative_prompt
          ? { negativePrompt: payload.negative_prompt }
          : {}),
        ...(payload.frame_rate !== undefined
          ? { frameRate: payload.frame_rate }
          : {}),
        ...(payload.num_frames !== undefined
          ? { numFrames: payload.num_frames }
          : {}),
        ...(payload.enable_audio !== undefined
          ? { enableAudio: payload.enable_audio }
          : {}),
      });
      const job = await options.jobService.createJob(options.localUser, {
        workspaceId: LOCAL_WORKSPACE_ID,
        ...(payload.project_id ? { projectId: payload.project_id } : {}),
        ...(payload.canvas_id ? { canvasId: payload.canvas_id } : {}),
        ...(payload.session_id ? { sessionId: payload.session_id } : {}),
        ...(payload.thread_id ? { threadId: payload.thread_id } : {}),
        jobType: "video_generation",
        payload: {
          prompt: payload.prompt,
          ...(payload.title ? { title: payload.title } : {}),
          model,
          ...(payload.duration ? { duration: payload.duration } : {}),
          ...(payload.resolution ? { resolution: payload.resolution } : {}),
          ...(payload.aspect_ratio
            ? { aspect_ratio: payload.aspect_ratio }
            : {}),
          ...(payload.input_images
            ? { input_images: payload.input_images }
            : {}),
          ...(payload.input_video ? { input_video: payload.input_video } : {}),
          ...(payload.video_mode ? { video_mode: payload.video_mode } : {}),
          ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
          ...(payload.negative_prompt
            ? { negative_prompt: payload.negative_prompt }
            : {}),
          ...(payload.frame_rate !== undefined
            ? { frame_rate: payload.frame_rate }
            : {}),
          ...(payload.num_frames !== undefined
            ? { num_frames: payload.num_frames }
            : {}),
          ...(payload.enable_audio !== undefined
            ? { enable_audio: payload.enable_audio }
            : {}),
        },
      });
      return jobResponseSchema.parse({ job });
    },
    async listJobs(filters: {
      status?: BackgroundJobStatus;
      jobType?: BackgroundJobType;
    }) {
      const jobs = await options.jobService.listJobs(
        options.localUser,
        filters,
      );
      return jobListResponseSchema.parse({ jobs });
    },
    async getJob(jobId: string) {
      const job = await options.jobService.getJob(options.localUser, jobId);
      return jobResponseSchema.parse({ job });
    },
    async cancelJob(jobId: string) {
      const job = await options.jobService.cancelJob(options.localUser, jobId);
      return jobResponseSchema.parse({ job });
    },
  };
}
