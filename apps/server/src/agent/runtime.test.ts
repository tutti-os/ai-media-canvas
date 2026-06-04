import { describe, expect, it, vi } from "vitest";

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

import { createAgentRunService } from "./runtime.js";

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
