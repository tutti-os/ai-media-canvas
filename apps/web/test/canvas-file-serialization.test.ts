import { describe, expect, it } from "vitest";

import {
  prepareCanvasImageFiles,
  resolveCanvasImageFiles,
  serializeExcalidrawFiles,
} from "../src/lib/canvas-file-serialization";

describe("canvas file serialization", () => {
  it("recovers pending storage urls from image element metadata", () => {
    const prepared = prepareCanvasImageFiles({
      elements: [
        {
          id: "el-1",
          type: "image",
          fileId: "file-1",
          status: "error",
          customData: {
            storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
            objectPath: "generated/file-1.png",
          },
        },
      ],
      appState: {},
      files: {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          created: 123,
          dataURL: "",
        },
      },
    });

    expect(prepared.pendingUrls).toEqual([
      {
        fileId: "file-1",
        url: "http://127.0.0.1:3001/local-assets/file-1",
        meta: {
          id: "file-1",
          mimeType: "image/png",
          created: 123,
          dataURL: "",
          storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
          objectPath: "generated/file-1.png",
        },
      },
    ]);
    expect(prepared.inlineFiles).toEqual({});
    expect(prepared.files["file-1"]).toMatchObject({
      storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
      objectPath: "generated/file-1.png",
    });
    expect(prepared.elements[0]).toMatchObject({ status: "saved" });
  });

  it("preserves persisted storage metadata while saving files", () => {
    expect(
      serializeExcalidrawFiles(
        {
          "file-1": {
            id: "file-1",
            dataURL: "data:image/png;base64,abc",
            mimeType: "image/png",
            created: 456,
          },
        },
        {
          "file-1": {
            id: "file-1",
            mimeType: "image/png",
            created: 123,
            storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
            objectPath: "generated/file-1.png",
          },
        },
      ),
    ).toEqual({
      "file-1": {
        id: "file-1",
        dataURL: "data:image/png;base64,abc",
        mimeType: "image/png",
        created: 456,
        storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
        objectPath: "generated/file-1.png",
      },
    });
  });

  it("resolves storage-backed files into data URLs for live canvas sync", async () => {
    const resolved = await resolveCanvasImageFiles(
      {
        elements: [
          {
            id: "el-1",
            type: "image",
            fileId: "file-1",
            status: "error",
            customData: {
              storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
            },
          },
        ],
        appState: {},
        files: {
          "file-1": {
            id: "file-1",
            mimeType: "image/png",
            created: 123,
            storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
          },
        },
      },
      async (url) => {
        expect(url).toBe("http://127.0.0.1:3001/local-assets/file-1");
        return "data:image/png;base64,abc";
      },
    );

    expect(resolved.elements[0]).toMatchObject({ status: "saved" });
    expect(resolved.files).toEqual({
      "file-1": {
        id: "file-1",
        dataURL: "data:image/png;base64,abc",
        mimeType: "image/png",
        created: 123,
        storageUrl: "http://127.0.0.1:3001/local-assets/file-1",
      },
    });
  });
});
