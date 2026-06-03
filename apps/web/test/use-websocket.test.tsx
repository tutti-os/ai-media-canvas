// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "@aimc/shared";

import { useWebSocket } from "../src/hooks/use-websocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  url: string;
  private listeners = new Map<string, Set<(event?: any) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close");
  }

  emit(type: string, event?: any) {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  receive(message: Record<string, unknown>) {
    this.emit("message", { data: JSON.stringify(message) });
  }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.clearAllMocks();
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:3001");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("run-fixed");
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  it("connects to /api/ws and streams server events from websocket messages", async () => {
    const { result } = renderHook(() => useWebSocket());
    const socket = MockWebSocket.instances[0];
    expect(socket?.url).toContain("ws://localhost:3001/api/ws");
    expect(socket?.url).toContain("token=standalone-local-access-token");
    expect(socket?.url).toContain("connectionId=run-fixed");

    act(() => {
      socket.open();
    });

    await waitFor(() => expect(result.current.connected).toBe(true));

    const seen: StreamEvent[] = [];
    result.current.onEvent((event) => {
      seen.push(event.event);
    });

    act(() => {
      result.current.startRun(
        {
          sessionId: "session-1",
          conversationId: "canvas-1",
          prompt: "hello",
        },
        () => {},
      );
    });

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "command",
        action: "agent.run",
        payload: {
          sessionId: "session-1",
          conversationId: "canvas-1",
          prompt: "hello",
        },
      }),
    );

    act(() => {
      socket.receive({
        type: "command.ack",
        action: "agent.run",
        payload: {
          conversationId: "canvas-1",
          runId: "run-fixed",
          sessionId: "session-1",
          status: "accepted",
        },
      });
      socket.receive({
        type: "event",
        seq: 7,
        event: {
          type: "message.delta",
          runId: "run-fixed",
          messageId: "assistant-message-run-fixed",
          delta: "Agnes says hi",
          timestamp: new Date().toISOString(),
        },
      });
      socket.receive({
        type: "event",
        event: {
          type: "run.completed",
          runId: "run-fixed",
          timestamp: new Date().toISOString(),
        },
      });
    });

    expect(seen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.delta",
          delta: "Agnes says hi",
        }),
        expect.objectContaining({
          type: "run.completed",
          runId: "run-fixed",
        }),
      ]),
    );
  });

  it("resumes canvases from the latest consumed sequence instead of the ack watermark", async () => {
    const { result } = renderHook(() => useWebSocket());
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.open();
    });

    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.resumeCanvas("canvas-1", () => {});
    });

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "command",
        action: "canvas.resume",
        payload: {
          canvasId: "canvas-1",
          lastSeq: 0,
          skipReplay: false,
        },
      }),
    );

    act(() => {
      socket.receive({
        type: "command.ack",
        action: "canvas.resume",
        payload: {
          canvasId: "canvas-1",
          latestSeq: 2,
          activeRunId: "run-fixed",
          replayed: 0,
          skipReplay: false,
        },
      });
    });

    act(() => {
      result.current.resumeCanvas("canvas-1", () => {});
    });

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "command",
        action: "canvas.resume",
        payload: {
          canvasId: "canvas-1",
          lastSeq: 0,
          skipReplay: false,
        },
      }),
    );

    act(() => {
      socket.receive({
        type: "event",
        seq: 7,
        event: {
          type: "message.delta",
          runId: "run-fixed",
          messageId: "assistant-message-run-fixed",
          delta: "hello",
          timestamp: new Date().toISOString(),
        },
      });
    });

    act(() => {
      result.current.resumeCanvas("canvas-1", () => {});
    });

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "command",
        action: "canvas.resume",
        payload: {
          canvasId: "canvas-1",
          lastSeq: 7,
          skipReplay: false,
        },
      }),
    );
  });
});
