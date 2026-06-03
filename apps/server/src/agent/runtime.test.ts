import { describe, expect, it, vi } from "vitest";

const { createAgentBackendMock } = vi.hoisted(() => ({
  createAgentBackendMock: vi.fn(() => ({ factory: { kind: "backend" } })),
}));

const { streamCodexLocalRunMock } = vi.hoisted(() => ({
  streamCodexLocalRunMock: vi.fn(async function* () {
    yield {
      type: "run.completed" as const,
      runId: "run-local",
      timestamp: "2026-06-04T00:00:00.000Z",
    };
  }),
}));

vi.mock("./backends/index.js", () => ({
  createAgentBackend: createAgentBackendMock,
}));

vi.mock("./local-runtime/codex-runtime.js", () => ({
  streamCodexLocalRun: streamCodexLocalRunMock,
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
    streamCodexLocalRunMock.mockClear();

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
    expect(streamCodexLocalRunMock).not.toHaveBeenCalled();
  });
});
