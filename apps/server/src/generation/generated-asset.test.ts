import { afterEach, describe, expect, it, vi } from "vitest";

import { loadGeneratedAsset } from "./generated-asset.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadGeneratedAsset", () => {
  it("keeps the provider MIME type when a download returns generic bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("fake-video", {
          headers: { "content-type": "application/octet-stream" },
        }),
      ),
    );

    const asset = await loadGeneratedAsset(
      "https://cdn.example/video",
      "video/mp4; codecs=avc1",
    );

    expect(asset.buffer).toEqual(Buffer.from("fake-video"));
    expect(asset.mimeType).toBe("video/mp4");
  });

  it("strips content-type parameters before storing MIME metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("fake-video", {
          headers: { "content-type": "video/mp4; charset=binary" },
        }),
      ),
    );

    const asset = await loadGeneratedAsset(
      "https://cdn.example/video.mp4",
      "application/octet-stream",
    );

    expect(asset.mimeType).toBe("video/mp4");
  });
});
