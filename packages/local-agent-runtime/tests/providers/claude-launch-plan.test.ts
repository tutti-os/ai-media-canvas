import { describe, expect, it } from "vitest";

import { buildClaudeLaunchPlan } from "../../src/providers/claude/launch-plan.js";

describe("buildClaudeLaunchPlan", () => {
  it("builds a stream-json stdin launch plan with repeatable add-dir flags", () => {
    expect(
      buildClaudeLaunchPlan({
        runId: "run-1",
        cwd: "/tmp/project",
        prompt: "refine the poster",
        model: "sonnet",
        extraAllowedDirs: ["/repo/skills", "", "/repo/design-system"],
      }),
    ).toEqual({
      command: "claude",
      cwd: "/tmp/project",
      prompt: "refine the poster",
      promptInput: "stdin",
      args: [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "sonnet",
        "--add-dir",
        "/repo/skills",
        "--add-dir",
        "/repo/design-system",
        "--permission-mode",
        "bypassPermissions",
      ],
    });
  });
});
