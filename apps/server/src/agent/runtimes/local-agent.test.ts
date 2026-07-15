import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRuntimeProvider } from "@aimc/shared";
import type { LocalAgentProviderPlugin } from "@tutti-os/agent-acp-kit";

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
      agentTargetId:
        overrides.agentTargetId ??
        `local:${overrides.runtimeProvider ?? "codex"}`,
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

function writeFakeTuttiSkillCli(path: string) {
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      'case "$*" in',
      '  *"agent list"*)',
      "cat <<'JSON'",
      JSON.stringify({
        schemaVersion: 1,
        defaultAgentTargetId: "local:codex",
        agents: [
          {
            id: "local:codex",
            provider: "codex",
            name: "Canvas Agent",
            availability: {
              status: "available",
              reasonCode: "ready",
              detail: "Ready",
            },
            runtimeSupported: true,
          },
        ],
      }),
      "JSON",
      "exit 0",
      ";;",
      '  *"agent composer-options"*)',
      "cat <<'JSON'",
      JSON.stringify({
        schemaVersion: 2,
        agentTargetId: "local:codex",
        providerId: "codex",
        effectiveSettings: {
          model: "gpt-composer",
          reasoningEffort: "high",
          permissionMode: "workspace-write",
        },
        modelConfig: {
          configurable: true,
          currentValue: "gpt-composer",
          defaultValue: "gpt-composer",
          options: [
            { id: "gpt-composer", value: "gpt-composer", label: "Composer" },
          ],
        },
        reasoningConfig: {
          configurable: true,
          currentValue: "high",
          defaultValue: "high",
          options: [{ id: "high", value: "high", label: "High" }],
        },
        permissionConfig: {
          configurable: true,
          defaultValue: "workspace-write",
          modes: [
            {
              id: "workspace-write",
              label: "Workspace Write",
              semantic: "accept-edits",
            },
          ],
        },
        speedConfig: {
          configurable: false,
          currentValue: "",
          defaultValue: "",
          options: [],
        },
      }),
      "JSON",
      "exit 0",
      ";;",
      "esac",
      "cat <<'JSON'",
      JSON.stringify({
        schemaVersion: 1,
        agentTargetId: "local:codex",
        providerId: "codex",
        provider: "codex",
        agentSessionId: "run-1",
        recommendedSystemPrompt: {
          content: "Use the mentioned Tutti app when relevant.",
        },
        skills: [
          {
            skillId: "workspace-app",
            slug: "workspace-app",
            deliveryMode: "prompt-injection",
            content: "Call the mentioned workspace app through Tutti CLI.",
          },
        ],
      }),
      "JSON",
    ].join("\n"),
    "utf8",
  );
  chmodSync(path, 0o755);
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

      expect(result).toBe(
        join(tempRoot, "app-data", ".aimc-agent-runs", "codex-run-1"),
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("passes the VM-local run directory and packaged MCP to the SDK", async () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");
    vi.stubEnv("CODEX_HOME", "/tmp/user-codex-home");
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-vm-local-run-"));
    const runDir = join(tempRoot, "run");
    const createRunDirectory = vi.fn(async () => runDir);
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const context = createRuntimeContext();
    context.runtimeEnv = {
      ...context.runtimeEnv,
      appDataDir: tempRoot,
    };
    const revokeSession = vi.fn();
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
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

    expect(createRunDirectory).toHaveBeenCalledWith({
      runId: "run-1",
      runtimeProvider: "codex",
    });
    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params?.cwd).toBe(runDir);
    expect(params).toMatchObject({
      mcpServers: [
        {
          name: "aimc",
          type: "stdio",
          command: "node",
          args: ["/package/server/tools-mcp.js"],
          env: {
            AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:3001/api/local-tools",
            AIMC_TOOL_TOKEN: "tool-token",
          },
        },
      ],
    });
    expect(params).not.toHaveProperty("managedAgentInvocation");
    expect(params).not.toHaveProperty("env");
    expectOrdinaryEnvOmitsToolToken(params?.env);
    expect(revokeSession).toHaveBeenCalledWith("tool-token");
  });

  it("stops provider work when cancellation races VM-local directory creation", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-vm-local-cancel-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const runDir = join(tempRoot, "run");
    const assertLocalAgentProviderAvailable = vi.fn(async () => undefined);
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    let resolveRunDirectory: ((value: string) => void) | undefined;
    const runDirectoryPromise = new Promise<string>((resolve) => {
      resolveRunDirectory = resolve;
    });
    const createRunDirectory = vi.fn(() => runDirectoryPromise);
    const context = createRuntimeContext();
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable,
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

    try {
      const execution = collect(provider.streamRun(context));
      await vi.waitFor(() => {
        expect(createRunDirectory).toHaveBeenCalledOnce();
      });
      context.run.controller.abort();
      mkdirSync(runDir, { recursive: true });
      expect(existsSync(runDir)).toBe(true);
      resolveRunDirectory?.(runDir);

      await expect(execution).rejects.toMatchObject({ name: "AbortError" });
      expect(existsSync(runDir)).toBe(false);
      expect(assertLocalAgentProviderAvailable).not.toHaveBeenCalled();
      expect(localAgentRuntimeRun).not.toHaveBeenCalled();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses the VM-local app data directory for local-agent cwd values", async () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-vm-local-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const context = createRuntimeContext();
    context.runtimeEnv = {
      ...context.runtimeEnv,
      appDataDir: tempRoot,
    };
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
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
    expect(params?.cwd).toBe(join(tempRoot, ".aimc-agent-runs", "codex-run-1"));
    expect(params).toMatchObject({
      mcpServers: [
        expect.objectContaining({
          name: "aimc",
          type: "stdio",
          command: "node",
        }),
      ],
    });
    expect(params).not.toHaveProperty("managedAgentInvocation");
    expectOrdinaryEnvOmitsToolToken(params?.env);
  });

  it("lets the kit consume the VM CODEX_HOME without app overrides", async () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");
    vi.stubEnv("CODEX_HOME", "/tmp/user-codex-home");
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const context = createRuntimeContext();
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-vm-local-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    context.runtimeEnv = {
      ...context.runtimeEnv,
      appDataDir: tempRoot,
      codexImagegenCodexHome: join(tempRoot, ".codex-home"),
    };
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
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
    expect(params?.cwd).toBe(join(tempRoot, ".aimc-agent-runs", "codex-run-1"));
    expect(params).not.toHaveProperty("managedAgentInvocation");
    expect(params).not.toHaveProperty("env");
    expect(JSON.stringify(params ?? {})).not.toContain("CODEX_HOME");
    expect(JSON.stringify(params ?? {})).not.toContain(
      join(tempRoot, ".codex-home"),
    );
    expect(params).toMatchObject({
      mcpServers: [
        expect.objectContaining({
          name: "aimc",
          type: "stdio",
        }),
      ],
    });
    expectOrdinaryEnvOmitsToolToken(params?.env);
  });

  it("uses the development MCP entrypoint when no packaged path is set", async () => {
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const revokeSession = vi.fn();
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-vm-local-run-"));
    vi.stubEnv("TUTTI_APP_DATA_DIR", tempRoot);
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
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

    const context = createRuntimeContext();
    context.runtimeEnv = { ...context.runtimeEnv, appDataDir: tempRoot };
    await collect(provider.streamRun(context));

    expect(localAgentRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [
          expect.objectContaining({ command: "pnpm", name: "aimc" }),
        ],
      }),
    );
    expect(revokeSession).toHaveBeenCalledWith("tool-token");
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("keeps VM-local agent runs on the app-owned cwd without injected env", async () => {
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
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
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

  it("merges Tutti CLI skill context into local-agent runs", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-tutti-skill-context-"));
    const tuttiCliPath = join(tempRoot, "tutti");
    writeFakeTuttiSkillCli(tuttiCliPath);
    vi.stubEnv("TUTTI_CLI", tuttiCliPath);

    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const runDir = join(tempRoot, "run");
    mkdirSync(runDir, { recursive: true });
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        createRunDirectory: vi.fn(async () => runDir),
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
      const context = createRuntimeContext({
        prompt: "Open mention://workspace-app/aimc",
      });
      context.run.agentTargetId = "local:codex";
      context.runtimeEnv = {
        ...context.runtimeEnv,
        tuttiCliPath,
      };
      await collect(provider.streamRun(context));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty("env");
    expect(params?.systemPrompt).toContain(
      "Additional Tutti CLI skill guidance:",
    );
    expect(params?.systemPrompt).toContain(
      "Use the mentioned Tutti app when relevant.",
    );
    expect(params?.skillManifest).toContainEqual(
      expect.objectContaining({
        skillId: "workspace-app",
        slug: "workspace-app",
        deliveryMode: "prompt-injection",
      }),
    );
  });

  it("does not merge Tutti CLI skill context for plain canvas prompts", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-tutti-skill-context-"));
    const tuttiCliPath = join(tempRoot, "tutti");
    writeFakeTuttiSkillCli(tuttiCliPath);

    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const runDir = join(tempRoot, "run");
    mkdirSync(runDir, { recursive: true });
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        createRunDirectory: vi.fn(async () => runDir),
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
      const context = createRuntimeContext({
        prompt: "Illustrate a dreamy seaside adventure",
      });
      context.runtimeEnv = {
        ...context.runtimeEnv,
        tuttiCliPath,
      };
      await collect(provider.streamRun(context));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    const params = localAgentRuntimeRun.mock.calls[0]?.[0];
    expect(params?.systemPrompt).not.toContain(
      "Additional Tutti CLI skill guidance:",
    );
    expect(params?.systemPrompt).not.toContain(
      "Use the mentioned Tutti app when relevant.",
    );
    expect(params?.skillManifest).not.toContainEqual(
      expect.objectContaining({
        skillId: "workspace-app",
      }),
    );
  });

  it("applies exact-target composer settings to a custom execution runtime", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-tutti-composer-"));
    const tuttiCliPath = join(tempRoot, "tutti");
    writeFakeTuttiSkillCli(tuttiCliPath);
    vi.stubEnv("TUTTI_CLI", tuttiCliPath);
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const composerRuntime = {
      cancel: vi.fn(async () => undefined),
      detect: vi.fn(async () => []),
      listProviders: () => [
        {
          id: "codex" as const,
          displayName: "Codex",
          kind: "local-agent" as const,
        },
      ],
      run: vi.fn(async function* () {
        yield* [];
      }),
    };
    const runDir = join(tempRoot, "run");
    mkdirSync(runDir, { recursive: true });
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
        buildAttachmentDataMap: vi.fn(() => ({})),
        buildUserMessage: vi.fn((prompt) => ({ text: prompt })),
        createRunDirectory: vi.fn(async () => runDir),
        loadCanvasSummaryForRuntime: vi.fn(async () => null),
        localAgentComposerRuntime: composerRuntime,
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
      await collect(provider.streamRun(createRuntimeContext()));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(localAgentRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-composer",
        reasoning: "high",
        permission: {
          modeId: "workspace-write",
          semantic: "accept-edits",
        },
      }),
    );
    expect(composerRuntime.detect).not.toHaveBeenCalled();
  });

  it("rejects a provider omitted by the fresh Tutti catalog and removes its run directory", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "aimc-unavailable-agent-"));
    const runDir = join(
      tempRoot,
      "app-data",
      ".aimc-agent-runs",
      "tutti-agent-run-1",
    );
    const assertLocalAgentProviderAvailable = vi.fn(async () => {
      throw new Error(
        "Agent provider tutti-agent is not available from Tutti.",
      );
    });
    const localAgentRuntimeRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        status: "completed" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });
    const provider = createLocalAgentRuntimeProvider(
      {
        assertLocalAgentProviderAvailable,
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
      createProviderPlugin("tutti-agent"),
    );

    try {
      const context = createRuntimeContext({
        runtimeProvider: "tutti-agent",
      });
      context.runtimeEnv = {
        ...context.runtimeEnv,
        appDataDir: join(tempRoot, "app-data"),
      };
      await expect(collect(provider.streamRun(context))).rejects.toThrow(
        "not available from Tutti",
      );
      expect(assertLocalAgentProviderAvailable).toHaveBeenCalledWith({
        provider: "tutti-agent",
        detectContext: { cwd: runDir, refresh: true },
      });
      expect(localAgentRuntimeRun).not.toHaveBeenCalled();
      expect(existsSync(runDir)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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
        assertLocalAgentProviderAvailable: vi.fn(async () => undefined),
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
