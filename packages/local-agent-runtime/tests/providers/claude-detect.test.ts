import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectClaude } from "../../src/providers/claude/detect.js";

describe("detectClaude", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("falls back to openclaude and reports config roots", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aimc-claude-detect-"));
    tempDirs.push(dir);
    const openClaude = join(dir, "openclaude");
    writeFileSync(
      openClaude,
      "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"openclaude 0.9.0\"; exit 0; fi\nexit 1\n",
    );
    chmodSync(openClaude, 0o755);

    const detection = await detectClaude({
      env: { PATH: dir },
    });

    expect(detection).toMatchObject({
      executablePath: openClaude,
      version: "openclaude 0.9.0",
      configDir: join(process.env.HOME ?? "", ".claude"),
      skillsDir: join(process.env.HOME ?? "", ".claude", "skills"),
      supported: true,
    });
  });
});
