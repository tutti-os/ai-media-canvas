import { describe, expect, it, vi } from "vitest";

import type { AgentRuntimeProvider } from "@aimc/shared";
import type { LocalAgentProviderPlugin } from "@tutti-os/agent-acp-kit";

import {
  createLocalAgentRuntimeProvider,
  isManagedAgentWorkspaceCwd,
} from "./local-agent.js";
import type { RuntimeExecutionContext } from "./types.js";

function createProviderPlugin(
  provider: AgentRuntimeProvider,
): LocalAgentProviderPlugin<"local-agent", AgentRuntimeProvider> {
  return {
    id: provider,
    displayName: provider,
    kind: "local-agent",
    async detect() {
      return null;
    },
    capabilities() {
      return {
        cancel: true,
        nativeResume: false,
        streaming: true,
        toolGateway: true,
        maxConcurrentRuns: 1,
      };
    },
    async buildLaunchPlan() {
      throw new Error("not used");
    },
    async *run() {
      yield* [];
      throw new Error("not used");
    },
  };
}

function createRuntimeContext(
  overrides: Partial<RuntimeExecutionContext["run"]> = {},
): RuntimeExecutionContext {
  return {
    backendResult: { factory: { kind: "backend" } } as never,
    brandKitId: null,
    resolvedModel: "codex:gpt-5.4",
    rlog: {
      elapsed: vi.fn(() => 0),
      error: vi.fn(),
      info: vi.fn(),
      lap: vi.fn(),
      warn: vi.fn(),
    },
    run: {
      consumed: false,
      controller: new AbortController(),
      conversationId: "canvas-1",
      prompt: "hello",
      runId: "run-1",
      sessionId: "session-1",
      status: "accepted",
      ...overrides,
    },
    runtimeEnv: {
      agentBackendMode: "state",
      agentModel: "codex:gpt-5.4",
      port: 3001,
      version: "0.0.0",
      webOrigin: "http://localhost:3000",
    },
    workspaceSkills: [],
  };
}

async function collect<T>(stream: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe("createLocalAgentRuntimeProvider", () => {
  it("injects the managed agent invocation credential only into the provider env", async () => {
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const createRunDirectory = vi.fn(async () => {
      return "/workspace/.aimc-agent-runs/codex-run-1";
    });
    const context = createRuntimeContext({
      managedAgentInvocationCredential: "credential-run-1",
    });
    const provider = createLocalAgentRuntimeProvider(
      {
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        createRunDirectory,
        loadCanvasSummaryForRuntime: vi.fn(async () => null),
        localAgentRuntime: { run: localAgentRuntimeRun },
        now: () => "2026-06-17T00:00:00.000Z",
        toolGateway: {
          createSession: vi.fn(() => ({ token: "tool-token" })),
          revokeSession: vi.fn(),
        } as never,
        toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
      },
      createProviderPlugin("codex"),
    );

    await collect(provider.streamRun(context));

    expect(createRunDirectory).toHaveBeenCalledWith({
      managed: true,
      runId: "run-1",
      runtimeProvider: "codex",
    });
    expect(JSON.stringify(createRunDirectory.mock.calls)).not.toContain(
      "credential-run-1",
    );
    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      cwd: "/workspace/.aimc-agent-runs/codex-run-1",
      env: {
        TSH_MANAGED_AGENT_INVOCATION_CREDENTIAL: "credential-run-1",
      },
    });
    expect(params).not.toHaveProperty("mcpServers");
    expect(context.run.managedAgentInvocationCredential).toBeUndefined();
  });

  it("keeps credentialless local-agent runs on the regular tmp cwd without managed env", async () => {
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const createRunDirectory = vi.fn(async () => {
      return "/tmp/aimc-local-agent-run";
    });
    const provider = createLocalAgentRuntimeProvider(
      {
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        createRunDirectory,
        loadCanvasSummaryForRuntime: vi.fn(async () => null),
        localAgentRuntime: { run: localAgentRuntimeRun },
        now: () => "2026-06-17T00:00:00.000Z",
        toolGateway: {
          createSession: vi.fn(() => ({ token: "tool-token" })),
          revokeSession: vi.fn(),
        } as never,
        toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
      },
      createProviderPlugin("codex"),
    );

    await collect(provider.streamRun(createRuntimeContext()));

    expect(createRunDirectory).toHaveBeenCalledWith({
      managed: false,
      runId: "run-1",
      runtimeProvider: "codex",
    });
    expect(localAgentRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp/aimc-local-agent-run",
        mcpServers: expect.any(Array),
      }),
    );
    expect(localAgentRuntimeRun.mock.calls[0]?.[0]).not.toHaveProperty("env");
  });

  it("rejects managed agent runs outside /workspace", async () => {
    const localAgentRuntimeRun = vi.fn();
    const provider = createLocalAgentRuntimeProvider(
      {
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        createRunDirectory: vi.fn(async () => "/tmp/aimc-local-agent-run"),
        loadCanvasSummaryForRuntime: vi.fn(async () => null),
        localAgentRuntime: { run: localAgentRuntimeRun },
        now: () => "2026-06-17T00:00:00.000Z",
        toolGateway: {
          createSession: vi.fn(() => ({ token: "tool-token" })),
          revokeSession: vi.fn(),
        } as never,
        toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
      },
      createProviderPlugin("codex"),
    );

    await expect(
      collect(
        provider.streamRun(
          createRuntimeContext({
            managedAgentInvocationCredential: "credential-run-1",
          }),
        ),
      ),
    ).rejects.toThrow("Managed agent cwd must be under /workspace.");
    expect(localAgentRuntimeRun).not.toHaveBeenCalled();
  });

  it("recognizes only /workspace cwd values as managed-agent compatible", () => {
    expect(isManagedAgentWorkspaceCwd("/workspace")).toBe(true);
    expect(isManagedAgentWorkspaceCwd("/workspace/project")).toBe(true);
    expect(isManagedAgentWorkspaceCwd("/tmp/workspace/project")).toBe(false);
    expect(isManagedAgentWorkspaceCwd("/workspace-other")).toBe(false);
  });
});
