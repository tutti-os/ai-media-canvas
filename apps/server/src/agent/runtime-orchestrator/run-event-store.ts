import type { StreamEvent } from "@aimc/shared";

export type AgentRunEventEnvelope = {
  canvasSeq?: number;
  eventId: string;
  seq: number;
};

export type AgentRunEventPersistence = {
  appendEvent(input: {
    canvasId?: string;
    event: StreamEvent;
    runId: string;
  }): AgentRunEventEnvelope;
};

export function persistRunEvent(input: {
  canvasId?: string;
  event: StreamEvent;
  persistence?: AgentRunEventPersistence | undefined;
  runId: string;
}): AgentRunEventEnvelope | undefined {
  return input.persistence?.appendEvent({
    ...(input.canvasId ? { canvasId: input.canvasId } : {}),
    event: input.event,
    runId: input.runId,
  });
}

export function buildReplayEnvelope(
  persistedEvent: AgentRunEventEnvelope | undefined,
): { eventId?: string; seq?: number } {
  return {
    ...(persistedEvent?.eventId ? { eventId: persistedEvent.eventId } : {}),
    ...(persistedEvent?.canvasSeq != null ? { seq: persistedEvent.canvasSeq } : {}),
  };
}
