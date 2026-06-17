import type { BackgroundJob } from "@aimc/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../auth/types.js";
import type { JobOperations } from "./job-operations.js";
import { registerJobRoutes } from "./jobs.js";

const localUser: AuthenticatedUser = {
  email: "local@example.com",
  id: "local-user",
  userMetadata: {},
};

const apps: Array<ReturnType<typeof Fastify>> = [];

describe("registerJobRoutes", () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("accepts keyframe video job payloads with base64 image data", async () => {
    const createVideoJob = vi.fn(async (payload) => ({
      job: createBackgroundJob({
        jobType: "video_generation",
        payload,
      }),
    }));
    const app = Fastify();
    apps.push(app);
    await registerJobRoutes(app, {
      localUser,
      jobService: {} as never,
      jobOperations: {
        createVideoJob,
      } as unknown as JobOperations,
    });

    const largeImageDataUrl = `data:image/png;base64,${"a".repeat(1_200_000)}`;
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/video-generation",
      payload: {
        prompt: "Generate a short product video",
        input_images: [largeImageDataUrl, largeImageDataUrl],
        video_mode: "keyframes",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createVideoJob).toHaveBeenCalledWith({
      prompt: "Generate a short product video",
      input_images: [largeImageDataUrl, largeImageDataUrl],
      video_mode: "keyframes",
    });
  });
});

function createBackgroundJob(input: {
  jobType: BackgroundJob["job_type"];
  payload: BackgroundJob["payload"];
}): BackgroundJob {
  return {
    id: "job-1",
    workspace_id: "local-workspace",
    project_id: null,
    canvas_id: null,
    session_id: null,
    thread_id: null,
    queue_name: "video_generation_jobs",
    job_type: input.jobType,
    status: "queued",
    payload: input.payload,
    result: null,
    error_code: null,
    error_message: null,
    attempt_count: 0,
    max_attempts: 3,
    created_by: localUser.id,
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:00.000Z",
    started_at: null,
    completed_at: null,
    failed_at: null,
    canceled_at: null,
    remote_provider: null,
    remote_task_id: null,
    remote_status: null,
    remote_updated_at: null,
  };
}
