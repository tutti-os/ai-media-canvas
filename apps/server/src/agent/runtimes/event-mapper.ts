import type { AgentEvent } from "@aimc/local-agent-runtime";
import type { StreamEvent } from "@aimc/shared";

export function mapLocalAgentTerminalEvent(input: {
  event: Extract<AgentEvent, { type: "done" }>;
  now: () => string;
  runId: string;
}): Extract<
  StreamEvent,
  { type: "run.canceled" | "run.completed" | "run.failed" }
> {
  const status =
    input.event.status ??
    (input.event.reason === "cancelled"
      ? "canceled"
      : input.event.reason === "error"
        ? "failed"
        : "completed");

  if (status === "canceled") {
    return {
      type: "run.canceled",
      runId: input.runId,
      timestamp: input.now(),
    };
  }

  if (status === "failed") {
    return {
      type: "run.failed",
      runId: input.runId,
      error: {
        code: "run_failed",
        message:
          typeof input.event.exitCode === "number"
            ? `Local agent exited with code ${input.event.exitCode}.`
            : "Local agent run failed.",
      },
      timestamp: input.now(),
    };
  }

  return {
    type: "run.completed",
    runId: input.runId,
    timestamp: input.now(),
  };
}
