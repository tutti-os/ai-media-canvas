// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ContentBlock } from "@aimc/shared";
import { ChatMessage } from "../src/components/chat-message";

describe("ChatMessage", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a thinking indicator while an empty assistant message is streaming", () => {
    renderAssistantMessage([]);

    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("keeps a thinking indicator below a completed tool while streaming continues", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Bash",
        status: "completed",
        outputSummary: "done",
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("does not add the generic thinking indicator while a tool is running", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Bash",
        status: "running",
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.queryByText("思考中")).not.toBeInTheDocument();
  });
});

function renderAssistantMessage(contentBlocks: ContentBlock[]) {
  render(
    <ChatMessage
      contentBlocks={contentBlocks}
      isStreaming
      role={"assistant" as const}
    />,
  );
}
