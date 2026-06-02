import type {
  BackgroundJob,
  BackgroundJobStatus,
  BackgroundJobType,
  ImageGenerationPayload,
  VideoGenerationPayload,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../../auth/types.js";
import type { LocalStore } from "../../local/store.js";

const QUEUE_MAP: Record<BackgroundJobType, string> = {
  image_generation: "image_generation_jobs",
  video_generation: "video_generation_jobs",
};

export class JobServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "job_not_found"
    | "job_create_failed"
    | "job_query_failed"
    | "job_cancel_failed";

  constructor(
    code: JobServiceError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "JobServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CreateJobInput = {
  workspaceId: string;
  projectId?: string;
  canvasId?: string;
  sessionId?: string;
  threadId?: string;
  jobType: BackgroundJobType;
  payload: ImageGenerationPayload | VideoGenerationPayload;
  maxAttempts?: number;
};

export type JobService = {
  createJob(user: AuthenticatedUser, input: CreateJobInput): Promise<BackgroundJob>;
  getJob(user: AuthenticatedUser, jobId: string): Promise<BackgroundJob>;
  listJobs(
    user: AuthenticatedUser,
    filters?: { status?: BackgroundJobStatus; jobType?: BackgroundJobType },
  ): Promise<BackgroundJob[]>;
  cancelJob(user: AuthenticatedUser, jobId: string): Promise<BackgroundJob>;
  claimPendingJobs(workerId: string, limit?: number): Promise<BackgroundJob[]>;
  markSucceeded(jobId: string, result: Record<string, unknown>): Promise<BackgroundJob>;
  markFailed(input: {
    jobId: string;
    errorCode: string;
    errorMessage: string;
    retryable?: boolean;
    retryDelayMs?: number;
  }): Promise<BackgroundJob>;
};

export function createJobService(store: LocalStore): JobService {
  return {
    async createJob(_user, input) {
      try {
        return store.createBackgroundJob({
          jobType: input.jobType,
          queueName: QUEUE_MAP[input.jobType],
          payload: input.payload,
          ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
          ...(input.canvasId !== undefined ? { canvasId: input.canvasId } : {}),
          ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
          ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
          ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        });
      } catch {
        throw new JobServiceError("job_create_failed", "Unable to create local job.", 500);
      }
    },

    async getJob(_user, jobId) {
      const job = store.getBackgroundJob(jobId);
      if (!job) {
        throw new JobServiceError("job_not_found", "Job not found.", 404);
      }
      return job;
    },

    async listJobs(_user, filters) {
      try {
        return store.listBackgroundJobs(filters);
      } catch {
        throw new JobServiceError("job_query_failed", "Unable to list local jobs.", 500);
      }
    },

    async cancelJob(_user, jobId) {
      const job = store.cancelBackgroundJob(jobId);
      if (!job) {
        throw new JobServiceError(
          "job_not_found",
          "Job not found or can no longer be canceled.",
          404,
        );
      }
      return job;
    },

    async claimPendingJobs(workerId, limit) {
      return store.claimBackgroundJobs({ workerId, ...(limit ? { limit } : {}) });
    },

    async markSucceeded(jobId, result) {
      const job = store.markBackgroundJobSucceeded(jobId, result);
      if (!job) {
        throw new JobServiceError("job_not_found", "Job not found.", 404);
      }
      return job;
    },

    async markFailed(input) {
      const job = store.markBackgroundJobFailed(input);
      if (!job) {
        throw new JobServiceError("job_not_found", "Job not found.", 404);
      }
      return job;
    },
  };
}
