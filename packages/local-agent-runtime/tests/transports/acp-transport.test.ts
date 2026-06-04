import { describe, expect, it } from "vitest";

import { runAcpTransport } from "../../src/transports/acp/acp-client.js";
import { createFakeAcpPeerScript } from "../../src/testing/index.js";

describe("runAcpTransport", () => {
  it("maps ACP session updates into normalized agent events", async () => {
    const events = [];
    const script = createFakeAcpPeerScript({
      updates: [
        { type: "text_delta", text: "hello" },
        { type: "reasoning_delta", text: "thinking" },
        { type: "tool_call", id: "tool_1", name: "generate_image", input: { prompt: "x" } },
        {
          type: "tool_result",
          id: "tool_1",
          name: "generate_image",
          output: { imageUrl: "https://example.com/image.png" },
        },
        { type: "usage", usage: { inputTokens: 1, outputTokens: 2 } },
      ],
    });

    for await (const event of runAcpTransport(
      {
        args: ["-e", script],
        command: process.execPath,
        cwd: process.cwd(),
        prompt: "make image",
        promptInput: "stdin",
        transport: "acp-json-rpc",
      },
      {
        cwd: process.cwd(),
        prompt: "make image",
        runId: "run_acp",
      },
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "text_delta", text: "hello" },
      { type: "thinking_delta", text: "thinking" },
      {
        type: "tool_call",
        id: "tool_1",
        name: "generate_image",
        input: { prompt: "x" },
      },
      {
        type: "tool_result",
        id: "tool_1",
        name: "generate_image",
        status: "completed",
        output: { imageUrl: "https://example.com/image.png" },
      },
      { type: "usage", usage: { inputTokens: 1, outputTokens: 2 } },
      {
        type: "done",
        status: "completed",
        reason: "completed",
        exitCode: 0,
      },
    ]);
  });
});
