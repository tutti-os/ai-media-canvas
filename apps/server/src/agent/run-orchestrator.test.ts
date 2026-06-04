import { describe, expect, it } from "vitest";

import {
  createAgentRunOrchestrator,
  createAssistantMessageProjection,
  createRuntimeControlPlane,
  inferAimcRuntimeTarget,
  inferRuntimeKind,
  projectStreamEventToAssistantMessage,
  resolveResumeMode,
} from "./run-orchestrator.js";

function createRuntimeProvider(
  runtime: {
    id: string;
    kind: "server-deepagent" | "local-agent";
    provider?: "codex";
    mode: "server" | "local";
    status?: "online" | "offline" | "degraded";
    maxConcurrentRuns?: number;
  },
) {
  return {
    runtime: {
      capabilities: {
        cancel: true,
        nativeResume: runtime.kind === "local-agent",
        streaming: true,
        toolGateway: runtime.kind === "local-agent",
        maxConcurrentRuns: runtime.maxConcurrentRuns ?? 1,
      },
      lastSeenAt: "2026-06-04T00:00:00.000Z",
      status: runtime.status ?? "online",
      ...runtime,
    },
    async *streamRun() {
      yield {
        type: "run.completed" as const,
        runId: "run-1",
        timestamp: "2026-06-04T00:00:00.000Z",
      };
    },
  };
}

