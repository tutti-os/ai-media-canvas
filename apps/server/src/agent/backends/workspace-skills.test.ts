import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BackendProtocolV2 } from "deepagents";
import { afterEach, describe, expect, it } from "vitest";

import { createProductionBackendFactory } from "./prod.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("workspace skills backend", () => {
  it("serves workspace skills without a LangGraph store", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-workspace-skills-"));
    tempDirs.push(tempRoot);
    const skillsRoot = join(tempRoot, "system-skills");
    mkdirSync(skillsRoot, { recursive: true });

    const backendResult = createProductionBackendFactory("canvas-1", {
      sandboxRoot: join(tempRoot, "sandboxes"),
      skillsRoot,
      workspaceSkills: [
        {
          name: "canvas-director",
          description: "Inspect canvas layout before edits.",
          path: "/workspace-skills/canvas-director/SKILL.md",
          content: "# Canvas Director\n\nInspect the real element bounds.",
          files: [
            {
              path: "scripts/measure.ts",
              content: "export const measure = true;",
            },
          ],
        },
      ],
    });

    const backend = backendResult.factory({ state: {} }) as BackendProtocolV2;

    await expect(
      backend.read("/workspace-skills/canvas-director/SKILL.md"),
    ).resolves.toMatchObject({
      content: expect.stringContaining("Inspect the real element bounds."),
    });
    await expect(
      backend.read("/workspace-skills/canvas-director/scripts/measure.ts"),
    ).resolves.toMatchObject({
      content: expect.stringContaining("measure"),
    });
    await expect(
      backend.write("/workspace-skills/canvas-director/SKILL.md", "changed"),
    ).resolves.toMatchObject({
      error: expect.stringContaining("read-only"),
    });
  });
});
