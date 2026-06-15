// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (elements: unknown[]) => elements,
}));

import {
  insertImageOnCanvas,
  insertVideoOnCanvas,
  normalizeVideoCanvasElements,
} from "../src/lib/canvas-elements";

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

describe("normalizeVideoCanvasElements", () => {
  it("moves legacy video embeddable links into customData", () => {
    const elements = [
      {
        id: "video-1",
        type: "embeddable",
        link: "/local-assets/video-1.mp4",
        x: 10,
        y: 20,
        width: 640,
        height: 360,
        customData: {
          title: "video title",
        },
      },
    ];

    const normalized = normalizeVideoCanvasElements(elements);

    expect(normalized?.[0]).toMatchObject({
      id: "video-1",
      type: "rectangle",
      link: null,
      strokeColor: "#111827",
      backgroundColor: "#000000",
      fillStyle: "solid",
      roughness: 0,
      customData: {
        title: "video title",
        isVideo: true,
        videoUrl: "/local-assets/video-1.mp4",
        mimeType: "video/mp4",
      },
    });
  });

  it("leaves non-video links alone", () => {
    const elements = [
      {
        id: "link-1",
        type: "rectangle",
        link: "https://example.com",
      },
    ];

    expect(normalizeVideoCanvasElements(elements)).toBeNull();
  });
});

describe("insertVideoOnCanvas", () => {
  it("keeps generation metadata on inserted video elements", async () => {
    const updateScene = vi.fn();
    let elements: any[] = [];
    const api = {
      getSceneElements: () => elements,
      getAppState: () => ({
        scrollX: 0,
        scrollY: 0,
        width: 1200,
        height: 800,
        zoom: { value: 1 },
      }),
      updateScene: ({ elements: next }: { elements: any[] }) => {
        elements = next;
        updateScene({ elements: next });
      },
    };

    await insertVideoOnCanvas(api, {
      type: "video",
      url: "https://example.com/dance.mp4",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      title: "生成小女孩跳舞的视频",
      prompt: "生成小女孩跳舞的视频",
      model: "kie:grok-imagine-v0.9",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
    });

    expect(elements[0]?.customData).toMatchObject({
      isVideo: true,
      videoUrl: "https://example.com/dance.mp4",
      title: "生成小女孩跳舞的视频",
      prompt: "生成小女孩跳舞的视频",
      model: "kie:grok-imagine-v0.9",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
    });
  });
});
