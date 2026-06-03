import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import {
  type RunCreateRequest,
  type StreamEvent,
  wsCommandSchema,
  wsRpcResponseSchema,
} from "@aimc/shared";
import type { AgentRunService } from "../agent/runtime.js";
import type { ThreadService } from "../features/chat/thread-service.js";
import type { SettingsService } from "../features/settings/settings-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type {
  AuthenticatedUser,
  RequestAuthenticator,
} from "../auth/request.js";
import type { ConnectionManager } from "./connection-manager.js";
import type { CanvasEventBuffer } from "./event-buffer.js";
import type { ChatService } from "../features/chat/chat-service.js";
import type { ContentBlock, ToolBlock } from "@aimc/shared";
import { createPipelineLogger } from "./logger.js";
import type { ServerEnv } from "../config/env.js";

type RegisterWsOptions = {
  agentRuns: AgentRunService;
  agentRunPersistence?: {
    appendEvent: (input: {
      canvasId?: string;
      event: StreamEvent;
      runId: string;
    }) => { canvasSeq?: number; eventId: string; seq: number };
    getLatestCanvasSeq?: (canvasId: string) => number;
    listCanvasEvents?: (canvasId: string, cursor?: number) => Array<{
      event: StreamEvent;
      eventId: string;
      canvasSeq: number;
    }>;
  };
  auth?: RequestAuthenticator;
  chatService?: ChatService;
  connectionManager: ConnectionManager;
  eventBuffer?: CanvasEventBuffer;
  settingsService?: SettingsService;
  threadService?: ThreadService;
  viewerService?: ViewerService;
};

export async function registerWsRoute(
  app: FastifyInstance,
  options: RegisterWsOptions,
) {
  const { agentRuns, connectionManager } = options;

  app.get("/api/ws", { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token || !options.auth) {
      socket.close(4001, "Unauthorized");
      return;
    }

    void authenticateAndBind(socket, token, request, options, agentRuns, connectionManager);
  });
}

