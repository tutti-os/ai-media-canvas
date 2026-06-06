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

  it("keeps the generic thinking indicator below a running tool", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Bash",
        status: "running",
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("uses the bottom thinking indicator instead of a markdown cursor while a tool is running", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "我会先生成一张图。" },
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Agnes Image 2.1 Flash",
        status: "running",
      },
    ];

    const { container } = renderAssistantMessage(blocks);

    expect(screen.getByText("思考中")).toBeInTheDocument();
    expect(
      container.querySelector(".markdown-content .animate-pulse"),
    ).toBeNull();
  });
});

function renderAssistantMessage(contentBlocks: ContentBlock[]) {
  return render(
    <ChatMessage
      contentBlocks={contentBlocks}
      isStreaming
      role={"assistant" as const}
    />,
  );
}
