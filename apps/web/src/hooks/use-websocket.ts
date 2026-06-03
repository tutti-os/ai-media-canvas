"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  StreamEvent,
  WsCommandAck,
  RunCreateRequest,
} from "@aimc/shared";
import { getServerBaseUrl } from "../lib/env";

type EventCallback = (event: StreamEvent) => void;
type RPCHandler = (
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type WebSocketHandle = {
  connected: boolean;
  startRun: (
    payload: RunCreateRequest,
    onAck?: (ack: WsCommandAck) => void,
  ) => void;
  cancelRun: (runId: string) => void;
  onEvent: (cb: EventCallback) => () => void;
  registerRPC: (method: string, handler: RPCHandler) => () => void;
  resumeCanvas: (canvasId: string, onAck?: (ack: WsCommandAck) => void) => void;
};

export function useWebSocket(): WebSocketHandle {
  const [connected, setConnected] = useState(true);
  const eventListeners = useRef<Set<EventCallback>>(new Set());
  const rpcHandlers = useRef<Map<string, RPCHandler>>(new Map());
  const runControllers = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    setConnected(true);
  }, []);

  const emitEvent = useCallback((event: StreamEvent) => {
    for (const listener of eventListeners.current) {
      listener(event);
    }
  }, []);

  const startRun = useCallback(
    async (payload: RunCreateRequest, onAck?: (ack: WsCommandAck) => void) => {
      const fallbackRunId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `local-run-${Date.now()}`;
      const controller = new AbortController();
      let runId = fallbackRunId;
      let acked = false;

      try {
        const response = await fetch(
          `${getServerBaseUrl()}/api/local-agent/respond`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`local agent failed with status ${response.status}`);
        }

        const ackPayload = (await response.json()) as {
          conversationId: string;
          runId: string;
          sessionId: string;
          status: string;
        };
        runId = ackPayload.runId;
        acked = true;
        runControllers.current.set(runId, controller);
        onAck?.({
          type: "command.ack",
          action: "agent.run",
          payload: ackPayload,
        });

        let cursor = 0;
        while (!controller.signal.aborted) {
          const eventsResponse = await fetch(
            `${getServerBaseUrl()}/api/local-agent/respond/${runId}/events?cursor=${cursor}`,
            {
              signal: controller.signal,
            },
          );
          if (!eventsResponse.ok) {
            throw new Error(
              `local agent events failed with status ${eventsResponse.status}`,
            );
          }

          const data = (await eventsResponse.json()) as {
            done: boolean;
            events: StreamEvent[];
            nextCursor: number;
          };
          for (const event of data.events) {
            emitEvent(event);
          }
          cursor = data.nextCursor;

          if (data.done) {
            break;
          }

          await new Promise<void>((resolve) => {
            const timeout = window.setTimeout(resolve, 250);
            controller.signal.addEventListener(
              "abort",
              () => {
                window.clearTimeout(timeout);
                resolve();
              },
              { once: true },
            );
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (!acked) {
          onAck?.({
            type: "command.ack",
            action: "agent.run",
            payload: { runId },
          });
        }
        emitEvent({
          type: "run.failed",
          runId,
          error: {
            code: "run_failed",
            message:
              error instanceof Error
                ? error.message
                : "Local agent request failed.",
          },
          timestamp: new Date().toISOString(),
        });
      } finally {
        runControllers.current.delete(runId);
      }
    },
    [emitEvent],
  );

  const cancelRun = useCallback((runId: string) => {
    runControllers.current.get(runId)?.abort();
    runControllers.current.delete(runId);
    void fetch(`${getServerBaseUrl()}/api/local-agent/respond/${runId}/cancel`, {
      method: "POST",
    }).catch(() => {});
    emitEvent({
      type: "run.canceled",
      runId,
      timestamp: new Date().toISOString(),
    });
  }, [emitEvent]);

  const onEvent = useCallback((cb: EventCallback) => {
    eventListeners.current.add(cb);
    return () => {
      eventListeners.current.delete(cb);
    };
  }, []);

  const registerRPC = useCallback((method: string, handler: RPCHandler) => {
    rpcHandlers.current.set(method, handler);
    return () => {
      rpcHandlers.current.delete(method);
    };
  }, []);

  const resumeCanvas = useCallback(
    (canvasId: string, onAck?: (ack: WsCommandAck) => void) => {
      onAck?.({
        type: "command.ack",
        action: "canvas.resume",
        payload: {
          canvasId,
          latestSeq: 0,
          activeRunId: null,
          replayed: 0,
        },
      });
    },
    [],
  );

  return {
    connected,
    startRun,
    cancelRun,
    onEvent,
    registerRPC,
    resumeCanvas,
  };
}
