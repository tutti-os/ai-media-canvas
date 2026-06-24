import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRuntimeProvider } from "@aimc/shared";
import { type LocalAgentProviderPlugin } from "@tutti-os/agent-acp-kit";

import {
  createLocalAgentRunDirectory,
  createLocalAgentRuntimeProvider,
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

function expectOrdinaryEnvOmitsToolToken(env?: Record<string, string>) {
  expect(env ?? {}).not.toHaveProperty("AIMC_TOOL_TOKEN");
  expect(JSON.stringify(env ?? {})).not.toContain("tool-token");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createLocalAgentRuntimeProvider", () => {
  it("uses app data for regular local-agent run directories", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-local-agent-runs-"));
    try {
      const result = await createLocalAgentRunDirectory({
        appDataDir: join(tempRoot, "app-data"),
        runId: "run-1",
        runtimeProvider: "codex",
      });

      expect(result).toEqual({
        runDir: join(tempRoot, "app-data", ".aimc-agent-runs", "codex-run-1"),
        useManagedAgentInvocation: false,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("passes managed agent invocation only to the SDK run input", async () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const createRunDirectory = vi.fn();
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-managed-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const context = createRuntimeContext({
      managedAgentInvocationCredential: "credential-run-1",
    });
    context.runtimeEnv = {
      ...context.runtimeEnv,
      appDataDir: tempRoot,
    };
    const revokeSession = vi.fn();
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
          revokeSession,
        } as never,
        toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
      },
      createProviderPlugin("codex"),
    );

    try {
      await collect(provider.streamRun(context));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(createRunDirectory).not.toHaveBeenCalled();
    expect(JSON.stringify(createRunDirectory.mock.calls)).not.toContain(
      "credential-run-1",
    );
    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params?.cwd).toContain(join(tempRoot, ".agent-runs", "codex-"));
    expect(params).toMatchObject({
      managedAgentInvocation: {
        credential: "credential-run-1",
        cwd: params?.cwd,
      },
      mcpServers: [
        {
          name: "aimc",
          type: "stdio",
          executionSide: "vm",
          command: "node",
          args: ["/package/server/tools-mcp.js"],
          env: {
            AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:3001/api/local-tools",
            AIMC_TOOL_TOKEN: "tool-token",
          },
        },
      ],
    });
    expect(params).not.toHaveProperty("env");
    expectOrdinaryEnvOmitsToolToken(params?.env);
    expect(context.run.managedAgentInvocationCredential).toBeUndefined();
    expect(revokeSession).toHaveBeenCalledWith("tool-token");
  });

  it("uses managed agent invocation for app data cwd values", async () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-managed-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const context = createRuntimeContext({
      managedAgentInvocationCredential: "credential-run-1",
    });
    context.runtimeEnv = {
      ...context.runtimeEnv,
      appDataDir: tempRoot,
    };
    const provider = createLocalAgentRuntimeProvider(
      {
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
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

    try {
      await collect(provider.streamRun(context));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params?.cwd).toContain(join(tempRoot, ".agent-runs", "codex-"));
    expect(params).toMatchObject({
      managedAgentInvocation: {
        credential: "credential-run-1",
        cwd: params?.cwd,
      },
      mcpServers: [
        expect.objectContaining({
          name: "aimc",
          type: "stdio",
          command: "node",
        }),
      ],
    });
    expectOrdinaryEnvOmitsToolToken(params?.env);
  });

  it("lets the kit manage CODEX_HOME for managed codex SDK runs", async () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const context = createRuntimeContext({
      managedAgentInvocationCredential: "credential-run-1",
    });
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-managed-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    context.runtimeEnv = {
      ...context.runtimeEnv,
      appDataDir: tempRoot,
      codexImagegenCodexHome: join(tempRoot, ".codex-home"),
    };
    const provider = createLocalAgentRuntimeProvider(
      {
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
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

    try {
      await collect(provider.streamRun(context));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params?.cwd).toContain(join(tempRoot, ".agent-runs", "codex-"));
    expect(params).toMatchObject({
      managedAgentInvocation: {
        credential: "credential-run-1",
        cwd: params?.cwd,
      },
    });
    expect(params).not.toHaveProperty("env");
    expect(JSON.stringify(params ?? {})).not.toContain("CODEX_HOME");
    expect(JSON.stringify(params ?? {})).not.toContain(
      join(tempRoot, ".codex-home"),
    );
    expect(JSON.stringify(params?.mcpServers ?? [])).not.toContain(
      "credential-run-1",
    );
    expect(params).toMatchObject({
      mcpServers: [
        expect.objectContaining({
          name: "aimc",
          type: "stdio",
          executionSide: "vm",
        }),
      ],
    });
    expectOrdinaryEnvOmitsToolToken(params?.env);
  });

  it("rejects managed agent invocation without a packaged MCP entrypoint", async () => {
    const localAgentRuntimeRun = vi.fn();
    const revokeSession = vi.fn();
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-managed-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const provider = createLocalAgentRuntimeProvider(
      {
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        loadCanvasSummaryForRuntime: vi.fn(async () => null),
        localAgentRuntime: { run: localAgentRuntimeRun },
        now: () => "2026-06-17T00:00:00.000Z",
        toolGateway: {
          createSession: vi.fn(() => ({ token: "tool-token" })),
          revokeSession,
        } as never,
        toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
      },
      createProviderPlugin("codex"),
    );

    await expect(
      collect(
        provider.streamRun(
          (() => {
            const context = createRuntimeContext({
              managedAgentInvocationCredential: "credential-run-1",
            });
            context.runtimeEnv = {
              ...context.runtimeEnv,
              appDataDir: tempRoot,
            };
            return context;
          })(),
        ),
      ),
    ).rejects.toThrow(
      "AIMC_TOOLS_MCP_PATH is required for managed local-agent MCP VM execution.",
    );

    expect(localAgentRuntimeRun).not.toHaveBeenCalled();
    expect(revokeSession).toHaveBeenCalledWith("tool-token");
    rmSync(tempRoot, { recursive: true, force: true });
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

  it("revokes tool gateway token when local-agent run fails", async () => {
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "status" as const,
        status: "running" as const,
      };
      throw new Error("local-agent-boom");
    });
    const revokeSession = vi.fn();
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
          revokeSession,
        } as never,
        toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
      },
      createProviderPlugin("codex"),
    );

    await expect(
      collect(provider.streamRun(createRuntimeContext())),
    ).rejects.toThrow("local-agent-boom");

    expect(revokeSession).toHaveBeenCalledWith("tool-token");
  });

});
