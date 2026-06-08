import type { BackgroundJob } from "@aimc/shared";

export type WorkerRunnerJobService = {
  claimPendingJobs(
    workerId: string,
    limit?: number,
  ): Promise<BackgroundJob[]>;
};

export type WorkerRunnerOptions = {
  workerId: string;
  maxBatchSize: number;
  jobService: WorkerRunnerJobService;
  executeJob(job: BackgroundJob): Promise<void>;
  onJobError?(error: unknown, job: BackgroundJob): void;
};

export function createWorkerRunner(options: WorkerRunnerOptions) {
  const activeJobs = new Set<Promise<void>>();
  const maxBatchSize = Math.max(1, options.maxBatchSize);

  async function tick() {
    const capacity = maxBatchSize - activeJobs.size;
    if (capacity <= 0) return;

    const jobs = await options.jobService.claimPendingJobs(
      options.workerId,
      capacity,
    );
    for (const job of jobs) {
      const runningJob = runJob(job);
      activeJobs.add(runningJob);
      void runningJob.finally(() => activeJobs.delete(runningJob));
    }
  }

  async function runJob(job: BackgroundJob) {
    try {
      await options.executeJob(job);
    } catch (error) {
      options.onJobError?.(error, job);
    }
  }

  async function waitForIdle() {
    while (activeJobs.size > 0) {
      await Promise.allSettled([...activeJobs]);
    }
  }

  return {
    tick,
    waitForIdle,
    getActiveCount: () => activeJobs.size,
  };
}
