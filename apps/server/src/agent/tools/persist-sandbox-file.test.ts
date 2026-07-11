import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPersistSandboxFileTool } from "./persist-sandbox-file.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("persist_sandbox_file path validation", () => {
  it("accepts a sandbox and file that resolve through different symlink spellings", async () => {
    const root = mkdtempSync(join(tmpdir(), "aimc-persist-sandbox-"));
    tempRoots.push(root);
    const realSandbox = join(root, "real-sandbox");
    const sandboxAlias = join(root, "sandbox-alias");
    mkdirSync(realSandbox);
    symlinkSync(realSandbox, sandboxAlias);
    writeFileSync(join(realSandbox, "asset.svg"), "<svg />");
    const createUserClient = vi.fn(() => {
      throw new Error("client-called");
    });
    const persist = createPersistSandboxFileTool({
      createUserClient,
      sandboxDir: sandboxAlias,
    });

    await expect(
      persist.invoke(
        { filePath: join(realSandbox, "asset.svg") },
        { configurable: { access_token: "token" } },
      ),
    ).resolves.toBe("Error reading or uploading file: client-called");
    expect(createUserClient).toHaveBeenCalledWith("token");
  });

  it("rejects sibling directories that merely share the sandbox prefix", async () => {
    const root = mkdtempSync(join(tmpdir(), "aimc-persist-prefix-"));
    tempRoots.push(root);
    const sandbox = join(root, "sandbox");
    const sibling = join(root, "sandbox-escape");
    mkdirSync(sandbox);
    mkdirSync(sibling);
    const filePath = join(sibling, "asset.svg");
    writeFileSync(filePath, "<svg />");
    const createUserClient = vi.fn();
    const persist = createPersistSandboxFileTool({
      createUserClient,
      sandboxDir: sandbox,
    });

    await expect(
      persist.invoke({ filePath }, { configurable: { access_token: "token" } }),
    ).resolves.toBe("Error: filePath must be inside the sandbox directory.");
    expect(createUserClient).not.toHaveBeenCalled();
  });
});
