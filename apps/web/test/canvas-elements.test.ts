// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { insertImageOnCanvas } from "../src/lib/canvas-elements";

describe("insertImageOnCanvas", () => {
  it("places consecutive generated images into open space instead of stacking them on one slot", async () => {
    const addFiles = vi.fn();
    const updateScene = vi.fn();
    let elements: any[] = [
      {
        id: "existing-1",
        type: "image",
        x: 0,
        y: 0,
        width: 600,
        height: 600,
        isDeleted: false,
      },
      {
        id: "existing-2",
        type: "image",
        x: 640,
        y: 0,
        width: 600,
        height: 600,
        isDeleted: false,
      },
    ];

    const api = {
      addFiles,
      getSceneElements: () => elements,
      getAppState: () => ({
        scrollX: 0,
        scrollY: 0,
        width: 2000,
        height: 1400,
        zoom: { value: 1 },
      }),
      updateScene: ({ elements: next }: { elements: any[] }) => {
        elements = next;
        updateScene({ elements: next });
      },
    };

    global.fetch = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" }),
    })) as any;

    await insertImageOnCanvas(api, {
      type: "image",
      url: "https://example.com/one.png",
      mimeType: "image/png",
      width: 1200,
      height: 1200,
      title: "one",
      placement: { x: 1280, y: 0, width: 600, height: 600 },
    });

    await insertImageOnCanvas(api, {
      type: "image",
      url: "https://example.com/two.png",
      mimeType: "image/png",
      width: 1200,
      height: 1200,
      title: "two",
      placement: { x: 1280, y: 0, width: 600, height: 600 },
    });

    const generated = elements.filter((el) => el.customData?.source === "generated");
    expect(generated).toHaveLength(2);
    expect(generated[0].x).not.toBe(generated[1].x);
  });
});
