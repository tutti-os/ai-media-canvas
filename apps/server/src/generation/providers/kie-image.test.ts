import { afterEach, describe, expect, it, vi } from "vitest";

import { KieImageProvider, resolveKieImageRequest } from "./kie-image.js";

describe("KieImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the requested Kie image models", () => {
    const provider = new KieImageProvider("test-key");

    expect(provider.models.map((model) => model.id)).toEqual([
      "kie/z-image",
      "kie/seedream-5-lite",
      "kie/gpt-image-2",
      "kie/qwen2",
      "kie/nano-banana-pro",
      "kie/nano-banana",
    ]);
  });

  it("generates an image by creating and polling a Market task", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: { taskId: "task_image_1" },
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
              taskId: "task_image_1",
              state: "success",
              resultJson: JSON.stringify({
                resultUrls: ["https://cdn.example/image.png"],
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new KieImageProvider("test-key", "https://kie.example", {
      pollIntervalMs: 0,
    });
    const image = await provider.generate({
      model: "kie/z-image",
      prompt: "red mug",
      aspectRatio: "1:1",
    });

    expect(image).toEqual({
      url: "https://cdn.example/image.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://kie.example/api/v1/jobs/createTask",
      expect.objectContaining({
        body: JSON.stringify({
          model: "z-image",
          input: {
            prompt: "red mug",
            aspect_ratio: "1:1",
            nsfw_checker: true,
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://kie.example/api/v1/jobs/recordInfo?taskId=task_image_1",
      expect.any(Object),
    );
  });

  it.each([
    [
      "kie/seedream-5-lite",
      [],
      {
        model: "seedream/5-lite-text-to-image",
        input: {
          prompt: "poster",
          aspect_ratio: "16:9",
          quality: "high",
          nsfw_checker: true,
        },
      },
    ],
    [
      "kie/seedream-5-lite",
      ["https://example.com/input.png"],
      {
        model: "seedream/5-lite-image-to-image",
        input: {
          prompt: "poster",
          image_urls: ["https://example.com/input.png"],
          aspect_ratio: "16:9",
          quality: "high",
          nsfw_checker: true,
        },
      },
    ],
    [
      "kie/gpt-image-2",
      [],
      {
        model: "gpt-image-2-text-to-image",
        input: {
          prompt: "poster",
          aspect_ratio: "16:9",
        },
      },
    ],
    [
      "kie/gpt-image-2",
      ["https://example.com/input.png"],
      {
        model: "gpt-image-2-image-to-image",
        input: {
          prompt: "poster",
          input_urls: ["https://example.com/input.png"],
          aspect_ratio: "16:9",
        },
      },
    ],
    [
      "kie/qwen2",
      [],
      {
        model: "qwen2/text-to-image",
        input: {
          prompt: "poster",
          image_size: "16:9",
          output_format: "png",
        },
      },
    ],
    [
      "kie/qwen2",
      ["https://example.com/input.png"],
      {
        model: "qwen2/image-edit",
        input: {
          prompt: "poster",
          image_url: "https://example.com/input.png",
          image_size: "16:9",
          output_format: "png",
        },
      },
    ],
    [
      "kie/nano-banana",
      [],
      {
        model: "google/nano-banana",
        input: {
          prompt: "poster",
          output_format: "png",
          aspect_ratio: "16:9",
        },
      },
    ],
    [
      "kie/nano-banana",
      ["https://example.com/input.png"],
      {
        model: "google/nano-banana-edit",
        input: {
          prompt: "poster",
          image_urls: ["https://example.com/input.png"],
          output_format: "png",
          aspect_ratio: "16:9",
        },
      },
    ],
    [
      "kie/nano-banana-pro",
      [],
      {
        model: "nano-banana-pro",
        input: {
          prompt: "poster",
          image_input: [],
          aspect_ratio: "16:9",
          resolution: "2K",
          output_format: "png",
        },
      },
    ],
    [
      "kie/nano-banana-pro",
      ["https://example.com/input.png"],
      {
        model: "nano-banana-pro",
        input: {
          prompt: "poster",
          image_input: ["https://example.com/input.png"],
          aspect_ratio: "16:9",
          resolution: "2K",
          output_format: "png",
        },
      },
    ],
  ])("maps %s with %i input images", (model, inputImages, expected) => {
    expect(
      resolveKieImageRequest({
        model,
        prompt: "poster",
        aspectRatio: "16:9",
        inputImages,
        quality: "hd",
        outputFormat: "png",
      }),
    ).toEqual(expect.objectContaining(expected));
  });

  it("rejects image inputs for z-image", () => {
    expect(() =>
      resolveKieImageRequest({
        model: "kie/z-image",
        prompt: "poster",
        inputImages: ["https://example.com/input.png"],
      }),
    ).toThrow(/does not support image inputs/);
  });
});
