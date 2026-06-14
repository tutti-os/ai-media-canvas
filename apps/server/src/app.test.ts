import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createAgentRunServiceMock } = vi.hoisted(() => ({
  createAgentRunServiceMock: vi.fn(() => ({
    cancelRun: vi.fn(),
    createRun: vi.fn(),
    streamRun: vi.fn(async function* streamRun() {}),
  })),
}));

vi.mock("./agent/runtime.js", () => ({
  createAgentRunService: createAgentRunServiceMock,
}));

import { buildApp } from "./app.js";
import { createLocalStore } from "./local/store.js";

describe("buildApp", () => {
  const dataRoots: string[] = [];

  afterEach(async () => {
    createAgentRunServiceMock.mockClear();
    await Promise.all(
      dataRoots
        .splice(0)
        .map((dataRoot) =>
          rm(dataRoot, { force: true, recursive: true, maxRetries: 3 }),
        ),
    );
  });

  it("wires the local job service into agent runs", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-app-test-"));
    dataRoots.push(dataRoot);

    const app = buildApp({ env: { dataRoot } });
    await app.close();

    expect(createAgentRunServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobService: expect.objectContaining({
          createJob: expect.any(Function),
          getJob: expect.any(Function),
        }),
      }),
    );
  });

  it("serves local assets with byte-range support for media playback", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "aimc-app-test-"));
    dataRoots.push(dataRoot);
    const setupStore = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const uploaded = setupStore.uploadFile({
      bucket: "project-assets",
      fileName: "clip.mp4",
      fileBuffer: Buffer.from("0123456789"),
      mimeType: "video/mp4",
    });

    const app = buildApp({ env: { dataRoot } });
    const response = await app.inject({
      method: "GET",
      url: `/local-assets/${uploaded.asset.id}`,
      headers: {
        range: "bytes=0-3",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(206);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-range"]).toBe("bytes 0-3/10");
    expect(response.headers["content-type"]).toContain("video/mp4");
    expect(response.body).toBe("0123");
  });
});
