// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generationJobService } from "../src/lib/generation-job-service";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function successfulJob(result: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      job: {
        id: "job-1",
        status: "succeeded",
        result,
      },
    }),
  };
}

function failedJob() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      job: {
        id: "job-1",
        status: "dead_letter",
        error_code: "generation_failed",
        error_message: "Generation failed.",
        result: null,
      },
    }),
  };
}

describe("generationJobService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:3001");
    mockFetch.mockReset();
    generationJobService.clearForTest();
  });

  afterEach(() => {
    generationJobService.clearForTest();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("dedupes duplicate watchers for the same running job", async () => {
    const result = {
      signed_url: "http://localhost:3001/assets/image.png",
      mime_type: "image/png",
      width: 1024,
      height: 1024,
    };
    mockFetch.mockResolvedValue(successfulJob(result));
    const firstSucceeded = vi.fn();
    const secondSucceeded = vi.fn();

    const first = generationJobService.watch("job-1", {
      jobType: "image_generation",
      onSucceeded: firstSucceeded,
    });
    const second = generationJobService.watch("job-1", {
      jobType: "image_generation",
      onSucceeded: secondSucceeded,
    });

    await expect(first.promise).resolves.toEqual(result);
    await expect(second.promise).resolves.toEqual(result);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(firstSucceeded).toHaveBeenCalledWith(result);
    expect(secondSucceeded).toHaveBeenCalledWith(result);
  });

  it("waits with the image cadence before retrying queued jobs", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job: { id: "job-1", status: "queued", result: null },
        }),
      })
      .mockResolvedValueOnce(
        successfulJob({
          signed_url: "http://localhost:3001/assets/image.png",
        }),
      );

    const subscription = generationJobService.watch("job-1", {
      jobType: "image_generation",
    });

    await flushPromises();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(subscription.promise).resolves.toEqual({
      signed_url: "http://localhost:3001/assets/image.png",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("waits with the video cadence before retrying queued jobs", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job: { id: "job-1", status: "queued", result: null },
        }),
      })
      .mockResolvedValueOnce(
        successfulJob({
          signed_url: "http://localhost:3001/assets/video.mp4",
        }),
      );

    const subscription = generationJobService.watch("job-1", {
      jobType: "video_generation",
    });

    await flushPromises();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(subscription.promise).resolves.toEqual({
      signed_url: "http://localhost:3001/assets/video.mp4",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("broadcasts failures to all subscribers", async () => {
    mockFetch.mockResolvedValue(failedJob());
    const firstFailed = vi.fn();
    const secondFailed = vi.fn();

    const first = generationJobService.watch("job-1", {
      jobType: "video_generation",
      onFailed: firstFailed,
    });
    const second = generationJobService.watch("job-1", {
      jobType: "video_generation",
      onFailed: secondFailed,
    });

    await expect(first.promise).rejects.toThrow("Generation failed.");
    await expect(second.promise).rejects.toThrow("Generation failed.");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(firstFailed).toHaveBeenCalledTimes(1);
    expect(secondFailed).toHaveBeenCalledTimes(1);
  });

  it("keeps shared polling alive when one subscriber aborts or unsubscribes", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job: { id: "job-1", status: "queued", result: null },
        }),
      })
      .mockResolvedValueOnce(
        successfulJob({
          signed_url: "http://localhost:3001/assets/video.mp4",
        }),
      );
    const controller = new AbortController();
    const first = generationJobService.watch("job-1", {
      jobType: "video_generation",
      signal: controller.signal,
    });
    const second = generationJobService.watch("job-1", {
      jobType: "video_generation",
    });

    await flushPromises();
    controller.abort(new Error("caller aborted"));
    first.unsubscribe();
    await expect(first.promise).rejects.toThrow("caller aborted");

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(second.promise).resolves.toEqual({
      signed_url: "http://localhost:3001/assets/video.mp4",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns terminal cache hits without polling again", async () => {
    const result = {
      signed_url: "http://localhost:3001/assets/image.png",
    };
    mockFetch.mockResolvedValue(successfulJob(result));

    const first = generationJobService.watch("job-1", {
      jobType: "image_generation",
    });
    await expect(first.promise).resolves.toEqual(result);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = generationJobService.watch("job-1", {
      jobType: "image_generation",
    });
    await expect(second.promise).resolves.toEqual(result);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
