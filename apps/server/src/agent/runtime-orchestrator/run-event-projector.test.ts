import { describe, expect, it } from "vitest";

import {
  createAssistantMessageProjection,
  projectStreamEventToAssistantMessage,
} from "./run-event-projector.js";

describe("run event projector", () => {
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
});
