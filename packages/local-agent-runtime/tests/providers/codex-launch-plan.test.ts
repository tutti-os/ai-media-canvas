import { describe, expect, it } from "vitest";

import { buildCodexLaunchPlan } from "../../src/providers/codex/launch-plan.js";

describe("buildCodexLaunchPlan", () => {
  it("uses trusted local execution, stdin delivery, cwd pinning, and repeatable add-dir flags", () => {
    expect(
      buildCodexLaunchPlan({
        runId: "run-1",
        cwd: "/tmp/project",
        prompt: "draw a poster",
        extraAllowedDirs: ["/repo/skills", "", "/tmp/codex/generated_images"],
      }),
    ).toEqual({
      command: "codex",
      cwd: "/tmp/project",
      env: undefined,
      prompt: "draw a poster",
      promptInput: "stdin",
      args: [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--disable",
        "plugins",
        "--ignore-rules",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C",
        "/tmp/project",
        "--add-dir",
        "/repo/skills",
        "--add-dir",
        "/tmp/codex/generated_images",
      ],
    });
  });

  it("clamps reasoning for GPT-5.4+", () => {
    expect(
      buildCodexLaunchPlan({
        runId: "run-1",
        cwd: "/tmp/project",
        prompt: "ship it",
        model: "gpt-5.4",
        reasoning: "minimal",
      }).args,
    ).toEqual([
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--disable",
      "plugins",
      "--ignore-rules",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C",
      "/tmp/project",
      "--model",
      "gpt-5.4",
      "-c",
      'model_reasoning_effort="low"',
    ]);
  });
});
