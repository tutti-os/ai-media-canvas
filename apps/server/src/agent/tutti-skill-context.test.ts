import type { DetectContext } from "@tutti-os/agent-acp-kit";
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

import { loadTuttiAgentSkillContextForRun } from "./tutti-skill-context.js";

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
      cwd: "/tmp/run",
      provider: "tutti-agent",
      runId: "run-1",
    });

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledWith({
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

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledWith({
      agentSessionId: "run-2",
      cwd: "/tmp/run",
      provider: "codex",
    });
  });

  it("forwards the same request DetectContext to the kit facade", async () => {
    const detectContext: DetectContext = {
      managedAgentInvocation: {
        credential: "credential-1",
        cwd: "/app-data",
      },
      redactionSecrets: ["credential-1"],
    };
    const controller = new AbortController();

    await loadTuttiAgentSkillContextForRun({
      cwd: "/workspace/run",
      detectContext,
      provider: "codex",
      runId: "run-1",
      signal: controller.signal,
    });

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledOnce();
    const input = loadTuttiAgentSkillContextMock.mock.calls[0]?.[0];
    expect(input.detectContext).toBe(detectContext);
    expect(input).toMatchObject({
      agentSessionId: "run-1",
      cwd: "/workspace/run",
      provider: "codex",
      signal: controller.signal,
    });
  });

  it("redacts request credentials from fallback warnings", async () => {
    const secret = "credential-warning-secret";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadTuttiAgentSkillContextMock.mockRejectedValue(
      new Error(`skill failed with ${secret}`),
    );

    await expect(
      loadTuttiAgentSkillContextForRun({
        cwd: "/workspace/run",
        detectContext: {
          managedAgentInvocation: { credential: secret, cwd: "/app-data" },
          redactionSecrets: [secret],
        },
        provider: "codex",
        runId: "run-1",
      }),
    ).resolves.toEqual({ source: "standalone", skillManifest: [], skills: [] });

    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"));
  });
});
