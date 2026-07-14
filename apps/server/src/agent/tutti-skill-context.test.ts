import type { DetectContext } from "@tutti-os/agent-acp-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadTuttiAgentCatalogMock, loadTuttiAgentSkillContextMock } =
  vi.hoisted(() => ({
    loadTuttiAgentCatalogMock: vi.fn(),
    loadTuttiAgentSkillContextMock: vi.fn(),
  }));

vi.mock("@tutti-os/agent-acp-kit/tutti", () => ({
  loadTuttiAgentCatalog: loadTuttiAgentCatalogMock,
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
    loadTuttiAgentCatalogMock.mockReset();
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
      agentTargetId: "team:designer",
      cwd: "/workspace/run",
      detectContext,
      runId: "run-1",
      signal: controller.signal,
    });

    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledOnce();
    const input = loadTuttiAgentSkillContextMock.mock.calls[0]?.[0];
    expect(input.detectContext).toBe(detectContext);
    expect(input).toMatchObject({
      agentSessionId: "run-1",
      cwd: "/workspace/run",
      agentTargetId: "team:designer",
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
        agentTargetId: "team:designer",
        cwd: "/workspace/run",
        detectContext: {
          managedAgentInvocation: { credential: secret, cwd: "/app-data" },
          redactionSecrets: [secret],
        },
        runId: "run-1",
      }),
    ).resolves.toEqual({ source: "standalone", skillManifest: [], skills: [] });

    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"));
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
    loadTuttiAgentCatalogMock.mockResolvedValue({
      schemaVersion: 1,
      source: "tutti-cli",
      cliContract: "agent-id",
      defaultAgentTargetId: "team:reviewer",
      agents: [
        {
          agentTargetId: "team:designer",
          providerId: "shared-runtime",
          displayName: "Designer",
          runtimeSupported: true,
          availability: { status: "available", reasonCode: "", detail: "" },
        },
        {
          agentTargetId: "team:reviewer",
          providerId: "shared-runtime",
          displayName: "Reviewer",
          runtimeSupported: true,
          availability: { status: "available", reasonCode: "", detail: "" },
        },
      ],
    });

    const result = await loadDefaultTuttiAgentSkillContextForRun({
      cwd: "/workspace/run",
      runId: "run-default",
    });

    expect(result.agentTargetId).toBe("team:reviewer");
    expect(loadTuttiAgentSkillContextMock).toHaveBeenCalledWith({
      agentTargetId: "team:reviewer",
      agentSessionId: "run-default",
      cwd: "/workspace/run",
    });
  });
});
