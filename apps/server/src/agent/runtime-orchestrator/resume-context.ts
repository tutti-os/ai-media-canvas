import type { AgentRuntimeProvider, RuntimeKind } from "@aimc/shared";

export type AgentRunResumeMode = "native" | "provider-local" | "handoff" | "fresh";

export type AgentRunResumeContext = {
  mode: AgentRunResumeMode;
  previousRunId?: string;
  previousRuntimeKind?: RuntimeKind | null;
  previousRuntimeProvider?: AgentRuntimeProvider | null;
  providerSessionId?: string;
  resumeToken?: string;
};

export function resolveResumeMode(input: {
  nextRuntimeKind?: RuntimeKind;
  nextRuntimeProvider?: AgentRuntimeProvider;
  previousRuntimeKind?: RuntimeKind | null;
  previousRuntimeProvider?: AgentRuntimeProvider | null;
}): AgentRunResumeMode {
  if (!input.previousRuntimeKind) {
    return "fresh";
  }
  if (
    input.previousRuntimeKind === input.nextRuntimeKind &&
    input.previousRuntimeProvider === input.nextRuntimeProvider
  ) {
    return "provider-local";
  }
  return "handoff";
}
