// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeImageDataUrlToTarget } from "../src/lib/image-input-normalization";

describe("image input normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("center-crops and resizes data URL images to the target size", async () => {
    const drawImage = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName !== "canvas") return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toDataURL: () => "data:image/png;base64,normalized",
      } as unknown as HTMLCanvasElement;
    });
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 2542;
        naturalHeight = 1630;
        width = 2542;
        height = 1630;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );

    const result = await normalizeImageDataUrlToTarget(
      "data:image/png;base64,raw",
      { width: 1280, height: 720 },
    );

    expect(result).toBe("data:image/png;base64,normalized");
    expect(drawImage).toHaveBeenCalledTimes(1);
    const drawCall = drawImage.mock.calls[0];
    expect(drawCall).toBeDefined();
    const [, sourceX, sourceY, cropWidth, cropHeight, dx, dy, width, height] =
      drawCall ?? [];
    expect(sourceX).toBe(0);
    expect(sourceY).toBeCloseTo(100.0625);
    expect(cropWidth).toBe(2542);
    expect(cropHeight).toBeCloseTo(1429.875);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
    expect(width).toBe(1280);
    expect(height).toBe(720);
  });
});
