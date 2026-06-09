import { describe, expect, it } from "vitest";

import {
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
        source: "generated",
        storageUrl: "http://127.0.0.1:3001/local-assets/image-1",
        title: "Dancing girl",
      },
    });
    const fileId = content.elements[0]?.fileId as string;
    expect(content.files[fileId]).toMatchObject({
      id: fileId,
      mimeType: "image/png",
      storageUrl: "http://127.0.0.1:3001/local-assets/image-1",
    });
  });

  it("inserts generated videos as embeddable canvas elements", async () => {
    const client = createCanvasClient({
      elements: [],
      appState: {},
      files: {},
    });

    const result = await insertVideoElement(client, {
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
      link: "http://127.0.0.1:3001/local-assets/video-1",
      width: 640,
      height: 360,
      customData: {
        durationSeconds: 5,
        isVideo: true,
        mimeType: "video/mp4",
        prompt: "A spinning product shot",
        title: "Product video",
      },
    });
  });
});
