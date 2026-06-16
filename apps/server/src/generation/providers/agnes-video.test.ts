import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, videoGenerateMock, videoPollMock, createAgnesClientMock } =
  vi.hoisted(() => {
    const fetchMock = vi.fn();
    const videoGenerateMock = vi.fn();
    const videoPollMock = vi.fn();
    const createAgnesClientMock = vi.fn(() => ({
      video: {
        generate: videoGenerateMock,
        poll: videoPollMock,
      },
    }));
    return {
      fetchMock,
      videoGenerateMock,
      videoPollMock,
      createAgnesClientMock,
    };
  });

vi.mock("agnes-ai-cli", () => ({
  createAgnesClient: createAgnesClientMock,
}));

import { AgnesVideoProvider } from "./agnes-video.js";

describe("AgnesVideoProvider", () => {
  beforeEach(() => {
    videoGenerateMock.mockReset();
    videoPollMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    createAgnesClientMock.mockClear();
    videoGenerateMock.mockResolvedValue({
      ok: true,
      taskId: "task_123",
      videoId: "video_123",
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
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "task_123",
          object: "video",
          status: "completed",
          video_id: "video_123",
          video_url: "https://cdn.agnes.example/generated.mp4",
          seconds: "5.0",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agnes.example/agnesapi?video_id=video_123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer agnes-test-key",
        }),
      }),
    );
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

  it("rejects Agnes durations above the remote creation limit before calling the API", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await expect(
      provider.generate({
        prompt: "A long stylized camera move",
        model: "agnes-video/agnes-video-v2.0",
        duration: 18,
        aspectRatio: "16:9",
        resolution: "720p",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message:
        "Invalid Agnes duration: 18. Use one of 4, 5, 6, 8, 10, 15, 16 seconds.",
      provider: "agnes-video",
    });
    expect(videoGenerateMock).not.toHaveBeenCalled();
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
      message: "Unsupported Agnes video aspect ratio: 1:1. Use 16:9 or 9:16.",
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

  it("caps image-conditioned Agnes videos to the supported 720p resolution", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");

    await provider.generate({
      prompt: "Make the first frame dance",
      model: "agnes-video/agnes-video-v2.0",
      duration: 16,
      aspectRatio: "16:9",
      resolution: "1080p",
      inputImages: ["data:image/png;base64,AAAA"],
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "img2video",
      image: "data:image/png;base64,AAAA",
      prompt: "Make the first frame dance",
      width: 1280,
      height: 720,
      numFrames: 385,
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
      inputImages: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "multivideo",
      images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
      prompt: "Blend these two concepts",
      width: 1280,
      height: 720,
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
      inputImages: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
      videoMode: "keyframes",
    });

    expect(videoGenerateMock).toHaveBeenCalledWith({
      mode: "keyframes",
      images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
      prompt: "Morph between the two scenes",
      width: 1280,
      height: 720,
      numFrames: 97,
      frameRate: 24,
      ttl: "1h",
    });
  });

  it("times out if Agnes video task creation never returns", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");
    videoGenerateMock.mockReturnValueOnce(new Promise(() => {}));
    vi.useFakeTimers();

    try {
      const resultPromise = provider.generate({
        prompt: "A stuck Agnes request",
        model: "agnes-video/agnes-video-v2.0",
        aspectRatio: "16:9",
        resolution: "720p",
      });
      const rejection = expect(resultPromise).rejects.toMatchObject({
        code: "timeout",
        message: "Agnes video task creation timed out after 120000ms.",
        provider: "agnes-video",
      });

      await vi.advanceTimersByTimeAsync(120_000);

      await rejection;
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps polling queued Agnes tasks instead of using the SDK timeout", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");
    videoGenerateMock.mockResolvedValueOnce({
      ok: true,
      taskId: "task_123",
      status: "queued",
      model: "agnes-video-v2.0",
      raw: {},
    });
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task_123",
            object: "video",
            status: "queued",
            video_id: "video_123",
            progress: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task_123",
            object: "video",
            status: "completed",
            video_id: "video_123",
            remixed_from_video_id: "https://cdn.agnes.example/generated.mp4",
            seconds: "5.0",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.useFakeTimers();

    const resultPromise = provider.generate({
      prompt: "A long-running queued video",
      model: "agnes-video/agnes-video-v2.0",
      aspectRatio: "16:9",
      resolution: "720p",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(videoPollMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/videos/task_123",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/agnesapi?video_id=video_123",
      expect.any(Object),
    );
    expect(result.url).toBe("https://cdn.agnes.example/generated.mp4");
    vi.useRealTimers();
  });

  it("keeps legacy task_id polling compatible when resuming old Agnes jobs", async () => {
    const provider = new AgnesVideoProvider(
      "agnes-test-key",
      "https://agnes.example/v1",
    );

    const result = await provider.resume("task_legacy_123", {
      prompt: "Resume an older queued Agnes video",
      model: "agnes-video/agnes-video-v2.0",
      aspectRatio: "16:9",
      resolution: "720p",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://agnes.example/v1/videos/task_legacy_123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer agnes-test-key",
        }),
      }),
    );
    expect(result.url).toBe("https://cdn.agnes.example/generated.mp4");
  });

  it("reports video_id through Agnes task metadata for persisted recovery", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");
    const onRemoteTaskCreated = vi.fn();
    const onRemoteTaskStatus = vi.fn();

    await provider.generate({
      prompt: "Track the preferred Agnes video poll id",
      model: "agnes-video/agnes-video-v2.0",
      aspectRatio: "16:9",
      resolution: "720p",
      metadata: {
        onRemoteTaskCreated,
        onRemoteTaskStatus,
      },
    });

    expect(onRemoteTaskCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "agnes-video",
        taskId: "task_123",
        videoId: "video_123",
        status: "queued",
      }),
    );
    expect(onRemoteTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "agnes-video",
        taskId: "video_123",
        videoId: "video_123",
        status: "completed",
      }),
    );
  });

  it("reports provider failures from Agnes task polling", async () => {
    const provider = new AgnesVideoProvider("agnes-test-key");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "task_123",
          object: "video",
          status: "failed",
          completed_at: 1790000000,
          error: {
            message: "Remote generation failed.",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      provider.generate({
        prompt: "A long-running queued video",
        model: "agnes-video/agnes-video-v2.0",
        aspectRatio: "16:9",
        resolution: "720p",
      }),
    ).rejects.toMatchObject({
      code: "api_error",
      message: "Remote generation failed.",
      provider: "agnes-video",
    });
  });
});
