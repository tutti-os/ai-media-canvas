// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "@aimc/shared";

import { useWebSocket } from "../src/hooks/use-websocket";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:3001");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("run-fixed");
  });

  it("replays server-provided run events instead of fabricating a local text response", async () => {
    const serverEvents: StreamEvent[] = [
      {
        type: "run.started",
        runId: "run-fixed",
        sessionId: "session-1",
        conversationId: "canvas-1",
        timestamp: new Date().toISOString(),
      },
      {
        type: "message.delta",
        runId: "run-fixed",
        messageId: "assistant-message-run-fixed",
        delta: "Agnes says hi",
        timestamp: new Date().toISOString(),
      },
      {
        type: "run.completed",
        runId: "run-fixed",
        timestamp: new Date().toISOString(),
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({
          conversationId: "canvas-1",
          runId: "run-fixed",
          sessionId: "session-1",
          status: "accepted",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          done: true,
          events: serverEvents,
          nextCursor: serverEvents.length,
        }),
      });

    const { result } = renderHook(() => useWebSocket());
    const seen: StreamEvent[] = [];
    result.current.onEvent((event) => {
      seen.push(event);
    });

    await act(async () => {
      await result.current.startRun({
        sessionId: "session-1",
        conversationId: "canvas-1",
        prompt: "hello",
      });
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/local-agent/respond",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/local-agent/respond/run-fixed/events?cursor=0",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(seen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run.started",
          runId: "run-fixed",
        }),
        expect.objectContaining({
          type: "message.delta",
          delta: "Agnes says hi",
        }),
        expect.objectContaining({
          type: "run.completed",
        }),
      ]),
    );
    expect(seen).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.delta",
          delta: "本地助手没有返回内容。",
        }),
      ]),
    );
  });
});
