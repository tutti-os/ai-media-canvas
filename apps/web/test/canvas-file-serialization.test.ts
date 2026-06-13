import { describe, expect, it } from "vitest";

import {
  prepareCanvasImageFiles,
  resolveCanvasImageFiles,
  serializeExcalidrawFiles,
} from "../src/lib/canvas-file-serialization";

describe("canvas file serialization", () => {
  it("normalizes loopback local asset urls to the current server base url", () => {
    const prepared = prepareCanvasImageFiles({
      elements: [
        {
          id: "el-1",
          type: "image",
          fileId: "file-1",
          status: "error",
          customData: {
            storageUrl: "http://127.0.0.1:59881/local-assets/asset-1",
          },
        },
      ],
      appState: {},
      files: {},
    });

    expect(prepared.pendingUrls).toEqual([
      {
        fileId: "file-1",
        url: "http://localhost:3000/local-assets/asset-1",
        meta: {
          id: "file-1",
          assetId: "asset-1",
          storageUrl: "/local-assets/asset-1",
        },
      },
    ]);
    expect(prepared.files["file-1"]).toMatchObject({
      assetId: "asset-1",
      storageUrl: "/local-assets/asset-1",
    });
  });

  it("preserves remote urls that are not local assets", () => {
    const prepared = prepareCanvasImageFiles({
      elements: [
        {
          id: "el-1",
          type: "image",
          fileId: "file-1",
          customData: {
            storageUrl: "https://cdn.example.com/local-assets/asset-1",
          },
        },
      ],
      appState: {},
      files: {},
    });

    expect(prepared.pendingUrls[0]?.url).toBe(
      "https://cdn.example.com/local-assets/asset-1",
    );
    expect(prepared.files["file-1"]).toMatchObject({
      storageUrl: "https://cdn.example.com/local-assets/asset-1",
    });
  });

  it("serializes local asset urls without persisting the runtime port", () => {
    expect(
      serializeExcalidrawFiles(
        {
          "file-1": {
            id: "file-1",
            dataURL: "data:image/png;base64,abc",
            mimeType: "image/png",
            created: 456,
            storageUrl: "http://localhost:59881/local-assets/asset-1",
          },
        },
        {},
      ),
    ).toEqual({
      "file-1": {
        id: "file-1",
        dataURL: "data:image/png;base64,abc",
        mimeType: "image/png",
        created: 456,
        assetId: "asset-1",
        storageUrl: "/local-assets/asset-1",
      },
    });
  });

  it("resolves asset ids into current local asset urls", async () => {
    const resolved = await resolveCanvasImageFiles(
      {
        elements: [
          {
            id: "el-1",
            type: "image",
            fileId: "file-1",
            status: "error",
          },
        ],
        appState: {},
        files: {
          "file-1": {
            id: "file-1",
            mimeType: "image/png",
            created: 123,
            assetId: "asset-1",
          },
        },
      },
      async (url) => {
        expect(url).toBe("http://localhost:3000/local-assets/asset-1");
        return "data:image/png;base64,abc";
      },
    );

    expect(resolved.files["file-1"]).toMatchObject({
      assetId: "asset-1",
      storageUrl: "/local-assets/asset-1",
    });
  });

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
        url: "http://localhost:3000/local-assets/file-1",
        meta: {
          id: "file-1",
          assetId: "file-1",
          mimeType: "image/png",
          created: 123,
          dataURL: "",
          storageUrl: "/local-assets/file-1",
          objectPath: "generated/file-1.png",
        },
      },
    ]);
    expect(prepared.inlineFiles).toEqual({});
    expect(prepared.files["file-1"]).toMatchObject({
      assetId: "file-1",
      storageUrl: "/local-assets/file-1",
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
        assetId: "file-1",
        storageUrl: "/local-assets/file-1",
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
        expect(url).toBe("http://localhost:3000/local-assets/file-1");
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
        assetId: "file-1",
        storageUrl: "/local-assets/file-1",
      },
    });
  });
});
