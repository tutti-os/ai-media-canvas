import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectCodex } from "../../src/providers/codex/detect.js";

describe("detectCodex", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("returns config and skills directories from CODEX_HOME", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aimc-codex-detect-"));
    tempDirs.push(dir);
    const codexBin = join(dir, "codex");
    writeFileSync(
      codexBin,
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"codex 1.2.3\"; exit 0; fi\nexit 1\n",
    );
    chmodSync(codexBin, 0o755);

    const detection = await detectCodex({
      env: { PATH: dir, CODEX_HOME: join(dir, ".codex-home") },
    });

    expect(detection).toMatchObject({
      executablePath: codexBin,
      version: "codex 1.2.3",
      configDir: join(dir, ".codex-home"),
      skillsDir: join(dir, ".codex-home", "skills"),
      supported: true,
    });
  });
});
