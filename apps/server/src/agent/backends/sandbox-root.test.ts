import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadServerEnv } from "../../config/env.js";
import { createAgentBackend } from "./index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent sandbox root", () => {
  it("uses TUTTI_APP_DATA_DIR for production sandboxes", async () => {
    const tempRoot = createTempRoot();
    const appDataDir = join(tempRoot, "app-data");
    const skillsRoot = join(tempRoot, "skills");
    mkdirSync(appDataDir, { recursive: true });
    mkdirSync(skillsRoot, { recursive: true });

    const backendResult = await createAgentBackend(
      {
        agentBackendMode: "state",
        appDataDir,
        skillsRoot,
      },
      "canvas-1",
    );

    expectSandboxDirInside(
      backendResult.sandboxDir,
      join(appDataDir, "ai-media-canvas-sandbox"),
    );
  });

  it("uses AIMC_DATA_ROOT as the production sandbox fallback", async () => {
    const tempRoot = createTempRoot();
    const dataRoot = join(tempRoot, "data-root");
    const skillsRoot = join(tempRoot, "skills");
    mkdirSync(dataRoot, { recursive: true });
    mkdirSync(skillsRoot, { recursive: true });

    const backendResult = await createAgentBackend(
      loadServerEnv({
        agentBackendMode: "state",
        dataRoot,
        skillsRoot,
      }),
      "canvas-1",
    );

    expectSandboxDirInside(
      backendResult.sandboxDir,
      join(dataRoot, "ai-media-canvas-sandbox"),
    );
  });

  it("uses TUTTI_APP_DATA_DIR for filesystem sandboxes", async () => {
    const tempRoot = createTempRoot();
    const agentFilesRoot = join(tempRoot, "agent-files");
    const appDataDir = join(tempRoot, "app-data");
    const skillsRoot = join(tempRoot, "skills");
    mkdirSync(agentFilesRoot, { recursive: true });
    mkdirSync(appDataDir, { recursive: true });
    mkdirSync(skillsRoot, { recursive: true });

    const backendResult = await createAgentBackend({
      agentBackendMode: "filesystem",
      agentFilesRoot,
      appDataDir,
      skillsRoot,
    });

    expectSandboxDirInside(
      backendResult.sandboxDir,
      join(appDataDir, "ai-media-canvas-sandbox-dev"),
    );
  });

  it("uses AIMC_DATA_ROOT as the filesystem sandbox fallback", async () => {
    const tempRoot = createTempRoot();
    const agentFilesRoot = join(tempRoot, "agent-files");
    const dataRoot = join(tempRoot, "data-root");
    const skillsRoot = join(tempRoot, "skills");
    mkdirSync(agentFilesRoot, { recursive: true });
    mkdirSync(dataRoot, { recursive: true });
    mkdirSync(skillsRoot, { recursive: true });

    const backendResult = await createAgentBackend(loadServerEnv({
      agentBackendMode: "filesystem",
      agentFilesRoot,
      dataRoot,
      skillsRoot,
    }));

    expectSandboxDirInside(
      backendResult.sandboxDir,
      join(dataRoot, "ai-media-canvas-sandbox-dev"),
    );
  });
});

function createTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "aimc-sandbox-root-"));
  tempDirs.push(tempRoot);
  return tempRoot;
}

function expectSandboxDirInside(
  sandboxDir: string | undefined,
  expectedRoot: string,
) {
  expect(sandboxDir).toBeDefined();
  expect(sandboxDir?.startsWith(`${realpathSync(expectedRoot)}${sep}`)).toBe(
    true,
  );
}
