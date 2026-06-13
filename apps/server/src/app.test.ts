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
});
