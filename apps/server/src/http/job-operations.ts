import {
  type BackgroundJobStatus,
  type BackgroundJobType,
  type CreateImageJobRequest,
  type CreateVideoJobRequest,
  jobListResponseSchema,
  jobResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import type { JobService } from "../features/jobs/job-service.js";

const LOCAL_WORKSPACE_ID = "local-workspace";
const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux-kontext-pro";
const DEFAULT_VIDEO_MODEL = "google-official/veo-3.1-generate-preview";

export type JobOperations = ReturnType<typeof createJobOperations>;

export function createJobOperations(options: {
  localUser: AuthenticatedUser;
  jobService: JobService;
}) {
  return {
    async createImageJob(payload: CreateImageJobRequest) {
      const model = payload.model ?? DEFAULT_IMAGE_MODEL;
      const job = await options.jobService.createJob(options.localUser, {
        workspaceId: LOCAL_WORKSPACE_ID,
        ...(payload.project_id ? { projectId: payload.project_id } : {}),
        ...(payload.canvas_id ? { canvasId: payload.canvas_id } : {}),
        ...(payload.session_id ? { sessionId: payload.session_id } : {}),
        ...(payload.thread_id ? { threadId: payload.thread_id } : {}),
        jobType: "image_generation",
        payload: {
          prompt: payload.prompt,
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
        },
      });
      return jobResponseSchema.parse({ job });
    },
    async createVideoJob(payload: CreateVideoJobRequest) {
      const model = payload.model ?? DEFAULT_VIDEO_MODEL;
      const job = await options.jobService.createJob(options.localUser, {
        workspaceId: LOCAL_WORKSPACE_ID,
        ...(payload.project_id ? { projectId: payload.project_id } : {}),
        ...(payload.canvas_id ? { canvasId: payload.canvas_id } : {}),
        ...(payload.session_id ? { sessionId: payload.session_id } : {}),
        ...(payload.thread_id ? { threadId: payload.thread_id } : {}),
        jobType: "video_generation",
        payload: {
          prompt: payload.prompt,
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
