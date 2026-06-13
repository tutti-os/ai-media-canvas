import { describe, expect, it } from "vitest";

import {
  createCanvasAutoPlacementSequence,
  insertImageElement,
  insertVideoElement,
} from "./canvas-element-writer.js";

function createCanvasClient(initialContent: Record<string, unknown>) {
  const state = {
    content: structuredClone(initialContent),
  };

  return {
    state,
    from(table: string) {
      expect(table).toBe("canvases");
      return {
        select(_columns: string) {
          return this;
        },
        eq(_column: string, _value: string) {
          return this;
        },
        async single() {
          return { data: { content: state.content }, error: null };
        },
        update(payload: { content: Record<string, unknown> }) {
          state.content = payload.content;
          return {
            async eq(_column: string, _value: string) {
              return { error: null };
            },
          };
        },
      };
    },
  };
}

describe("canvas element writer", () => {
  it("inserts generated images into canvas content and file metadata", async () => {
    const client = createCanvasClient({
      elements: [],
      appState: {},
      files: {},
    });

    const result = await insertImageElement(client, {
      assetId: "image-asset-1",
      canvasId: "canvas-1",
      height: 768,
      mimeType: "image/png",
      objectPath: "generated/image-1.png",
      signedUrl: "http://127.0.0.1:3001/local-assets/image-1",
      title: "Dancing girl",
      width: 1024,
    });

    const content = client.state.content as {
      elements: Array<Record<string, unknown>>;
      files: Record<string, Record<string, unknown>>;
    };
    expect(result.elementId).toBeTypeOf("string");
    expect(content.elements).toHaveLength(1);
    expect(content.elements[0]).toMatchObject({
      id: result.elementId,
      type: "image",
      width: 600,
      height: 450,
      customData: {
        assetId: "image-asset-1",
        source: "generated",
        storageUrl: "/local-assets/image-asset-1",
        title: "Dancing girl",
      },
    });
    const fileId = content.elements[0]?.fileId as string;
    expect(content.files[fileId]).toMatchObject({
      id: fileId,
      assetId: "image-asset-1",
      mimeType: "image/png",
      storageUrl: "/local-assets/image-asset-1",
    });
  });

  it("centers the first generated image in the persisted viewport", async () => {
    const client = createCanvasClient({
      elements: [],
      appState: {
        scrollX: 0,
        scrollY: 0,
        width: 1280,
        height: 720,
        zoom: { value: 1 },
      },
      files: {},
    });

    await insertImageElement(client, {
      canvasId: "canvas-1",
      height: 768,
      mimeType: "image/png",
      objectPath: "generated/image-1.png",
      width: 1024,
    });

    const content = client.state.content as {
      elements: Array<Record<string, unknown>>;
    };
    expect(content.elements[0]).toMatchObject({
      x: 340,
      y: 135,
      width: 600,
      height: 450,
    });
  });

  it("centers the first generated image in a default viewport when no viewport is persisted", async () => {
    const client = createCanvasClient({
      elements: [],
      appState: {},
      files: {},
    });

    await insertImageElement(client, {
      canvasId: "canvas-1",
      height: 768,
      mimeType: "image/png",
      objectPath: "generated/image-1.png",
      width: 1024,
    });

    const content = client.state.content as {
      elements: Array<Record<string, unknown>>;
    };
    expect(content.elements[0]).toMatchObject({
      x: 340,
      y: 135,
      width: 600,
      height: 450,
    });
  });

  it("reserves automatic placements in request order before images finish", async () => {
    const client = createCanvasClient({
      elements: [
        {
          id: "existing",
          type: "image",
          x: 100,
          y: 100,
          width: 200,
          height: 120,
          isDeleted: false,
        },
      ],
      appState: {},
      files: {},
    });
    const sequence = await createCanvasAutoPlacementSequence(
      client,
      "canvas-1",
    );

    const first = sequence.reserve({ width: 600, height: 338 });
    const second = sequence.reserve({ width: 600, height: 338 });

    expect(first).toMatchObject({
      x: 340,
      y: -9,
      width: 600,
      height: 338,
    });
    expect(second).toMatchObject({
      x: 980,
      y: -9,
      width: 600,
      height: 338,
    });
  });

  it("inserts generated videos as embeddable canvas elements", async () => {
    const client = createCanvasClient({
      elements: [],
      appState: {},
      files: {},
    });

    const result = await insertVideoElement(client, {
      assetId: "video-asset-1",
      canvasId: "canvas-1",
      durationSeconds: 5,
      height: 720,
      mimeType: "video/mp4",
      prompt: "A spinning product shot",
      signedUrl: "http://127.0.0.1:3001/local-assets/video-1",
      title: "Product video",
      width: 1280,
    });

    const content = client.state.content as {
      elements: Array<Record<string, unknown>>;
    };
    expect(result.elementId).toBeTypeOf("string");
    expect(content.elements).toHaveLength(1);
    expect(content.elements[0]).toMatchObject({
      id: result.elementId,
      type: "embeddable",
      link: "/local-assets/video-asset-1",
      width: 640,
      height: 360,
      customData: {
        assetId: "video-asset-1",
        durationSeconds: 5,
        isVideo: true,
        mimeType: "video/mp4",
        prompt: "A spinning product shot",
        title: "Product video",
      },
    });
  });
});
