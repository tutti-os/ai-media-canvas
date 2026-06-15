import type { JobResponse } from "@aimc/shared";

import { ApiApplicationError } from "./api-errors";
import { getServerBaseUrl } from "./env";

export type GenerationJobType = "image_generation" | "video_generation";

export type GenerationJobWatchOptions = {
  jobType: GenerationJobType;
  signal?: AbortSignal;
  onSucceeded?: (result: Record<string, unknown>) => void;
  onFailed?: (error: unknown) => void;
};

export type GenerationJobSubscription = {
  promise: Promise<Record<string, unknown>>;
  unsubscribe: () => void;
};

type GenerationJobEntry = {
  promise: Promise<Record<string, unknown>>;
};

type TerminalCacheEntry =
  | {
      status: "succeeded";
      result: Record<string, unknown>;
      expiresAt: number;
    }
  | {
      status: "failed";
      error: unknown;
      expiresAt: number;
    };

const IMAGE_GENERATION_POLL_INTERVAL_MS = 3_000;
const VIDEO_GENERATION_POLL_INTERVAL_MS = 10_000;
const IMAGE_GENERATION_MAX_WAIT_MS = 10 * 60_000;
const VIDEO_GENERATION_MAX_WAIT_MS = 2 * 60 * 60_000;
const TERMINAL_CACHE_TTL_MS = 5 * 60_000;

class TerminalGenerationJobError extends ApiApplicationError {}

class GenerationJobService {
  private entries = new Map<string, GenerationJobEntry>();
  private terminalCache = new Map<string, TerminalCacheEntry>();

  watch(
    jobId: string,
    options: GenerationJobWatchOptions,
  ): GenerationJobSubscription {
    const cached = this.getCachedTerminal(jobId);
    if (cached) {
      return this.createCachedSubscription(cached, options);
    }

    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = this.createEntry(jobId, options.jobType);
      this.entries.set(jobId, entry);
    }

    return this.createRunningSubscription(entry, options);
  }

  clearForTest(): void {
    this.entries.clear();
    this.terminalCache.clear();
  }

  private createEntry(
    jobId: string,
    jobType: GenerationJobType,
  ): GenerationJobEntry {
    const promise = this.pollJob(jobId, jobType)
      .then((result) => {
        this.terminalCache.set(jobId, {
          status: "succeeded",
          result,
          expiresAt: Date.now() + TERMINAL_CACHE_TTL_MS,
        });
        return result;
      })
      .catch((error) => {
        if (error instanceof TerminalGenerationJobError) {
          this.terminalCache.set(jobId, {
            status: "failed",
            error,
            expiresAt: Date.now() + TERMINAL_CACHE_TTL_MS,
          });
        }
        throw error;
      })
      .finally(() => {
        this.entries.delete(jobId);
      });

    return { promise };
  }

  private createCachedSubscription(
    cached: TerminalCacheEntry,
    options: GenerationJobWatchOptions,
  ): GenerationJobSubscription {
    let active = true;
    const promise = Promise.resolve().then(() => {
      if (options.signal?.aborted) {
        throw getAbortReason(options.signal);
      }
      if (cached.status === "succeeded") {
        if (active) options.onSucceeded?.(cached.result);
        return cached.result;
      }
      if (active) options.onFailed?.(cached.error);
      throw cached.error;
    });
    return {
      promise,
      unsubscribe: () => {
        active = false;
      },
    };
  }

  private createRunningSubscription(
    entry: GenerationJobEntry,
    options: GenerationJobWatchOptions,
  ): GenerationJobSubscription {
    let active = true;
    let removeAbortListener: (() => void) | null = null;

    const abortPromise = new Promise<never>((_resolve, reject) => {
      const signal = options.signal;
      if (!signal) return;
      if (signal.aborted) {
        active = false;
        reject(getAbortReason(signal));
        return;
      }
      const handleAbort = () => {
        active = false;
        reject(getAbortReason(signal));
      };
      signal.addEventListener("abort", handleAbort, { once: true });
      removeAbortListener = () => {
        signal.removeEventListener("abort", handleAbort);
      };
    });

    const watchedPromise = entry.promise.then(
      (result) => {
        removeAbortListener?.();
        if (active) options.onSucceeded?.(result);
        return result;
      },
      (error) => {
        removeAbortListener?.();
        if (active) options.onFailed?.(error);
        throw error;
      },
    );

    return {
      promise: options.signal
        ? Promise.race([watchedPromise, abortPromise])
        : watchedPromise,
      unsubscribe: () => {
        active = false;
        removeAbortListener?.();
      },
    };
  }

  private getCachedTerminal(jobId: string): TerminalCacheEntry | null {
    const cached = this.terminalCache.get(jobId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.terminalCache.delete(jobId);
      return null;
    }
    return cached;
  }

  private async pollJob(
    jobId: string,
    jobType: GenerationJobType,
  ): Promise<Record<string, unknown>> {
    const { maxWaitMs, pollIntervalMs } = getPollingConfig(jobType);
    const startedAt = Date.now();

    for (;;) {
      const { job } = await fetchGenerationJob(jobId);
      if (job.status === "succeeded") {
        if (!job.result) {
          throw new TerminalGenerationJobError(
            "generation_failed",
            "Generation completed without a result.",
          );
        }
        return job.result;
      }

      if (job.status === "dead_letter") {
        throw new TerminalGenerationJobError(
          job.error_code ?? "generation_failed",
          job.error_message ?? "Generation failed.",
        );
      }

      if (job.status === "canceled") {
        throw new TerminalGenerationJobError(
          "generation_canceled",
          "Generation was canceled.",
        );
      }

      if (Date.now() - startedAt >= maxWaitMs) {
        throw new TerminalGenerationJobError(
          "generation_timeout",
          `Generation job ${jobId} timed out.`,
        );
      }

      await delay(pollIntervalMs);
    }
  }
}

function getPollingConfig(jobType: GenerationJobType): {
  maxWaitMs: number;
  pollIntervalMs: number;
} {
  return jobType === "video_generation"
    ? {
        maxWaitMs: VIDEO_GENERATION_MAX_WAIT_MS,
        pollIntervalMs: VIDEO_GENERATION_POLL_INTERVAL_MS,
      }
    : {
        maxWaitMs: IMAGE_GENERATION_MAX_WAIT_MS,
        pollIntervalMs: IMAGE_GENERATION_POLL_INTERVAL_MS,
      };
}

async function fetchGenerationJob(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/jobs/${jobId}`);
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as JobResponse;
}

async function handleErrorResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

export const generationJobService = new GenerationJobService();
