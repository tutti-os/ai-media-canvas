// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useImageAttachments } from "../src/hooks/use-image-attachments";

describe("useImageAttachments", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("attachment-1");
  });

  it("stores canvas refs with runtime local asset urls", () => {
    const { result } = renderHook(() => useImageAttachments());

    act(() => {
      result.current.addCanvasRef({
        assetId: "asset-1",
        url: "/local-assets/asset-1",
        mimeType: "image/png",
        name: "Canvas image",
      });
    });

    expect(result.current.attachments[0]).toMatchObject({
      preview: "http://localhost:3000/local-assets/asset-1",
      url: "http://localhost:3000/local-assets/asset-1",
    });
    expect(result.current.readyAttachments[0]).toMatchObject({
      url: "http://localhost:3000/local-assets/asset-1",
      source: "canvas-ref",
    });
  });
});
