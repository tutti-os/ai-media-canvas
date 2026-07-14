import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createServerDeepAgentRuntimeProvider } from "./server-deepagent.js";
import type { RuntimeExecutionContext } from "./types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function createTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "aimc-server-tutti-skill-"));
  tempDirs.push(tempRoot);
  return tempRoot;
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
        defaultAgentTargetId: "team:designer",
        agents: [
          {
            id: "team:designer",
            provider: "codex",
            name: "Designer",
            availability: { status: "available" },
          },
        ],
      }),
      "JSON",
      "    ;;",
      "  *)",
      "cat <<'JSON'",
      JSON.stringify({
        schemaVersion: 2,
        agentTargetId: "team:designer",
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
      "    ;;",
      "esac",
    ].join("\n"),
    "utf8",
  );
  chmodSync(path, 0o755);
}

function createRuntimeContext(
  overrides: Partial<RuntimeExecutionContext["run"]> = {},
  runtimeEnvOverrides: Partial<RuntimeExecutionContext["runtimeEnv"]> = {},
): RuntimeExecutionContext {
  const sandboxDir = join(createTempRoot(), "sandbox");
  mkdirSync(sandboxDir, { recursive: true });

  return {
    backendResult: {
      factory: { kind: "backend" },
      sandboxDir,
    } as never,
    brandKitId: null,
    resolvedModel: "openai:gpt-4.1",
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
      agentModel: "openai:gpt-4.1",
      openAIApiKey: "openai-test-key",
      port: 3001,
      version: "0.0.0",
      webOrigin: "http://localhost:3000",
      ...runtimeEnvOverrides,
    },
    workspaceSkills: [],
  };
}

function createProviderDeps() {
  const agent = {
    stream: vi.fn(),
    streamEvents: vi.fn(() =>
      (async function* () {
        yield { type: "raw" };
      })(),
    ),
  };
  const resolvedAgentFactory = vi.fn(() => agent);

  return {
    agent,
    deps: {
      adaptDeepAgentStream: vi.fn(async function* () {
        yield {
          type: "run.completed",
          conversationId: "canvas-1",
          runId: "run-1",
          sessionId: "session-1",
          timestamp: "2026-06-17T00:00:00.000Z",
        } as never;
      }),
      buildAttachmentDataMap: vi.fn(() => ({})),
      buildSessionHistoryMessages: vi.fn(async () => []),
      buildUserMessage: vi.fn((prompt: string) => ({ text: prompt })),
      loadCanvasSummaryForRuntime: vi.fn(async () => null),
      now: () => "2026-06-17T00:00:00.000Z",
      resolvedAgentFactory,
    },
    resolvedAgentFactory,
  };
}

async function collect<T>(stream: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe("createServerDeepAgentRuntimeProvider", () => {
  it("injects Tutti CLI skill guidance for mentioned server-deepagent prompts", async () => {
    const tempRoot = createTempRoot();
    const tuttiCliPath = join(tempRoot, "tutti");
    writeFakeTuttiSkillCli(tuttiCliPath);
    vi.stubEnv("TUTTI_CLI", tuttiCliPath);
    const { deps, resolvedAgentFactory } = createProviderDeps();
    const provider = createServerDeepAgentRuntimeProvider(deps);

    await collect(
      provider.streamRun(
        createRuntimeContext(
          { prompt: "Open mention://workspace-app/aimc" },
          { tuttiCliPath },
        ),
      ),
    );

    expect(resolvedAgentFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        extraSystemPrompt: expect.stringContaining(
          "Additional Tutti CLI skill guidance:",
        ),
      }),
    );
    expect(resolvedAgentFactory.mock.calls[0]?.[0].extraSystemPrompt).toContain(
      "Use the mentioned Tutti app when relevant.",
    );
  });

  it("does not inject Tutti CLI skill guidance without TUTTI_CLI", async () => {
    vi.stubEnv("TUTTI_CLI", "");
    const { deps, resolvedAgentFactory } = createProviderDeps();
    const provider = createServerDeepAgentRuntimeProvider(deps);

    await collect(
      provider.streamRun(
        createRuntimeContext({
          prompt: "Open mention://workspace-app/aimc",
        }),
      ),
    );

    expect(resolvedAgentFactory.mock.calls[0]?.[0]).not.toHaveProperty(
      "extraSystemPrompt",
    );
  });

  it("does not load Tutti CLI skill guidance for plain prompts", async () => {
    const tempRoot = createTempRoot();
    const tuttiCliPath = join(tempRoot, "tutti");
    writeFakeTuttiSkillCli(tuttiCliPath);
    const { deps, resolvedAgentFactory } = createProviderDeps();
    const provider = createServerDeepAgentRuntimeProvider(deps);

    await collect(
      provider.streamRun(
        createRuntimeContext(
          { prompt: "Illustrate a dreamy seaside adventure" },
          { tuttiCliPath },
        ),
      ),
    );

    expect(resolvedAgentFactory.mock.calls[0]?.[0]).not.toHaveProperty(
      "extraSystemPrompt",
    );
  });
});
