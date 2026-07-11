import { afterEach, describe, expect, it, vi } from "vitest";

const { loadTuttiAgentSkillContext } = vi.hoisted(() => ({
  loadTuttiAgentSkillContext: vi.fn(async () => ({
    source: "standalone" as const,
    skills: [],
    skillManifest: [],
  })),
}));

vi.mock("@tutti-os/agent-acp-kit/tutti", () => ({
  loadTuttiAgentSkillContext,
}));

import { loadTuttiAgentSkillContextForRun } from "./tutti-skill-context.js";

describe("loadTuttiAgentSkillContextForRun", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    loadTuttiAgentSkillContext.mockClear();
  });

  it("prefers the configured Tutti workspace root over the run cwd", async () => {
    vi.stubEnv("TUTTI_WORKSPACE_ROOT", "  /workspace/root  ");

    await loadTuttiAgentSkillContextForRun({
      cwd: "/tmp/run",
      provider: "tutti-agent",
      runId: "run-1",
    });

    expect(loadTuttiAgentSkillContext).toHaveBeenCalledWith({
      agentSessionId: "run-1",
      cwd: "/workspace/root",
      provider: "tutti-agent",
    });
  });

  it("uses the run cwd when no workspace root is configured", async () => {
    vi.stubEnv("TUTTI_WORKSPACE_ROOT", "  ");

    await loadTuttiAgentSkillContextForRun({
      cwd: "/tmp/run",
      provider: "codex",
      runId: "run-2",
    });

    expect(loadTuttiAgentSkillContext).toHaveBeenCalledWith({
      agentSessionId: "run-2",
      cwd: "/tmp/run",
      provider: "codex",
    });
  });
});
