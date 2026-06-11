import { describe, expect, it } from "vitest";

import { adaptDeepAgentStream } from "./deepagent-events.js";

async function* streamEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

function manipulateCanvasEnd(error: string, runId: string) {
  return {
    event: "on_tool_end",
    name: "manipulate_canvas",
    run_id: runId,
    data: {
      output: JSON.stringify({
        success: false,
        error,
        message: "layout failed",
      }),
    },
  };
}

describe("adaptDeepAgentStream", () => {
  it("stops after repeated canvas layout failures", async () => {
    const events = await Array.fromAsync(
      adaptDeepAgentStream({
        conversationId: "canvas-1",
        now: () => "2026-06-11T00:00:00.000Z",
        runId: "run-1",
        sessionId: "session-1",
        stream: streamEvents([
          manipulateCanvasEnd("layout_overlap_detected", "tool-1"),
          manipulateCanvasEnd("layout_inspection_required", "tool-2"),
          manipulateCanvasEnd("layout_overlap_detected", "tool-3"),
          {
            event: "on_chat_model_stream",
            data: { chunk: { id: "msg-1", content: "should not emit" } },
          },
        ]),
      }),
    );

    expect(events.at(-1)).toMatchObject({
      error: {
        code: "repeated_canvas_layout_failures",
      },
      type: "run.failed",
    });
    expect(
      events.some(
        (event) =>
          event.type === "message.delta" &&
          "delta" in event &&
          event.delta === "should not emit",
      ),
    ).toBe(false);
  });
});
