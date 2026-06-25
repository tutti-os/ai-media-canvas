import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

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

  it("marks the bundled imagegen directory skill as installed by default", async () => {
    vi.stubEnv("AIMC_SKILLS_ROOT", "");
    vi.resetModules();
    const { getBundledSkills } = await import("./skill-catalog.js");

    expect(getBundledSkills()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "skill-local-imagegen",
          installedByDefault: true,
        }),
      ]),
    );
  });
});
