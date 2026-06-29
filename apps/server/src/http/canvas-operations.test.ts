import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCanvasOperations } from "./canvas-operations.js";

const tempDirs: string[] = [];

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

function createPngHeader(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer.write("PNG\r\n\u001a\n", 1, "binary");
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function createMp4Header() {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32BE(16, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("mp42", 8, "ascii");
  return buffer;
}

describe("createCanvasOperations", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { force: true, recursive: true })),
    );
  });

  it("imports a local image as an asset-backed canvas element", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "aimc-import-"));
    tempDirs.push(tempDir);
    const imagePath = join(tempDir, "poster.png");
    await writeFile(imagePath, createPngHeader(1200, 1600));

    const canvasClient = createCanvasClient({
      elements: [],
      appState: {},
      files: {},
    });
    const uploadFile = vi.fn(async (_user, input) => ({
      asset: {
        id: "asset-1",
        bucket: input.bucket,
        objectPath: "upload/asset-1.png",
        mimeType: input.mimeType,
        byteSize: input.fileBuffer.length,
        projectId: input.projectId,
        createdAt: new Date().toISOString(),
      },
      url: "http://127.0.0.1:3001/local-assets/asset-1",
    }));

    const operations = createCanvasOperations({
      canvasClient,
      canvasService: {
        getCanvas: vi.fn(),
        saveCanvasContent: vi.fn(),
      },
      localUser: {
        id: "local-user",
        email: "local@example.test",
        userMetadata: {},
      },
      uploadService: {
        uploadFile,
        createManagedFileAsset: vi.fn(),
        getAssetUrl: vi.fn(),
        deleteAsset: vi.fn(),
      },
    });

    const result = await operations.importImageFile({
      canvasId: "canvas-1",
      filePath: imagePath,
      projectId: "project-1",
      title: "Generated poster",
    });

    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        bucket: "project-assets",
        fileName: "poster.png",
        mimeType: "image/png",
        projectId: "project-1",
      }),
    );
    expect(result).toMatchObject({
      assetId: "asset-1",
      objectPath: "upload/asset-1.png",
      mimeType: "image/png",
      width: 1200,
      height: 1600,
    });
    const content = canvasClient.state.content as {
      elements: Array<Record<string, unknown>>;
      files: Record<string, Record<string, unknown>>;
    };
    const imageElement = content.elements[0];
    expect(imageElement).toMatchObject({
      id: result.elementId,
      type: "image",
      customData: {
        assetId: "asset-1",
        storageUrl: "/local-assets/asset-1",
        title: "Generated poster",
      },
    });
    const fileId = imageElement?.fileId as string;
    expect(content.files[fileId]).toMatchObject({
      assetId: "asset-1",
      storageUrl: "/local-assets/asset-1",
    });
  });

  it("imports a local video as an asset-backed canvas element", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "aimc-import-"));
    tempDirs.push(tempDir);
    const videoPath = join(tempDir, "clip.mp4");
    await writeFile(videoPath, createMp4Header());

    const canvasClient = createCanvasClient({
      elements: [],
      appState: {},
      files: {},
    });
    const uploadFile = vi.fn(async (_user, input) => ({
      asset: {
        id: "video-asset-1",
        bucket: input.bucket,
        objectPath: "upload/video-asset-1.mp4",
        mimeType: input.mimeType,
        byteSize: input.fileBuffer.length,
        projectId: input.projectId,
        createdAt: new Date().toISOString(),
      },
      url: "http://127.0.0.1:3001/local-assets/video-asset-1",
    }));

    const operations = createCanvasOperations({
      canvasClient,
      canvasService: {
        getCanvas: vi.fn(),
        saveCanvasContent: vi.fn(),
      },
      localUser: {
        id: "local-user",
        email: "local@example.test",
        userMetadata: {},
      },
      uploadService: {
        uploadFile,
        createManagedFileAsset: vi.fn(),
        getAssetUrl: vi.fn(),
        deleteAsset: vi.fn(),
      },
    });

    const result = await operations.importVideoFile({
      canvasId: "canvas-1",
      durationSeconds: 8,
      filePath: videoPath,
      height: 1080,
      projectId: "project-1",
      title: "Generated clip",
      width: 1920,
    });

    expect(result).toMatchObject({
      assetId: "video-asset-1",
      objectPath: "upload/video-asset-1.mp4",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationSeconds: 8,
    });
    const content = canvasClient.state.content as {
      elements: Array<Record<string, unknown>>;
    };
    expect(content.elements[0]).toMatchObject({
      id: result.elementId,
      type: "rectangle",
      link: null,
      customData: {
        assetId: "video-asset-1",
        durationSeconds: 8,
        isVideo: true,
        mimeType: "video/mp4",
        title: "Generated clip",
        videoUrl: "/local-assets/video-asset-1",
      },
    });
  });
});
