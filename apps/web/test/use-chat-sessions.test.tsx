// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChatSessions } from "../src/hooks/use-chat-sessions";

const {
  createSessionMock,
  deleteSessionMock,
  fetchMessagesMock,
  fetchSessionsMock,
  updateSessionTitleMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  fetchMessagesMock: vi.fn(),
  fetchSessionsMock: vi.fn(),
  updateSessionTitleMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  createSession: createSessionMock,
  deleteSession: deleteSessionMock,
  fetchMessages: fetchMessagesMock,
  fetchSessions: fetchSessionsMock,
  updateSessionTitle: updateSessionTitleMock,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useChatSessions", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({
      session: {
        id: "session-new",
        title: "New chat",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    });
    deleteSessionMock.mockReset();
    deleteSessionMock.mockResolvedValue(undefined);
    updateSessionTitleMock.mockReset();
    updateSessionTitleMock.mockResolvedValue(undefined);
    fetchSessionsMock.mockReset();
    fetchSessionsMock.mockResolvedValue({
      sessions: [
        {
          id: "session-a",
          title: "Session A",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
        {
          id: "session-b",
          title: "Session B",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ],
    });
    fetchMessagesMock.mockReset();
    fetchMessagesMock.mockImplementation(async (sessionId: string) => ({
      messages:
        sessionId === "session-a"
          ? [
              {
                id: "message-a",
                role: "assistant",
                content: "A",
                contentBlocks: [{ type: "text", text: "A" }],
                createdAt: "2026-06-02T00:00:00.000Z",
              },
            ]
          : [],
    }));
  });

  it("ignores stale session message loads when the user switches back quickly", async () => {
    const delayedSessionB = deferred<{
      messages: Array<{
        id: string;
        role: "assistant";
        content: string;
        contentBlocks: Array<{ type: "text"; text: string }>;
        createdAt: string;
      }>;
    }>();

    fetchMessagesMock.mockImplementation((sessionId: string) => {
      if (sessionId === "session-b") {
        return delayedSessionB.promise;
      }
      return Promise.resolve({
        messages: [
          {
            id: "message-a",
            role: "assistant",
            content: "A",
            contentBlocks: [{ type: "text", text: "A" }],
            createdAt: "2026-06-02T00:00:00.000Z",
          },
        ],
      });
    });

    const { result } = renderHook(() =>
      useChatSessions({
        canvasId: "canvas-1",
      }),
    );

    await waitFor(() => expect(result.current.activeSessionId).toBe("session-a"));
    await waitFor(() =>
      expect(
        result.current.messages[0]?.contentBlocks?.[0] &&
          "text" in result.current.messages[0].contentBlocks[0]
          ? result.current.messages[0].contentBlocks[0].text
          : null,
      ).toBe("A"),
    );

    act(() => {
      void result.current.handleSelectSession("session-b");
    });
    await waitFor(() => expect(result.current.activeSessionId).toBe("session-b"));
    act(() => {
      void result.current.handleSelectSession("session-a");
    });

    await act(async () => {
      delayedSessionB.resolve({
        messages: [
          {
            id: "message-b",
            role: "assistant",
            content: "B",
            contentBlocks: [{ type: "text", text: "B" }],
            createdAt: "2026-06-02T00:00:00.000Z",
          },
        ],
      });
      await delayedSessionB.promise;
    });

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe("session-a");
      expect(result.current.messagesLoading).toBe(false);
      const firstBlock = result.current.messages[0]?.contentBlocks?.[0];
      expect(firstBlock && "text" in firstBlock ? firstBlock.text : null).toBe(
        "A",
      );
    });
  });

  it("keeps the current session state intact when delete fails", async () => {
    deleteSessionMock.mockRejectedValueOnce(new Error("delete failed"));

    const { result } = renderHook(() =>
      useChatSessions({
        canvasId: "canvas-1",
      }),
    );

    await waitFor(() => expect(result.current.activeSessionId).toBe("session-a"));
    await waitFor(() => {
      const firstBlock = result.current.messages[0]?.contentBlocks?.[0];
      expect(firstBlock && "text" in firstBlock ? firstBlock.text : null).toBe(
        "A",
      );
    });

    await act(async () => {
      await result.current.handleDeleteSession("session-a");
    });

    expect(result.current.activeSessionId).toBe("session-a");
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      "session-a",
      "session-b",
    ]);
    const firstBlock = result.current.messages[0]?.contentBlocks?.[0];
    expect(firstBlock && "text" in firstBlock ? firstBlock.text : null).toBe(
      "A",
    );
  });
});
