import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local asset storage", () => {
  it("uses video MIME type when storing extensionless MP4 assets", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-store-assets-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });

    const uploaded = store.uploadFile({
      bucket: "project-assets",
      fileName: "generated-video",
      fileBuffer: Buffer.from("video"),
      mimeType: "video/mp4",
    });

    expect(uploaded.asset.objectPath).toMatch(/\.mp4$/);
    expect(uploaded.filePath).toMatch(/\.mp4$/);
  });
});
