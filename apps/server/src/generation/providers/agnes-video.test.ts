import { beforeEach, describe, expect, it, vi } from "vitest";

const { videoGenerateMock, videoPollMock, createAgnesClientMock } =
  vi.hoisted(() => {
    const videoGenerateMock = vi.fn();
    const videoPollMock = vi.fn();
    const createAgnesClientMock = vi.fn(() => ({
      video: {
        generate: videoGenerateMock,
        poll: videoPollMock,
      },
    }));
    return { videoGenerateMock, videoPollMock, createAgnesClientMock };
  });

vi.mock("agnes-ai-cli", () => ({
  createAgnesClient: createAgnesClientMock,
}));

import { AgnesVideoProvider } from "./agnes-video.js";

describe("AgnesVideoProvider", () => {
  beforeEach(() => {
    videoGenerateMock.mockReset();
    videoPollMock.mockReset();
    createAgnesClientMock.mockClear();
    videoGenerateMock.mockResolvedValue({
      ok: true,
      taskId: "task_123",
      status: "queued",
      model: "agnes-video-v2.0",
      raw: {},
    });
    videoPollMock.mockResolvedValue({
      ok: true,
      taskId: "task_123",
      status: "completed",
      model: "agnes-video-v2.0",
      videoUrl: "https://cdn.agnes.example/generated.mp4",
      seconds: 5,
      raw: {},
    });
  });

  it("maps prompt-only requests to Agnes text2video mode", async () => {
    const provider = new AgnesVideoProvider(
      "agnes-test-key",
      "https://agnes.example/v1",
    );

    const result = await provider.generate({
      prompt: "A dolly shot through a neon alley",
      model: "agnes-video/agnes-video-v2.0",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    });

    expect(createAgnesClientMock).toHaveBeenCalledWith({
      apiKey: "agnes-test-key",
      baseUrl: "https://agnes.example/v1",
    });
    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "text2video",
      prompt: "A dolly shot through a neon alley",
      width: 1280,
      height: 720,
      numFrames: 121,
      frameRate: 24,
    });
    expect(videoPollMock).toHaveBeenCalledWith("task_123", {
      intervalSeconds: 3,
      timeoutSeconds: 600,
    });
    expect(result).toMatchObject({
      url: "https://cdn.agnes.example/generated.mp4",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationSeconds: 5,
    });
  });

  it("forwards Agnes phase-2 video controls", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await provider.generate({
      prompt: "A stylized camera move",
      model: "agnes-video/agnes-video-v2.0",
      aspectRatio: "16:9",
      resolution: "720p",
      seed: 7,
      negativePrompt: "flicker, blur",
      frameRate: 12,
      numFrames: 97,
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "text2video",
      prompt: "A stylized camera move",
      width: 1280,
      height: 720,
      numFrames: 97,
      frameRate: 12,
      seed: 7,
      negativePrompt: "flicker, blur",
    });
  });

  it("derives an Agnes-compatible frame count when only frameRate is provided", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await provider.generate({
      prompt: "A stylized camera move",
      model: "agnes-video/agnes-video-v2.0",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      frameRate: 12,
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "text2video",
      prompt: "A stylized camera move",
      width: 1280,
      height: 720,
      numFrames: 65,
      frameRate: 12,
    });
  });

  it("rejects Agnes numFrames values that violate the 8n + 1 rule", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await expect(
      provider.generate({
        prompt: "A stylized camera move",
        model: "agnes-video/agnes-video-v2.0",
        aspectRatio: "16:9",
        resolution: "720p",
        frameRate: 12,
        numFrames: 96,
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Invalid Agnes numFrames: 96. Agnes requires 8n + 1 frames.",
      provider: "agnes-video",
    });
    expect(videoGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported Agnes aspect ratios", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await expect(
      provider.generate({
        prompt: "A stylized camera move",
        model: "agnes-video/agnes-video-v2.0",
        aspectRatio: "1:1",
        resolution: "720p",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message:
        "Unsupported Agnes video aspect ratio: 1:1. Use 16:9 or 9:16.",
      provider: "agnes-video",
    });
    expect(videoGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported Agnes resolutions instead of silently downgrading", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await expect(
      provider.generate({
        prompt: "A stylized camera move",
        model: "agnes-video/agnes-video-v2.0",
        aspectRatio: "16:9",
        resolution: "4k" as "720p",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message:
        "Unsupported Agnes video resolution: 4k. Use 480p, 720p, or 1080p.",
      provider: "agnes-video",
    });
    expect(videoGenerateMock).not.toHaveBeenCalled();
  });

  it("maps one input image to Agnes img2video mode", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await provider.generate({
      prompt: "Add wind and camera motion",
      model: "agnes-video/agnes-video-v2.0",
      duration: 4,
      aspectRatio: "9:16",
      resolution: "720p",
      inputImages: ["data:image/png;base64,AAAA"],
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "img2video",
      image: "data:image/png;base64,AAAA",
      prompt: "Add wind and camera motion",
      width: 720,
      height: 1280,
      numFrames: 97,
      frameRate: 24,
      ttl: "1h",
    });
  });

  it("maps multiple input images to Agnes multivideo mode by default", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await provider.generate({
      prompt: "Blend these two concepts",
      model: "agnes-video/agnes-video-v2.0",
      duration: 6,
      aspectRatio: "16:9",
      resolution: "1080p",
      inputImages: [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,BBBB",
      ],
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "multivideo",
      images: [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,BBBB",
      ],
      prompt: "Blend these two concepts",
      width: 1920,
      height: 1080,
      numFrames: 145,
      frameRate: 24,
      ttl: "1h",
    });
  });

  it("maps multiple input images with keyframes mode to Agnes keyframes", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await provider.generate({
      prompt: "Morph between the two scenes",
      model: "agnes-video/agnes-video-v2.0",
      duration: 4,
      aspectRatio: "16:9",
      resolution: "720p",
      inputImages: [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,BBBB",
      ],
      videoMode: "keyframes",
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "keyframes",
      images: [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,BBBB",
      ],
      prompt: "Morph between the two scenes",
      width: 1280,
      height: 720,
      numFrames: 97,
      frameRate: 24,
      ttl: "1h",
    });
  });
});
