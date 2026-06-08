import type { BackgroundJob } from "@aimc/shared";
import { describe, expect, it, vi } from "vitest";

import { createWorkerRunner } from "./worker-runner.js";

function makeJob(id: string): BackgroundJob {
  return {
    id,
    workspace_id: "local-workspace",
    project_id: null,
    canvas_id: null,
    session_id: null,
    thread_id: null,
    queue_name: "video_generation_jobs",
    job_type: "video_generation",
    status: "running",
    payload: { prompt: id },
    result: null,
    error_code: null,
    error_message: null,
    attempt_count: 1,
    max_attempts: 3,
    created_by: "local-user",
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    started_at: "2026-06-08T00:00:00.000Z",
    completed_at: null,
    failed_at: null,
    canceled_at: null,
  };
}

describe("worker runner", () => {
  it("keeps polling for capacity while a long job is still running", async () => {
    const pendingJobs: BackgroundJob[] = [makeJob("video-long")];
    const started: string[] = [];
    let releaseLongJob!: () => void;
    const longJobDone = new Promise<void>((resolve) => {
      releaseLongJob = resolve;
    });
    const claimPendingJobs = vi.fn(async (_workerId: string, limit?: number) =>
      pendingJobs.splice(0, limit ?? 1),
    );
    const executeJob = vi.fn(async (job: BackgroundJob) => {
      started.push(job.id);
      if (job.id === "video-long") {
        await longJobDone;
      }
    });
    const runner = createWorkerRunner({
      workerId: "w1",
      maxBatchSize: 2,
      jobService: { claimPendingJobs },
      executeJob,
    });

    await runner.tick();
    pendingJobs.push(makeJob("image-after-video"));
    await runner.tick();
    await Promise.resolve();

    expect(started).toEqual(["video-long", "image-after-video"]);
    expect(runner.getActiveCount()).toBe(1);
    expect(claimPendingJobs).toHaveBeenNthCalledWith(1, "w1", 2);
    expect(claimPendingJobs).toHaveBeenNthCalledWith(2, "w1", 1);

    releaseLongJob();
    await runner.waitForIdle();
    expect(runner.getActiveCount()).toBe(0);
  });
});