async function authenticateAndBind(
  socket: WebSocket,
  token: string,
  _request: FastifyRequest,
  options: RegisterWsOptions,
  agentRuns: AgentRunService,
  connectionManager: ConnectionManager,
) {
  const log = createPipelineLogger("ws");

  let authenticatedUser: AuthenticatedUser;
  try {
    const fakeRequest = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as FastifyRequest;
    const user = await options.auth!.authenticate(fakeRequest);
    if (!user) {
      log.warn("auth_rejected", { reason: "invalid_token" });
      socket.close(4001, "Unauthorized");
      return;
    }
    authenticatedUser = user;
    log.info("connected", { userId: user.id });
  } catch (err) {
    log.warn("auth_error", { error: err instanceof Error ? err.message : String(err) });
    socket.close(4001, "Unauthorized");
    return;
  }

  if (socket.readyState !== 1) return;

  // Use client-provided connectionId for reconnect identity; fallback to server UUID
  const urlForParams = new URL(_request.url, `http://${_request.headers.host}`);
  const connectionId = urlForParams.searchParams.get("connectionId") || randomUUID();
  connectionManager.register(connectionId, authenticatedUser.id, socket);

  // Heartbeat with pong timeout (spec §1.3: 60s no-pong → disconnect)
  let lastPong = Date.now();
  socket.on("pong", () => { lastPong = Date.now(); });

  const pingInterval = setInterval(() => {
      if (Date.now() - lastPong > 60_000) {
        log.warn("pong_timeout", { userId: authenticatedUser.id });
        socket.terminate();
        return;
      }
    if (socket.readyState === 1) {
      socket.ping();
    }
  }, 30_000);

  socket.on("message", (raw: Buffer | string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.type === "rpc.response") {
      try {
        const rpcResponse = wsRpcResponseSchema.parse(parsed);
        connectionManager.handleRpcResponse(connectionId, {
          type: rpcResponse.type,
          id: rpcResponse.id,
          ...(rpcResponse.result !== undefined ? { result: rpcResponse.result } : {}),
          ...(rpcResponse.error !== undefined ? { error: rpcResponse.error } : {}),
        });
      } catch {
        // Ignore malformed RPC responses
      }
      return;
    }

    if (obj.type === "command") {
      let msg;
      try {
        msg = wsCommandSchema.parse(parsed);
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid command format" }));
        return;
      }

      if (msg.action === "agent.run") {
        const p = msg.payload;
        const runToken = p.accessToken ?? token;
        void handleRunCommand(
          {
            ...authenticatedUser,
            accessToken: runToken,
          },
          connectionId,
          {
          sessionId: p.sessionId,
          conversationId: p.conversationId,
          prompt: p.prompt,
          ...(p.canvasId !== undefined ? { canvasId: p.canvasId } : {}),
          ...(p.attachments !== undefined ? { attachments: p.attachments } : {}),
          ...(p.imageGenerationPreference !== undefined
            ? { imageGenerationPreference: p.imageGenerationPreference }
            : {}),
          ...(p.videoGenerationPreference !== undefined
            ? { videoGenerationPreference: p.videoGenerationPreference }
            : {}),
          ...(p.mentions !== undefined ? { mentions: p.mentions } : {}),
          ...(p.model !== undefined ? { model: p.model } : {}),
          },
          agentRuns,
          connectionManager,
          options,
        );
      } else if (msg.action === "agent.cancel") {
        log.info("run_cancel", { userId: authenticatedUser.id, runId: msg.payload.runId });
        const cancelResult = agentRuns.cancelRun(msg.payload.runId);
        if (!cancelResult) {
          socket.send(JSON.stringify({ type: "error", message: `Run not found: ${msg.payload.runId}` }));
        }
      } else if (msg.action === "canvas.resume") {
        const p = msg.payload;
        log.info("canvas_resume", { userId: authenticatedUser.id, canvasId: p.canvasId, lastSeq: p.lastSeq });

        // Re-bind this connection to the canvas
        connectionManager.bindCanvas(connectionId, p.canvasId);

        const missed = p.skipReplay
          ? []
          : (options.agentRunPersistence?.listCanvasEvents?.(p.canvasId, p.lastSeq)
            ?? options.eventBuffer?.getAfter(p.canvasId, p.lastSeq)
            ?? []);
        const activeRun = connectionManager.getActiveRun(p.canvasId);
        const latestPersistedSeq =
          options.agentRunPersistence?.getLatestCanvasSeq?.(p.canvasId) ?? 0;
        const latestBufferedSeq = options.eventBuffer?.getLatestSeq(p.canvasId) ?? 0;

        // IMPORTANT: Send ACK FIRST so client registers event listener
        // BEFORE replay events arrive. Otherwise replayed events have no handler.
        connectionManager.sendTo(connectionId, {
          type: "command.ack",
          action: "canvas.resume",
          payload: {
            canvasId: p.canvasId,
            latestSeq: Math.max(latestPersistedSeq, latestBufferedSeq),
            activeRunId: activeRun?.runId ?? null,
            assistantMessageId: activeRun?.assistantMessageId ?? null,
            skipReplay: p.skipReplay ?? false,
            replayed: missed.length,
          },
        });

        // THEN replay missed events from buffer
        for (const entry of missed) {
          connectionManager.sendTo(connectionId, {
            type: "event",
            event: entry.event,
            ...("eventId" in entry && typeof entry.eventId === "string"
              ? { eventId: entry.eventId }
              : {}),
            ...("canvasSeq" in entry && typeof entry.canvasSeq === "number"
              ? { seq: entry.canvasSeq }
              : "seq" in entry && typeof entry.seq === "number"
                ? { seq: entry.seq }
                : {}),
          });
        }
      }
    }
  });

  socket.on("close", () => {
    log.info("disconnected", { userId: authenticatedUser.id, connectionId });
    clearInterval(pingInterval);
    connectionManager.remove(connectionId);
  });

  socket.on("error", () => {
    log.error("socket_error", { userId: authenticatedUser.id, connectionId });
    clearInterval(pingInterval);
    connectionManager.remove(connectionId);
  });
}

