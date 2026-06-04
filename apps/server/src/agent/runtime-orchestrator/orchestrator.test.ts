import { describe, expect, it } from "vitest";

import { createAgentRunOrchestrator } from "./orchestrator.js";

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
});
