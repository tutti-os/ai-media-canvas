import type { BackgroundJob } from "@aimc/shared";

import type { LocalStore } from "../../local/store.js";
import type { JobService } from "./job-service.js";
import {
  executeImageGenerationJob,
  isRetryableImageGenerationError,
} from "./executors/image-generation.js";
import {
  executeVideoGenerationJob,
  isRetryableVideoGenerationError,
} from "./executors/video-generation.js";

export async function executeBackgroundJob(
  store: LocalStore,
  jobService: JobService,
  job: BackgroundJob,
) {
  try {
    let result: Record<string, unknown>;
    if (job.job_type === "image_generation") {
      result = await executeImageGenerationJob(store, job);
    } else if (job.job_type === "video_generation") {
      result = await executeVideoGenerationJob(store, job);
    } else {
      throw new Error(`Unsupported job type: ${job.job_type}`);
    }
    return await jobService.markSucceeded(job.id, result);
  } catch (error) {
    const retryable =
      job.job_type === "image_generation"
        ? isRetryableImageGenerationError(error)
        : isRetryableVideoGenerationError(error);
    return jobService.markFailed({
      jobId: job.id,
      errorCode:
        error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code
          : "generation_failed",
      errorMessage:
        error instanceof Error ? error.message : "Background generation failed.",
      retryable,
    });
  }
}
