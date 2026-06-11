import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { createAgentBackendMock } = vi.hoisted(() => ({
  createAgentBackendMock: vi.fn(() => ({ factory: { kind: "backend" } })),
}));

const { localAgentRuntimeRunMock } = vi.hoisted(() => ({
  localAgentRuntimeRunMock: vi.fn(async function* () {
    yield {
      type: "done" as const,
      reason: "completed" as const,
      exitCode: 0,
    };
  }),
}));

vi.mock("./backends/index.js", () => ({
  createAgentBackend: createAgentBackendMock,
}));

import { createLocalStore } from "../local/store.js";
import { createLocalUserClient } from "../local/user-client.js";
import { AIMC_SYSTEM_PROMPT } from "./prompts/aimc-main.js";
import { createAgentRunService } from "./runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createAgentRunService", () => {
  it("prepends saved session messages and avoids duplicating the current user prompt", async () => {
    let capturedInput: unknown;
    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn((input: unknown) => {
        capturedInput = input;
        return (async function* () {})();
      }),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [
        {
          id: "m1",
          role: "user",
          content: "请为寿司品牌做一组极简 Logo 探索。",
          contentBlocks: null,
          createdAt: "2026-06-03T13:59:35.171Z",
          toolActivities: null,
        },
        {
          id: "m2",
          role: "assistant",
          content: "好的，我会先为您呈现初步的设计方案。",
          contentBlocks: null,
          createdAt: "2026-06-03T13:59:41.885Z",
          toolActivities: null,
        },
        {
          id: "m3",
          role: "user",
          content: "继续",
          contentBlocks: null,
          createdAt: "2026-06-03T14:01:29.811Z",
          toolActivities: null,
        },
      ],
    });

    const run = runs.createRun({
      canvasId: "canvas-1",
      conversationId: "canvas-1",
      prompt: "继续",
      sessionId: "session-1",
    });

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the agent invocation.
    }

    expect(capturedInput).toMatchObject({
      messages: [
        { content: "请为寿司品牌做一组极简 Logo 探索。" },
        { content: "好的，我会先为您呈现初步的设计方案。" },
        { content: "继续" },
      ],
    });
  });

  it("uses saved session messages when a local thread id is present without persistence", async () => {
    let capturedInput: unknown;
    let capturedConfig: unknown;
    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn((input: unknown, config: unknown) => {
        capturedInput = input;
        capturedConfig = config;
        return (async function* () {})();
      }),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [
        {
          id: "m1",
          role: "user",
          content: "上一句",
          contentBlocks: null,
          createdAt: "2026-06-03T13:59:35.171Z",
          toolActivities: null,
        },
      ],
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        connectionId: "conn-1",
        threadId: "thread:session-1",
        userId: "user-1",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "run.failed")).toBe(false);
    expect(capturedInput).toMatchObject({
      messages: [{ content: "上一句" }, { content: "继续" }],
    });
    expect(capturedConfig).toMatchObject({
      configurable: {
        canvas_id: "canvas-1",
        connection_id: "conn-1",
        user_id: "user-1",
      },
    });
  });

  it("prefers an explicit server runtime kind over codex model prefix inference", async () => {
    localAgentRuntimeRunMock.mockClear();

    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-server",
            timestamp: "2026-06-04T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "server-deepagent",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the agent invocation.
    }

    expect(agentFactory).toHaveBeenCalled();
    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
  });

  it("persists explicit local runtime kind when Codex is requested", async () => {
    localAgentRuntimeRunMock.mockClear();
    const updateRun = vi.fn();

    const runs = createAgentRunService({
      agentRunStore: {
        createRun: vi.fn(),
        updateRun,
      },
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    expect(run).toMatchObject({
      runtimeKind: "local-agent",
      runtimeProvider: "codex",
    });

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localAgentRuntimeRunMock).toHaveBeenCalled();
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: run.runId,
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
        status: "running",
      }),
    );
  });

  it("resolves local CLI default overrides before invoking the host adapter", async () => {
    localAgentRuntimeRunMock.mockClear();
    const localAgentRuntimeDetectMock = vi.fn(async () => [
      {
        provider: "codex" as const,
        displayName: "Codex",
        result: {
          supported: true as const,
          models: [
            { id: "default", label: "Default (CLI config)" },
            { id: "gpt-5.5", label: "gpt-5.5" },
          ],
        },
      },
    ]);

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        detect: localAgentRuntimeDetectMock,
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:default",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localAgentRuntimeDetectMock).toHaveBeenCalled();
    expect(localAgentRuntimeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        provider: "codex",
      }),
    );
  });

  it("passes non-Codex local-agent providers through the host adapter", async () => {
    const localRun = vi.fn(async function* (params) {
      yield {
        type: "text_delta" as const,
        text: `${params.provider}:${params.runtimeProvider}`,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      localAgentProviderPlugins: [
        {
          id: "claude",
          displayName: "Claude Code",
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
        },
      ],
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "sonnet",
        runtimeKind: "local-agent",
        runtimeProvider: "claude",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        runtimeProvider: "claude",
        model: "sonnet",
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.delta",
          delta: "claude:claude",
        }),
      ]),
    );
  });

  it("strips the local provider prefix before invoking generic ACP providers", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      localAgentProviderPlugins: [
        {
          id: "hermes",
          displayName: "Hermes",
          kind: "local-agent",
          async detect() {
            return null;
          },
          capabilities() {
            return {
              cancel: true,
              nativeResume: false,
              streaming: true,
              toolGateway: false,
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
        },
      ],
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "hermes:openai-codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "hermes",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "hermes",
        runtimeProvider: "hermes",
        model: "openai-codex:gpt-5.4",
      }),
    );
  });

  it("resolves resume mode and passes provider-local resume into the local runtime", async () => {
    const createRun = vi.fn();
    const updateRun = vi.fn();
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
        sessionId: "provider-session-next",
        resumeToken: "resume-token-next",
      };
    });

    const runs = createAgentRunService({
      agentRunStore: {
        createRun,
        getRun: vi.fn(() => ({
          id: "run-previous",
          provider_session_id: "provider-session-prev",
          resume_token: "resume-token-prev",
          runtime_kind: "local-agent",
          runtime_provider: "codex",
          session_id: "session-1",
          status: "completed",
        })),
        updateRun,
      },
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        resumeFromRunId: "run-previous",
        resumeMode: "auto",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    expect(run.resumeMode).toBe("provider-local");
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRunId: "run-previous",
        resumeMode: "provider-local",
      }),
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resume: {
          mode: "provider",
          providerSessionId: "provider-session-prev",
          resumeToken: "resume-token-prev",
        },
      }),
    );
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSessionId: "provider-session-next",
        resumeToken: "resume-token-next",
        runId: run.runId,
      }),
    );
  });

  it("turns cross-provider resume into a handoff without provider-native resume", async () => {
    const createRun = vi.fn();
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      agentRunStore: {
        createRun,
        getRun: vi.fn(() => ({
          id: "run-previous",
          runtime_kind: "local-agent",
          runtime_provider: "claude",
          session_id: "session-1",
          status: "completed",
        })),
        updateRun: vi.fn(),
      },
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        resumeFromRunId: "run-previous",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    expect(run.resumeMode).toBe("handoff");
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRunId: "run-previous",
        resumeMode: "handoff",
      }),
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Resume handoff context:"),
        resume: {
          mode: "fresh",
        },
      }),
    );
  });

  it("passes the AIMC system prompt to local-agent providers", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: AIMC_SYSTEM_PROMPT,
      }),
    );
  });

  it("passes enabled local workspace skills to local-agent providers", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-runtime-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Runtime Skills" });
    let capturedPrompt = "";
    const localRun = vi.fn(async function* (input: {
      cwd: string;
      prompt: string;
    }) {
      capturedPrompt = input.prompt;
      expect(
        readFileSync(
          join(input.cwd, "workspace-skills", "canvas-director", "SKILL.md"),
          "utf8",
        ),
      ).toContain("Inspect the real element bounds");
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      createUserClient: () => createLocalUserClient(store),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: project.primaryCanvas.id,
        conversationId: project.primaryCanvas.id,
        mentions: [
          {
            id: "skill-system-canvas-director",
            label: "Canvas Director",
            mentionType: "skill",
            slug: "canvas-director",
          },
        ],
        prompt: "有看到 Canvas Director 这一个 skill 吗",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        skillManifest: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Inspect the real element bounds"),
            skillId: "canvas-director",
            slug: "canvas-director",
          }),
        ]),
      }),
    );
    expect(capturedPrompt).toContain(
      "workspace-skills/canvas-director/SKILL.md",
    );
    expect(capturedPrompt).not.toContain(
      "/workspace-skills/canvas-director/SKILL.md",
    );
  });

  it("passes enabled workspace skills into the Agnes server backend", async () => {
    createAgentBackendMock.mockClear();
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-runtime-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Agnes Skills" });

    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-agnes-skills",
            timestamp: "2026-06-11T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      createUserClient: () => createLocalUserClient(store),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    const run = runs.createRun(
      {
        canvasId: project.primaryCanvas.id,
        conversationId: project.primaryCanvas.id,
        mentions: [
          {
            id: "skill-system-canvas-director",
            label: "Canvas Director",
            mentionType: "skill",
            slug: "canvas-director",
          },
        ],
        prompt: "使用 Canvas Director 这个 skill 看一下画布",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "agnes:agnes-2.0-flash",
        runtimeKind: "server-deepagent",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the server backend.
    }

    expect(agentFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceSkills: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Inspect the real element bounds"),
            name: "canvas-director",
            path: "/workspace-skills/canvas-director/SKILL.md",
          }),
        ]),
      }),
    );
    expect(createAgentBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
      }),
      project.primaryCanvas.id,
      {
        workspaceSkills: expect.arrayContaining([
          expect.objectContaining({
            name: "canvas-director",
          }),
        ]),
      },
    );
  });

  it("maps local-agent tool results into stream events with media artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_call" as const,
        id: "tool-1",
        name: "generate_image",
        input: { prompt: "poster" },
      };
      yield {
        type: "tool_result" as const,
        id: "tool-1",
        name: "generate_image",
        output: {
          imageUrl: "https://example.com/image.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          title: "poster",
        },
        summary: "generated",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(localRun).toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.started",
          toolCallId: "tool-1",
          toolName: "generate_image",
        }),
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-1",
          toolName: "generate_image",
          outputSummary: "generated",
          artifacts: [
            expect.objectContaining({
              type: "image",
              url: "https://example.com/image.png",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps local-agent screenshot tool results into image artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_result" as const,
        id: "tool-screenshot",
        name: "screenshot_canvas",
        output: {
          screenshotUrl: "https://example.com/screenshot.png",
          mimeType: "image/png",
          width: 800,
          height: 600,
        },
        summary: "screenshot captured",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "截图",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-screenshot",
          toolName: "screenshot_canvas",
          artifacts: [
            expect.objectContaining({
              type: "image",
              url: "https://example.com/screenshot.png",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps local-agent persisted sandbox files into image artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_result" as const,
        id: "tool-persist-file",
        name: "persist_sandbox_file",
        output: {
          summary: "File uploaded successfully: poster.png",
          url: "https://example.com/storage/poster.png",
          path: "workspace/generated/poster.png",
          mimeType: "image/png",
          size: 12345,
        },
        summary: "File uploaded successfully: poster.png",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "保存文件",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-persist-file",
          toolName: "persist_sandbox_file",
          outputSummary: "File uploaded successfully: poster.png",
          artifacts: [
            expect.objectContaining({
              type: "image",
              url: "https://example.com/storage/poster.png",
              mimeType: "image/png",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps local-agent video tool results into stream events with video artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_call" as const,
        id: "tool-video",
        name: "generate_video",
        input: { prompt: "motion poster" },
      };
      yield {
        type: "tool_result" as const,
        id: "tool-video",
        name: "generate_video",
        output: {
          videoUrl: "https://example.com/video.mp4",
          mimeType: "video/mp4",
          width: 1280,
          height: 720,
          durationSeconds: 5,
          title: "motion poster",
        },
        summary: "video generated",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-video",
          toolName: "generate_video",
          outputSummary: "video generated",
          artifacts: [
            expect.objectContaining({
              type: "video",
              url: "https://example.com/video.mp4",
              durationSeconds: 5,
            }),
          ],
        }),
      ]),
    );
  });

  it("falls back to the server runtime when Codex is inferred but no local gateway is registered", async () => {
    localAgentRuntimeRunMock.mockClear();

    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-server-fallback",
            timestamp: "2026-06-04T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
    expect(agentFactory).toHaveBeenCalled();
    expect(events.some((event) => event.type === "run.failed")).toBe(false);
  });

  it("fails fast when local Codex is explicitly requested without a registered gateway", async () => {
    localAgentRuntimeRunMock.mockClear();

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    expect(() =>
      runs.createRun(
        {
          canvasId: "canvas-1",
          conversationId: "canvas-1",
          prompt: "继续",
          sessionId: "session-1",
        },
        {
          model: "codex:gpt-5.4",
          runtimeKind: "local-agent",
          runtimeProvider: "codex",
        },
      ),
    ).toThrow("No runtime provider registered for local-agent (codex)");

    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
  });

  it("does not register local Codex when trusted local mode is disabled", async () => {
    localAgentRuntimeRunMock.mockClear();

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        trustedLocalAgentMode: false,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    expect(() =>
      runs.createRun(
        {
          canvasId: "canvas-1",
          conversationId: "canvas-1",
          prompt: "继续",
          sessionId: "session-1",
        },
        {
          model: "codex:gpt-5.4",
          runtimeKind: "local-agent",
          runtimeProvider: "codex",
        },
      ),
    ).toThrow("No runtime provider registered for local-agent (codex)");

    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
  });
});