describe("agent run orchestrator", () => {
  it("records run state, persists stream events, and projects assistant state", () => {
    const persisted: Array<{ type: string; runId: string; canvasId?: string }> = [];
    const runStoreCalls: Array<Record<string, unknown>> = [];
    const orchestrator = createAgentRunOrchestrator({
      eventPersistence: {
        appendEvent(input) {
          persisted.push({
            type: input.event.type,
            runId: input.runId,
            ...(input.canvasId ? { canvasId: input.canvasId } : {}),
          });
          return {
            eventId: `${input.runId}:${persisted.length}`,
            seq: persisted.length,
            canvasSeq: 40 + persisted.length,
          };
        },
      },
      runStore: {
        createRun(input) {
          runStoreCalls.push({ action: "create", ...input });
        },
        updateRun(input) {
          runStoreCalls.push({ action: "update", ...input });
        },
      },
    });
    const projection = orchestrator.createAssistantProjection();
    const event = {
      type: "tool.completed" as const,
      runId: "run_1",
      toolCallId: "tool_1",
      toolName: "generate_image",
      output: { imageUrl: "https://example.com/a.png" },
      artifacts: [
        {
          type: "image" as const,
          url: "https://example.com/a.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
        },
      ],
      timestamp: "2026-06-04T00:00:00.000Z",
    };

    const envelope = orchestrator.persistAndEnvelope({
      canvasId: "canvas_1",
      event,
      runId: "run_1",
    });
    orchestrator.projectEvent(projection, event);
    orchestrator.recordAcceptedRun({
      assistantMessageId: "msg_1",
      canvasId: "canvas_1",
      model: "codex:gpt-5.4",
      runtimeKind: "local-agent",
      runtimeProvider: "codex",
      runId: "run_1",
      sessionId: "session_1",
    });
    orchestrator.updateRunStatus({
      runId: "run_1",
      status: "completed",
    });

    expect(envelope).toEqual({ eventId: "run_1:1", seq: 41 });
    expect(persisted).toEqual([
      { canvasId: "canvas_1", runId: "run_1", type: "tool.completed" },
    ]);
    expect(projection.blocks).toEqual([
      {
        type: "tool",
        toolCallId: "tool_1",
        toolName: "generate_image",
        status: "completed",
        output: { imageUrl: "https://example.com/a.png" },
        artifacts: [
          {
            type: "image",
            url: "https://example.com/a.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
      },
    ]);
    expect(runStoreCalls).toEqual([
      {
        action: "create",
        assistantMessageId: "msg_1",
        canvasId: "canvas_1",
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
        runId: "run_1",
        sessionId: "session_1",
      },
      {
        action: "update",
        runId: "run_1",
        status: "completed",
      },
    ]);
  });

  it("projects text and media tool events into assistant message blocks", () => {
    const projection = createAssistantMessageProjection();

    projectStreamEventToAssistantMessage(projection, {
      type: "message.delta",
      runId: "run_1",
      messageId: "msg_1",
      delta: "hello",
      timestamp: "2026-06-04T00:00:00.000Z",
    });
    projectStreamEventToAssistantMessage(projection, {
      type: "tool.started",
      runId: "run_1",
      toolCallId: "tool_1",
      toolName: "generate_image",
      input: { prompt: "poster" },
      timestamp: "2026-06-04T00:00:01.000Z",
    });
    projectStreamEventToAssistantMessage(projection, {
      type: "tool.completed",
      runId: "run_1",
      toolCallId: "tool_1",
      toolName: "generate_image",
      output: { imageUrl: "https://example.com/a.png" },
      artifacts: [
        {
          type: "image",
          url: "https://example.com/a.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
        },
      ],
      timestamp: "2026-06-04T00:00:02.000Z",
    });

    expect(projection.textParts.join("")).toBe("hello");
    expect(projection.blocks).toEqual([
      { type: "text", text: "hello" },
      {
        type: "tool",
        toolCallId: "tool_1",
        toolName: "generate_image",
        status: "completed",
        input: { prompt: "poster" },
        output: { imageUrl: "https://example.com/a.png" },
        artifacts: [
          {
            type: "image",
            url: "https://example.com/a.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
      },
    ]);
  });

  it("resolves provider-local and handoff resume modes", () => {
    expect(
      resolveResumeMode({
        previousRuntimeKind: "local-agent",
        previousRuntimeProvider: "codex",
        nextRuntimeKind: "local-agent",
        nextRuntimeProvider: "codex",
      }),
    ).toBe("provider-local");

    expect(
      resolveResumeMode({
        previousRuntimeKind: "local-agent",
        previousRuntimeProvider: "codex",
        nextRuntimeKind: "server-deepagent",
      }),
    ).toBe("handoff");
  });

  it("keeps server-deepagent as the default runtime", () => {
    expect(
      inferAimcRuntimeTarget({
        availableRuntimeTargets: [
          { kind: "server-deepagent" },
          { kind: "local-agent", provider: "codex" },
        ],
        model: "gpt-4.1",
        requestedRuntimeKind: undefined,
      }),
    ).toEqual({ kind: "server-deepagent" });
  });

  it("fills the only local provider when a legacy request omits it", () => {
    expect(
      inferAimcRuntimeTarget({
        availableRuntimeTargets: [
          { kind: "server-deepagent" },
          { kind: "local-agent", provider: "codex" },
        ],
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-agent",
      }),
    ).toEqual({ kind: "local-agent", provider: "codex" });
  });

  it("defaults to the single registered runtime when no selector is provided", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "server-deepagent",
        kind: "server-deepagent",
        mode: "server",
      }),
    ]);

    expect(
      controlPlane.resolveRuntimeTarget({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: undefined,
      }),
    ).toEqual({ kind: "server-deepagent" });
  });

  it("throws when multiple runtimes are registered without a selector", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "server-deepagent",
        kind: "server-deepagent",
        mode: "server",
      }),
      createRuntimeProvider({
        id: "local-agent:codex",
        kind: "local-agent",
        mode: "local",
        provider: "codex",
      }),
    ]);

    expect(() =>
      controlPlane.resolveRuntimeTarget({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: undefined,
      }),
    ).toThrow("No runtime kind requested and no selector configured");
  });

  it("returns the requested runtime kind before applying fallback inference", () => {
    expect(
      inferRuntimeKind({
        availableRuntimeTargets: [
          { kind: "server-deepagent" },
          { kind: "local-agent", provider: "codex" },
        ],
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-agent",
        requestedRuntimeProvider: "codex",
      }),
    ).toEqual({ kind: "local-agent", provider: "codex" });
  });

  it("does not schedule offline runtimes", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "server-deepagent",
        kind: "server-deepagent",
        mode: "server",
      }),
      createRuntimeProvider({
        id: "local-agent:codex",
        kind: "local-agent",
        mode: "local",
        provider: "codex",
        status: "offline",
      }),
    ]);

    expect(controlPlane.listRuntimeTargets()).toEqual([
      { kind: "server-deepagent" },
    ]);
    expect(() =>
      controlPlane.resolveRuntimeTarget({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-agent",
        requestedRuntimeProvider: "codex",
      }),
    ).toThrow("Runtime local-agent (codex) is offline");
  });

  it("enforces runtime concurrency through leases", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "local-agent:codex",
        kind: "local-agent",
        mode: "local",
        provider: "codex",
        maxConcurrentRuns: 1,
      }),
    ]);

    const lease = controlPlane.acquireRuntimeLease(
      { kind: "local-agent", provider: "codex" },
      "run-1",
    );

    expect(() =>
      controlPlane.acquireRuntimeLease(
        { kind: "local-agent", provider: "codex" },
        "run-2",
      ),
    ).toThrow("Runtime local-agent (codex) is at capacity");

    lease.release();

    expect(() =>
      controlPlane.acquireRuntimeLease(
        { kind: "local-agent", provider: "codex" },
        "run-2",
      ),
    ).not.toThrow();
  });

  it("updates runtime health metadata", () => {
    const controlPlane = createRuntimeControlPlane(
      [
        createRuntimeProvider({
          id: "local-agent:codex",
          kind: "local-agent",
          mode: "local",
          provider: "codex",
        }),
      ],
      {
        now: () => "2026-06-04T12:34:56.000Z",
      },
    );

    const runtime = controlPlane.updateRuntimeStatus(
      { kind: "local-agent", provider: "codex" },
      "degraded",
    );

    expect(runtime.status).toBe("degraded");
    expect(runtime.lastSeenAt).toBe("2026-06-04T12:34:56.000Z");
  });
});
