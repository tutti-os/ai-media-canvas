import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { executeImageGenerationJob } from "./image-generation.js";
import {
  executeVideoGenerationJob,
  isRetryableVideoGenerationError,
} from "./video-generation.js";
import { createLocalStore } from "../../../local/store.js";
import {
  clearProviders,
  registerImageProvider,
  registerVideoProvider,
} from "../../../generation/providers/registry.js";
import type { ImageProvider, VideoProvider } from "../../../generation/types.js";
import { GenerationError } from "../../../generation/utils.js";

const tempDirs: string[] = [];

afterEach(() => {
  clearProviders();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("generation executors", () => {
  it("persists generated image bytes locally and returns AIMC-compatible fields", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-job-image-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const imageBytes = Buffer.from("fake-image-binary");
    const imageProvider: ImageProvider = {
      name: "test-image",
      models: [
        {
          id: "test/image-model",
          displayName: "Test Image",
          description: "Test image provider",
        },
      ],
      async generate() {
        return {
          url: `data:image/png;base64,${imageBytes.toString("base64")}`,
          mimeType: "image/png",
          width: 1024,
          height: 768,
        };
      },
    };

    registerImageProvider(imageProvider);

    const project = store.createProject({ name: "Executor Image Project" });
    const job = store.createBackgroundJob({
      jobType: "image_generation",
      queueName: "image_generation_jobs",
      projectId: project.id,
      payload: {
        prompt: "A dramatic sky",
        model: "test/image-model",
        aspect_ratio: "4:3",
      },
    });

    const result = await executeImageGenerationJob(store, job);

    expect(result).toMatchObject({
      asset_id: expect.any(String),
      signed_url: expect.stringContaining("/local-assets/"),
      mime_type: "image/png",
      width: 1024,
      height: 768,
    });

    const asset = store.getAssetResponse(result.asset_id as string);
    expect(asset?.mimeType).toBe("image/png");
    expect(readFileSync(asset!.filePath)).toEqual(imageBytes);
  });

  it("persists generated video bytes locally and returns AIMC-compatible fields", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-job-video-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const videoBytes = Buffer.from("fake-video-binary");
    const videoProvider: VideoProvider = {
      name: "test-video",
      models: [
        {
          id: "test/video-model",
          displayName: "Test Video",
          description: "Test video provider",
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 8,
            maxResolution: "1080p",
            maxInputImages: 2,
          },
        },
      ],
      async generate() {
        return {
          url: `data:video/mp4;base64,${videoBytes.toString("base64")}`,
          mimeType: "video/mp4",
          width: 1280,
          height: 720,
          durationSeconds: 6,
        };
      },
    };

    registerVideoProvider(videoProvider);

    const project = store.createProject({ name: "Executor Video Project" });
    const job = store.createBackgroundJob({
      jobType: "video_generation",
      queueName: "video_generation_jobs",
      projectId: project.id,
      payload: {
        prompt: "A cinematic flythrough",
        model: "test/video-model",
        duration: 6,
        aspect_ratio: "16:9",
      },
    });

    const result = await executeVideoGenerationJob(store, job);

    expect(result).toMatchObject({
      asset_id: expect.any(String),
      signed_url: expect.stringContaining("/local-assets/"),
      mime_type: "video/mp4",
      width: 1280,
      height: 720,
      duration_seconds: 6,
    });

    const asset = store.getAssetResponse(result.asset_id as string);
    expect(asset?.mimeType).toBe("video/mp4");
    expect(readFileSync(asset!.filePath)).toEqual(videoBytes);
  });

  it("forwards Agnes phase-2 video controls through the video executor", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-job-agnes-video-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const captured: Array<Record<string, unknown>> = [];
    const videoProvider: VideoProvider = {
      name: "agnes-video",
      models: [
        {
          id: "agnes-video/agnes-video-v2.0",
          displayName: "Agnes Video",
          description: "Agnes video provider",
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 16,
            maxResolution: "1080p",
            maxInputImages: 8,
          },
        },
      ],
      async generate(params) {
        captured.push(params as unknown as Record<string, unknown>);
        return {
          url: "data:video/mp4;base64,ZmFrZS12aWRlbw==",
          mimeType: "video/mp4",
          width: 1280,
          height: 720,
          durationSeconds: 4,
        };
      },
    };

    registerVideoProvider(videoProvider);

    const project = store.createProject({ name: "Executor Agnes Video Project" });
    const job = store.createBackgroundJob({
      jobType: "video_generation",
      queueName: "video_generation_jobs",
      projectId: project.id,
      payload: {
        prompt: "Morph between two scenes",
        model: "agnes-video/agnes-video-v2.0",
        duration: 4,
        aspect_ratio: "16:9",
        input_images: [
          "data:image/png;base64,AAAA",
          "data:image/png;base64,BBBB",
        ],
        video_mode: "keyframes",
        seed: 11,
        negative_prompt: "shake, blur",
        frame_rate: 12,
        num_frames: 97,
      },
    });

    await executeVideoGenerationJob(store, job);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      model: "agnes-video/agnes-video-v2.0",
      videoMode: "keyframes",
      seed: 11,
      negativePrompt: "shake, blur",
      frameRate: 12,
      numFrames: 97,
      inputImages: [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,BBBB",
      ],
    });
  });

  it("does not retry Agnes poll timeout after the remote video task was created", () => {
    expect(
      isRetryableVideoGenerationError(
        new GenerationError(
          "agnes-video",
          "poll_timeout",
          "Agnes video polling timed out.",
        ),
      ),
    ).toBe(false);
  });
});
