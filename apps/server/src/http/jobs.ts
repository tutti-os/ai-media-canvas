import type { FastifyInstance, FastifyReply } from "fastify";

import {
  type BackgroundJobStatus,
  type BackgroundJobType,
  applicationErrorResponseSchema,
  createImageJobRequestSchema,
  createVideoJobRequestSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  type JobService,
  JobServiceError,
} from "../features/jobs/job-service.js";
import { GenerationError } from "../generation/utils.js";
import { type JobOperations, createJobOperations } from "./job-operations.js";

const VIDEO_JOB_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

export async function registerJobRoutes(
  app: FastifyInstance,
  options: {
    localUser: AuthenticatedUser;
    jobService: JobService;
    jobOperations?: JobOperations;
  },
) {
  const jobOperations =
    options.jobOperations ??
    createJobOperations({
      localUser: options.localUser,
      jobService: options.jobService,
    });

  app.post("/api/jobs/image-generation", async (request, reply) => {
    try {
      const payload = createImageJobRequestSchema.parse(request.body);
      return reply.code(201).send(await jobOperations.createImageJob(payload));
    } catch (error) {
      if (isZodError(error)) return sendValidationError(reply);
      if (isGenerationValidationError(error)) {
        return sendGenerationValidationError(reply, error);
      }
      return sendJobError(error, reply, "job_create_failed");
    }
  });

  app.post(
    "/api/jobs/video-generation",
    { bodyLimit: VIDEO_JOB_BODY_LIMIT_BYTES }, // 10 MB — keyframe video requests may include base64 image data
    async (request, reply) => {
      try {
        const payload = createVideoJobRequestSchema.parse(request.body);
        return reply
          .code(201)
          .send(await jobOperations.createVideoJob(payload));
      } catch (error) {
        if (isZodError(error)) return sendValidationError(reply);
        if (isGenerationValidationError(error)) {
          return sendGenerationValidationError(reply, error);
        }
        return sendJobError(error, reply, "job_create_failed");
      }
    },
  );

  app.get("/api/jobs/:jobId", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      return reply.code(200).send(await jobOperations.getJob(jobId));
    } catch (error) {
      return sendJobError(error, reply, "job_query_failed");
    }
  });

  app.get("/api/jobs", async (request, reply) => {
    try {
      const query = request.query as { status?: string; job_type?: string };
      const filters: {
        status?: BackgroundJobStatus;
        jobType?: BackgroundJobType;
      } = {};
      if (query.status) filters.status = query.status as BackgroundJobStatus;
      if (query.job_type) filters.jobType = query.job_type as BackgroundJobType;
      return reply.code(200).send(await jobOperations.listJobs(filters));
    } catch (error) {
      return sendJobError(error, reply, "job_query_failed");
    }
  });

  app.post("/api/jobs/:jobId/cancel", async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      return reply.code(200).send(await jobOperations.cancelJob(jobId));
    } catch (error) {
      return sendJobError(error, reply, "job_cancel_failed");
    }
  });
}

function sendGenerationValidationError(
  reply: FastifyReply,
  error: GenerationError,
) {
  return reply.code(400).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: error.code,
        message: error.message,
      },
    }),
  );
}

function sendValidationError(reply: FastifyReply) {
  return reply.code(400).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: "application_error",
        message: "Invalid request body.",
      },
    }),
  );
}

function sendJobError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode: "job_create_failed" | "job_query_failed" | "job_cancel_failed",
) {
  if (error instanceof JobServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  const fallbackMessage =
    fallbackCode === "job_query_failed"
      ? "Unable to load local jobs."
      : fallbackCode === "job_cancel_failed"
        ? "Unable to cancel local job."
        : "Unable to create local job.";

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: fallbackCode,
        message: fallbackMessage,
      },
    }),
  );
}

function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}

function isGenerationValidationError(error: unknown): error is GenerationError {
  return error instanceof GenerationError && error.code === "invalid_input";
}
