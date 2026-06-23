// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  materializeAssistantBlocksFromEvents,
  useChatStream,
} from "../src/hooks/use-chat-stream";
import type { Message } from "../src/hooks/use-chat-sessions";

describe("useChatStream", () => {
  it("surfaces the first line of a run failure without triggering a hard console error", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      let currentMessages: Message[] = [
        {
          id: "assistant-1",
          role: "assistant",
          contentBlocks: [],
        },
      ];

      const updateSessionMessages = vi.fn(
        (_sessionId: string, updater: (prev: Message[]) => Message[]) => {
          currentMessages = updater(currentMessages);
        },
      );

      const { result } = renderHook(() => useChatStream(updateSessionMessages));

      act(() => {
        result.current.applyStreamEvent(
          {
            type: "run.failed",
            runId: "run-1",
            timestamp: new Date().toISOString(),
            error: {
              code: "run_failed",
              message:
                "401 无效的令牌\n\nTroubleshooting URL: https://docs.langchain.com/...",
            },
          },
          "assistant-1",
          "session-1",
        );
      });

      expect(updateSessionMessages).toHaveBeenCalled();
      expect(currentMessages[0]?.contentBlocks).toEqual([
        {
          type: "text",
          text: "抱歉，处理过程中遇到问题：401 无效的令牌",
        },
      ]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[chat-stream] run.failed:",
        "401 无效的令牌\n\nTroubleshooting URL: https://docs.langchain.com/...",
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  it("cancels deferred media tool blocks when a run is canceled", () => {
    let currentMessages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        contentBlocks: [
          {
            type: "tool",
            toolCallId: "tool-image-1",
            toolName: "generate_image",
            status: "completed",
            output: {
              status: "generating",
              jobId: "job-image-1",
              jobType: "image_generation",
            },
          },
        ],
      },
    ];

    const updateSessionMessages = vi.fn(
      (_sessionId: string, updater: (prev: Message[]) => Message[]) => {
        currentMessages = updater(currentMessages);
      },
    );

    const { result } = renderHook(() => useChatStream(updateSessionMessages));

    act(() => {
      result.current.applyStreamEvent(
        {
          type: "run.canceled",
          runId: "run-1",
          timestamp: new Date().toISOString(),
        },
        "assistant-1",
        "session-1",
      );
    });

    expect(currentMessages[0]?.contentBlocks).toEqual([
      {
        type: "tool",
        toolCallId: "tool-image-1",
        toolName: "generate_image",
        status: "canceled",
        output: {
          status: "canceled",
          jobId: "job-image-1",
          jobType: "image_generation",
        },
        outputSummary: "已取消",
      },
    ]);
  });

  it("materializes canceled deferred media tool blocks after reconnect", () => {
    const blocks = materializeAssistantBlocksFromEvents([
      {
        type: "tool.completed",
        runId: "run-1",
        toolCallId: "tool-image-1",
        toolName: "generate_image",
        output: {
          status: "generating",
          jobId: "job-image-1",
          jobType: "image_generation",
        },
        timestamp: new Date().toISOString(),
      },
      {
        type: "run.canceled",
        runId: "run-1",
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(blocks).toEqual([
      {
        type: "tool",
        toolCallId: "tool-image-1",
        toolName: "generate_image",
        status: "canceled",
        output: {
          status: "canceled",
          jobId: "job-image-1",
          jobType: "image_generation",
        },
        outputSummary: "已取消",
      },
    ]);
  });
});
