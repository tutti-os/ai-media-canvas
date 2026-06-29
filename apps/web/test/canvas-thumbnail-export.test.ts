import { describe, expect, it, vi } from "vitest";

import { prepareThumbnailExportScene } from "../src/lib/canvas-thumbnail-export";

describe("prepareThumbnailExportScene", () => {
  it("replaces video placeholder rectangles with captured frame images", async () => {
    const frameDataURL = "data:image/webp;base64,frame";
    const captureVideoFrame = vi.fn().mockResolvedValue(frameDataURL);

    const result = await prepareThumbnailExportScene({
      elements: [
        {
          id: "video-1",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 320,
          height: 180,
          backgroundColor: "#000000",
          customData: {
            isVideo: true,
            videoUrl: "/local-assets/video-1",
            assetId: "asset-video-1",
            title: "Video result",
          },
        },
      ],
      files: {},
      captureVideoFrame,
    });

    expect(captureVideoFrame).toHaveBeenCalledWith(
      "/local-assets/video-1",
      "asset-video-1",
    );
    expect(result.elements[0]).toMatchObject({
      type: "image",
      x: 10,
      y: 20,
      width: 320,
      height: 180,
      customData: {
        assetId: "asset-video-1",
        source: "generated",
        title: "Video result",
        storageUrl: "/local-assets/video-1",
      },
    });
    expect(result.files[Object.keys(result.files)[0] ?? ""]).toMatchObject({
      dataURL: frameDataURL,
      mimeType: "image/webp",
    });
  });
});
