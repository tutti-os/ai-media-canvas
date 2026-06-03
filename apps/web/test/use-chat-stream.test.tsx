// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useChatStream } from "../src/hooks/use-chat-stream";
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
});