async function handleRunCommand(
  authenticatedUser: AuthenticatedUser,
  connectionId: string,
  payload: Omit<RunCreateRequest, "accessToken">,
  agentRuns: AgentRunService,
  connectionManager: ConnectionManager,
  services: RegisterWsOptions,
) {
  const log = createPipelineLogger("agent.run", {
    userId: authenticatedUser.id,
    sessionId: payload.sessionId,
  });
  log.info("started", { prompt: payload.prompt.slice(0, 80) });

  // Resolve thread + model in parallel
  const [threadId, effectiveEnv] = await Promise.all([
    (async (): Promise<string | undefined> => {
      if (!services.threadService) return undefined;
      try {
        const sessionThread = await services.threadService.resolveOwnedSessionThread(
          authenticatedUser,
          payload.sessionId,
        );
        return sessionThread.threadId;
      } catch (error) {
        log.warn("thread_resolve_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    })(),
    (async (): Promise<ServerEnv | undefined> => {
      if (!services.settingsService || !services.viewerService) return undefined;
      try {
        const viewer = await services.viewerService.ensureViewer(authenticatedUser);
        return await services.settingsService.getEffectiveServerEnv(
          viewer.workspace.id,
        );
      } catch (error) {
        log.warn("model_resolve_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    })(),
  ]);
  const model = effectiveEnv?.agentModel;
  // Client-provided model takes priority over workspace default
  const resolvedModel = payload.model ?? model;
  log.lap("resolve", { threadId: !!threadId, model: resolvedModel });

  let assistantMessageId: string | undefined;
  if (services.chatService) {
    try {
      const assistantMessage = await services.chatService.createMessage(
        authenticatedUser,
        payload.sessionId,
        {
          role: "assistant",
          content: "",
          contentBlocks: [],
        },
      );
      assistantMessageId = assistantMessage.id;
    } catch (error) {
      log.warn("assistant_anchor_create_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const response = agentRuns.createRun(payload, {
    accessToken: authenticatedUser.accessToken,
    ...(assistantMessageId ? { assistantMessageId } : {}),
    connectionId,
    ...(effectiveEnv ? { env: effectiveEnv } : {}),
    userId: authenticatedUser.id,
    ...(resolvedModel ? { model: resolvedModel } : {}),
    ...(payload.runtimeKind ? { runtimeKind: payload.runtimeKind } : {}),
    ...(threadId ? { threadId } : {}),
  });
  assistantMessageId = response.assistantMessageId;
  const runId = response.runId;
  log.lap("run_created", { runId });

  // Bind this connection to the canvas so events route correctly
  const canvasId = payload.canvasId ?? payload.conversationId;
  connectionManager.bindCanvas(connectionId, canvasId);

  // Send ACK to the specific connection that initiated the run.
  // Retry with short delays if the connection is temporarily unavailable
  // (e.g., brief disconnect/reconnect during page transitions).
  const ackMessage = {
    type: "command.ack",
    action: "agent.run",
    payload: {
      ...response,
      ...(assistantMessageId ? { assistantMessageId } : {}),
    },
  };
  let ackSent = connectionManager.sendTo(connectionId, ackMessage);
  if (!ackSent) {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 500));
      ackSent = connectionManager.sendTo(connectionId, ackMessage);
      if (ackSent) break;
    }
  }
  log.lap("ack_sent", { runId, connectionId, delivered: ackSent });

  // Track active run so reconnecting clients can detect it
  connectionManager.setActiveRun(canvasId, runId, assistantMessageId);

  const keepAlive = setInterval(() => {
    connectionManager.sendTo(connectionId, { type: "keep-alive" });
  }, 15_000);

  // Accumulate assistant content blocks for server-side persistence
  const assistantText: string[] = [];
  const assistantBlocks: ContentBlock[] = [];

  try {
    let firstEvent = true;
    for await (const event of agentRuns.streamRun(runId)) {
      if (firstEvent) {
        log.lap("first_token", { runId });
        firstEvent = false;
      }

      // Buffer for replay on reconnect
      const persistedEvent = services.agentRunPersistence?.appendEvent({
        canvasId,
        event,
        runId,
      });
      services.eventBuffer?.push(canvasId, event, {
        ...(persistedEvent?.eventId ? { eventId: persistedEvent.eventId } : {}),
        ...(persistedEvent?.canvasSeq != null ? { seq: persistedEvent.canvasSeq } : {}),
      });

      // Broadcast to all viewers
      connectionManager.pushToCanvas(canvasId, event, {
        ...(persistedEvent?.eventId ? { eventId: persistedEvent.eventId } : {}),
        ...(persistedEvent?.canvasSeq != null ? { seq: persistedEvent.canvasSeq } : {}),
      });

      // Accumulate content for server-side persistence
      if (event.type === "message.delta") {
        const lastBlock = assistantBlocks[assistantBlocks.length - 1];
        if (lastBlock && lastBlock.type === "text") {
          (lastBlock as { type: "text"; text: string }).text += event.delta;
        } else {
          assistantBlocks.push({ type: "text", text: event.delta });
        }
        assistantText.push(event.delta);
      } else if (event.type === "tool.started") {
        assistantBlocks.push({
          type: "tool",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: "running" as const,
          ...(event.input ? { input: event.input } : {}),
        });
      } else if (event.type === "tool.completed") {
        const idx = assistantBlocks.findIndex(
          (b) => b.type === "tool" && (b as ToolBlock).toolCallId === event.toolCallId,
        );
        const nextBlock: ToolBlock = {
          ...(idx >= 0
            ? (assistantBlocks[idx] as ToolBlock)
            : {
                type: "tool" as const,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "running" as const,
              }),
          status: "completed" as const,
          ...(event.output ? { output: event.output } : {}),
          ...(event.outputSummary ? { outputSummary: event.outputSummary } : {}),
          ...(event.artifacts ? { artifacts: event.artifacts } : {}),
        };
        if (idx >= 0) {
          assistantBlocks[idx] = nextBlock;
        } else {
          assistantBlocks.push(nextBlock);
        }
      } else if (event.type === "tool.failed") {
        const idx = assistantBlocks.findIndex(
          (b) => b.type === "tool" && (b as ToolBlock).toolCallId === event.toolCallId,
        );
        const nextBlock: ToolBlock = {
          ...(idx >= 0
            ? (assistantBlocks[idx] as ToolBlock)
            : {
                type: "tool" as const,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "running" as const,
              }),
          status: "failed" as const,
          ...(event.output ? { output: event.output } : {}),
          ...(event.outputSummary
            ? { outputSummary: event.outputSummary }
            : { outputSummary: event.error.message }),
          ...(event.artifacts ? { artifacts: event.artifacts } : {}),
        };
        if (idx >= 0) {
          assistantBlocks[idx] = nextBlock;
        } else {
          assistantBlocks.push(nextBlock);
        }
      } else if (event.type === "run.failed" && assistantText.length === 0) {
        const message = `抱歉，处理过程中遇到问题：${event.error.message}`;
        assistantBlocks.push({ type: "text", text: message });
        assistantText.push(message);
      }

      if (services.chatService && assistantMessageId) {
        try {
          await services.chatService.updateMessage(
            authenticatedUser,
            assistantMessageId,
            {
              role: "assistant",
              content: assistantText.join(""),
              contentBlocks: assistantBlocks,
            },
          );
        } catch (error) {
          log.warn("assistant_message_update_failed", {
            error: error instanceof Error ? error.message : String(error),
            runId,
          });
        }
      }
    }
    log.lap("stream_done", { runId });
  } catch (error) {
    log.error("stream_error", { runId, error: error instanceof Error ? error.message : "unknown" });
    const failedEvent = {
      type: "run.failed" as const,
      runId,
      error: {
        code: "run_failed" as const,
        message: error instanceof Error ? error.message : "Stream failed",
      },
      timestamp: new Date().toISOString(),
    };
    const persistedEvent = services.agentRunPersistence?.appendEvent({
      canvasId,
      event: failedEvent,
      runId,
    });
    services.eventBuffer?.push(canvasId, failedEvent, {
      ...(persistedEvent?.eventId ? { eventId: persistedEvent.eventId } : {}),
      ...(persistedEvent?.canvasSeq != null ? { seq: persistedEvent.canvasSeq } : {}),
    });
    connectionManager.pushToCanvas(canvasId, failedEvent, {
      ...(persistedEvent?.eventId ? { eventId: persistedEvent.eventId } : {}),
      ...(persistedEvent?.canvasSeq != null ? { seq: persistedEvent.canvasSeq } : {}),
    });
  } finally {
    clearInterval(keepAlive);
    connectionManager.clearActiveRun(canvasId);
  }
}
