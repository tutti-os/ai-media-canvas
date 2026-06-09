import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

describe("local bundled skill catalog", () => {
  it("loads directory skills from AIMC_SKILLS_ROOT", async () => {
    const skillsRoot = mkdtempSync(join(tmpdir(), "aimc-skills-root-"));
    const skillDir = join(skillsRoot, "packaged-test-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: Packaged Test Skill",
        "description: Loaded from package skills root.",
        "---",
        "",
        "# Packaged Test Skill",
      ].join("\n"),
    );

    vi.stubEnv("AIMC_SKILLS_ROOT", skillsRoot);
    vi.resetModules();
    const { getBundledSkills } = await import("./skill-catalog.js");

    expect(getBundledSkills()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "skill-local-packaged-test-skill",
          description: "Loaded from package skills root.",
        }),
      ]),
    );
  });
});
