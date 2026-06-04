import type { AgentRuntimeProvider, RuntimeKind, StreamEvent } from "@aimc/shared";

import {
  createAssistantMessageProjection,
  projectStreamEventToAssistantMessage,
  type AssistantMessageProjection,
} from "./run-event-projector.js";
import {
  buildReplayEnvelope,
  persistRunEvent,
  type AgentRunEventPersistence,
} from "./run-event-store.js";

type AgentRunStatus = "accepted" | "canceled" | "completed" | "failed" | "running";

export type AgentRunRecordStore = {
  createRun(input: {
    assistantMessageId?: string;
    canvasId?: string;
    model?: string;
    runtimeKind?: RuntimeKind;
    runtimeProvider?: AgentRuntimeProvider;
    runId: string;
    sessionId: string;
    threadId?: string;
  }): void;
  updateRun(input: {
    assistantMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    runId: string;
    runtimeKind?: RuntimeKind;
    runtimeProvider?: AgentRuntimeProvider;
    status: AgentRunStatus;
  }): void;
};

export type AgentRunOrchestrator = {
  createAssistantProjection(): AssistantMessageProjection;
  persistAndEnvelope(input: {
    canvasId?: string;
    event: StreamEvent;
    runId: string;
  }): { eventId?: string; seq?: number };
  projectEvent(
    state: AssistantMessageProjection,
    event: StreamEvent,
  ): AssistantMessageProjection;
  recordAcceptedRun(input: {
    assistantMessageId?: string;
    canvasId?: string;
    model?: string;
    runtimeKind?: RuntimeKind;
    runtimeProvider?: AgentRuntimeProvider;
    runId: string;
    sessionId: string;
    threadId?: string;
  }): void;
  updateRunStatus(input: {
    assistantMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    runId: string;
    runtimeKind?: RuntimeKind;
    runtimeProvider?: AgentRuntimeProvider;
    status: AgentRunStatus;
  }): void;
};

export function createAgentRunOrchestrator(input: {
  eventPersistence?: AgentRunEventPersistence | undefined;
  runStore?: AgentRunRecordStore | undefined;
}): AgentRunOrchestrator {
  return {
    createAssistantProjection() {
      return createAssistantMessageProjection();
    },

    persistAndEnvelope(eventInput) {
      return buildReplayEnvelope(
        persistRunEvent({
          ...eventInput,
          persistence: input.eventPersistence,
        }),
      );
    },

    projectEvent(state, event) {
      projectStreamEventToAssistantMessage(state, event);
      return state;
    },

    recordAcceptedRun(runInput) {
      input.runStore?.createRun(runInput);
    },

    updateRunStatus(statusInput) {
      input.runStore?.updateRun(statusInput);
    },
  };
}
