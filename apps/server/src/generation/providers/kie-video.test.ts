import { afterEach, describe, expect, it, vi } from "vitest";

import { KieVideoProvider, resolveKieVideoRequest } from "./kie-video.js";

describe("KieVideoProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the requested Kie video models", () => {
    const provider = new KieVideoProvider("test-key");

    expect(provider.models.map((model) => model.id)).toEqual([
      "kie/runway",
      "kie/grok-imagine",
      "kie/hailuo",
      "kie/veo-3.1",
      "kie/kling-2.6",
      "kie/seedance-2",
      "kie/happyhorse-1",
    ]);
  });

  it("generates a Runway video through the dedicated endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: { taskId: "task_runway_1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {
              taskId: "task_runway_1",
              state: "success",
              videoInfo: {
                videoUrl: "https://cdn.example/runway.mp4",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new KieVideoProvider("test-key", "https://kie.example", {
      pollIntervalMs: 0,
    });
    const video = await provider.generate({
      model: "kie/runway",
      prompt: "cat dancing",
      inputImages: ["https://example.com/cat.png"],
      aspectRatio: "9:16",
      duration: 5,
      resolution: "720p",
    });

    expect(video).toEqual({
      url: "https://cdn.example/runway.mp4",
      mimeType: "video/mp4",
      width: 720,
      height: 1280,
      durationSeconds: 5,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://kie.example/api/v1/runway/generate",
      expect.objectContaining({
        body: JSON.stringify({
          prompt: "cat dancing",
          imageUrl: "https://example.com/cat.png",
          duration: "5",
          quality: "720p",
          aspectRatio: "9:16",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://kie.example/api/v1/runway/record-detail?taskId=task_runway_1",
      expect.any(Object),
    );
  });

  it("generates a Veo video through the dedicated endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: { taskId: "task_veo_1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {
              taskId: "task_veo_1",
              successFlag: 1,
              response: {
                resultUrls: ["https://cdn.example/veo.mp4"],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new KieVideoProvider("test-key", "https://kie.example", {
      pollIntervalMs: 0,
    });
    const video = await provider.generate({
      model: "kie/veo-3.1",
      prompt: "dog in park",
      aspectRatio: "16:9",
      duration: 8,
      resolution: "1080p",
      enableAudio: true,
    });

    expect(video.url).toBe("https://cdn.example/veo.mp4");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://kie.example/api/v1/veo/generate",
      expect.objectContaining({
        body: JSON.stringify({
          prompt: "dog in park",
          model: "veo3_fast",
          aspect_ratio: "16:9",
          enableFallback: false,
          enableTranslation: true,
          generationType: "TEXT_2_VIDEO",
        }),
      }),
    );
  });

  it.each([
    [
      "kie/grok-imagine",
      [],
      {
        kind: "market",
        model: "grok-imagine/text-to-video",
        input: {
          prompt: "city flythrough",
          aspect_ratio: "16:9",
          mode: "normal",
          duration: "6",
          resolution: "480p",
        },
      },
    ],
    [
      "kie/grok-imagine",
      ["https://example.com/start.png"],
      {
        kind: "market",
        model: "grok-imagine/image-to-video",
        input: {
          prompt: "city flythrough",
          image_urls: ["https://example.com/start.png"],
          aspect_ratio: "16:9",
          mode: "normal",
          duration: "6",
          resolution: "480p",
        },
      },
    ],
    [
      "kie/hailuo",
      [],
      {
        kind: "market",
        model: "hailuo/02-text-to-video-pro",
        input: {
          prompt: "city flythrough",
          prompt_optimizer: true,
        },
      },
    ],
    [
      "kie/hailuo",
      ["https://example.com/start.png", "https://example.com/end.png"],
      {
        kind: "market",
        model: "hailuo/02-image-to-video-pro",
        input: {
          prompt: "city flythrough",
          image_url: "https://example.com/start.png",
          end_image_url: "https://example.com/end.png",
          prompt_optimizer: true,
        },
      },
    ],
    [
      "kie/kling-2.6",
      [],
      {
        kind: "market",
        model: "kling-2.6/text-to-video",
        input: {
          prompt: "city flythrough",
          sound: false,
          aspect_ratio: "16:9",
          duration: "6",
        },
      },
    ],
    [
      "kie/kling-2.6",
      ["https://example.com/start.png"],
      {
        kind: "market",
        model: "kling-2.6/image-to-video",
        input: {
          prompt: "city flythrough",
          image_urls: ["https://example.com/start.png"],
          sound: false,
          duration: "6",
        },
      },
    ],
    [
      "kie/seedance-2",
      [],
      {
        kind: "market",
        model: "bytedance/seedance-2",
        input: {
          prompt: "city flythrough",
          generate_audio: false,
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 6,
          web_search: false,
        },
      },
    ],
    [
      "kie/seedance-2",
      ["https://example.com/start.png", "https://example.com/end.png"],
      {
        kind: "market",
        model: "bytedance/seedance-2",
        input: {
          prompt: "city flythrough",
          first_frame_url: "https://example.com/start.png",
          last_frame_url: "https://example.com/end.png",
          generate_audio: false,
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 6,
          web_search: false,
        },
      },
    ],
    [
      "kie/happyhorse-1",
      [],
      {
        kind: "market",
        model: "happyhorse/text-to-video",
        input: {
          prompt: "city flythrough",
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 6,
        },
      },
    ],
    [
      "kie/happyhorse-1",
      ["https://example.com/start.png"],
      {
        kind: "market",
        model: "happyhorse/image-to-video",
        input: {
          prompt: "city flythrough",
          image_urls: ["https://example.com/start.png"],
          resolution: "720p",
          duration: 6,
        },
      },
    ],
  ])("maps %s with %i input images", (model, inputImages, expected) => {
    expect(
      resolveKieVideoRequest({
        model,
        prompt: "city flythrough",
        inputImages,
        aspectRatio: "16:9",
        duration: 6,
        resolution: "720p",
      }),
    ).toEqual(expect.objectContaining(expected));
  });

  it.each([
    [
      "kie/veo-3.1",
      {
        kind: "veo",
        payload: {
          prompt: "city flythrough",
          imageUrls: ["https://example.com/ref.png"],
          model: "veo3_fast",
          aspect_ratio: "16:9",
          enableFallback: false,
          enableTranslation: true,
          generationType: "REFERENCE_2_VIDEO",
        },
      },
    ],
    [
      "kie/seedance-2",
      {
        kind: "market",
        model: "bytedance/seedance-2",
        input: {
          prompt: "city flythrough",
          reference_image_urls: ["https://example.com/ref.png"],
          generate_audio: false,
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 6,
          web_search: false,
        },
      },
    ],
    [
      "kie/happyhorse-1",
      {
        kind: "market",
        model: "happyhorse/reference-to-video",
        input: {
          prompt: "city flythrough",
          reference_image: ["https://example.com/ref.png"],
          resolution: "720p",
          duration: 6,
        },
      },
    ],
  ])("maps %s reference image mode", (model, expected) => {
    expect(
      resolveKieVideoRequest({
        model,
        prompt: "city flythrough",
        inputImages: ["https://example.com/ref.png"],
        videoMode: "reference",
        aspectRatio: "16:9",
        duration: 6,
        resolution: "720p",
      }),
    ).toEqual(expect.objectContaining(expected));
  });

  it("rejects invalid Runway 10s 1080p requests", () => {
    expect(() =>
      resolveKieVideoRequest({
        model: "kie/runway",
        prompt: "city flythrough",
        duration: 10,
        resolution: "1080p",
      }),
    ).toThrow(/10-second.*1080p/);
  });
});
