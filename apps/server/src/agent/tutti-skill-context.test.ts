import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadTuttiAgentSkillContextMock } = vi.hoisted(() => ({
  loadTuttiAgentSkillContextMock: vi.fn(),
}));

vi.mock("@tutti-os/agent-acp-kit/tutti", () => ({
  loadTuttiAgentSkillContext: loadTuttiAgentSkillContextMock,
  redactTuttiCliChildProcessText: (text: string, secrets: readonly string[]) =>
    secrets.reduce(
      (redacted, secret) => redacted.split(secret).join("[REDACTED]"),
      text,
    ),
}));

import {
  loadDefaultTuttiAgentSkillContextForRun,
  loadTuttiAgentSkillContextForRun,
} from "./tutti-skill-context.js";

describe("loadTuttiAgentSkillContextForRun", () => {
  beforeEach(() => {
    loadTuttiAgentSkillContextMock.mockReset();
    loadTuttiAgentSkillContextMock.mockResolvedValue({
      source: "standalone",
      skills: [],
      skillManifest: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prefers the configured Tutti workspace root over the run cwd", async () => {
    vi.stubEnv("TUTTI_WORKSPACE_ROOT", "  /workspace/root  ");

    await loadTuttiAgentSkillContextForRun({
      agentTargetId: "team:designer",
      cwd: "/tmp/run",
      runId: "run-1",
    });

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledWith({
      agentSessionId: "run-1",
      cwd: "/workspace/root",
      agentTargetId: "team:designer",
    });
  });

  it("uses the run cwd when no workspace root is configured", async () => {
    vi.stubEnv("TUTTI_WORKSPACE_ROOT", "  ");

    await loadTuttiAgentSkillContextForRun({
      agentTargetId: "team:reviewer",
      cwd: "/tmp/run",
      runId: "run-2",
    });

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledWith({
      agentSessionId: "run-2",
      cwd: "/tmp/run",
      agentTargetId: "team:reviewer",
    });
  });

  it("forwards cancellation without any request credential context", async () => {
    const controller = new AbortController();

    await loadTuttiAgentSkillContextForRun({
      agentTargetId: "team:designer",
      cwd: "/workspace/run",
      runId: "run-1",
      signal: controller.signal,
    });

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledOnce();
    const input = loadTuttiAgentSkillContextMock.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty("detectContext");
    expect(input).toMatchObject({
      agentSessionId: "run-1",
      cwd: "/workspace/run",
      agentTargetId: "team:designer",
      signal: controller.signal,
    });
  });

  it("reports standalone skill-context failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadTuttiAgentSkillContextMock.mockRejectedValue(
      new Error("skill context unavailable"),
    );

    await expect(
      loadTuttiAgentSkillContextForRun({
        agentTargetId: "team:designer",
        cwd: "/workspace/run",
        runId: "run-1",
      }),
    ).resolves.toEqual({ source: "standalone", skillManifest: [], skills: [] });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("skill context unavailable"),
    );
  });

  it("rethrows cancellation instead of returning an empty skill bundle", async () => {
    const controller = new AbortController();
    const abortError = new DOMException(
      "The operation was aborted",
      "AbortError",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadTuttiAgentSkillContextMock.mockImplementation(async () => {
      controller.abort(abortError);
      throw abortError;
    });

    await expect(
      loadTuttiAgentSkillContextForRun({
        agentTargetId: "team:designer",
        cwd: "/workspace/run",
        runId: "run-1",
        signal: controller.signal,
      }),
    ).rejects.toBe(abortError);

    expect(warn).not.toHaveBeenCalled();
  });

  it("loads server guidance for the available exact default Agent Target", async () => {
    const runtime = {
      detect: vi.fn(async () => [
        {
          agentTargetId: "team:designer",
          provider: "codex",
          displayName: "Designer",
          supported: true,
          authState: "ok" as const,
          models: [],
        },
        {
          agentTargetId: "team:reviewer",
          provider: "codex",
          displayName: "Reviewer",
          supported: true,
          authState: "ok" as const,
          models: [],
          isDefault: true as const,
        },
      ]),
    };

    const result = await loadDefaultTuttiAgentSkillContextForRun({
      cwd: "/workspace/run",
      runId: "run-default",
      runtime,
    });

    expect(result.agentTargetId).toBe("team:reviewer");
    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledWith({
      agentTargetId: "team:reviewer",
      agentSessionId: "run-default",
      cwd: "/workspace/run",
    });
    expect(runtime.detect).toHaveBeenCalledWith({
      cwd: "/workspace/run",
      refresh: true,
    });
  });
});
