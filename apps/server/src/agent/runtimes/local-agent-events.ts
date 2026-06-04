import type { AgentEvent } from "@nextop-os/agent-acp-kit";
import {
  imageArtifactSchema,
  type StreamEvent,
  type ToolArtifact,
  videoArtifactSchema,
} from "@aimc/shared";

const INTERNAL_SKILL_READ_RE =
  /\/skills\/.+\/SKILL\.md|(?:^|[\s'"])(?:\.\/)?workspace-skills\/[^\s'"]+/;

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function buildArtifacts(
  toolName: string,
  output: Record<string, unknown>,
): ToolArtifact[] | undefined {
  const imageUrl =
    typeof output.imageUrl === "string" && output.imageUrl.length > 0
      ? output.imageUrl
      : toolName === "screenshot_canvas" &&
          typeof output.screenshotUrl === "string" &&
          output.screenshotUrl.length > 0
        ? output.screenshotUrl
        : undefined;
  if (
    (toolName === "generate_image" || toolName === "screenshot_canvas") &&
    imageUrl
  ) {
    const parsed = imageArtifactSchema.safeParse({
      type: "image",
      url: imageUrl,
      mimeType:
        typeof output.mimeType === "string" && output.mimeType.length > 0
          ? output.mimeType
          : "image/png",
      width: typeof output.width === "number" ? output.width : 1024,
      height: typeof output.height === "number" ? output.height : 1024,
      ...(typeof output.title === "string" ? { title: output.title } : {}),
      ...(toRecord(output.placement) ? { placement: output.placement } : {}),
    });
    return parsed.success ? [parsed.data] : undefined;
  }

  if (
    toolName === "generate_video" &&
    typeof output.videoUrl === "string" &&
    output.videoUrl.length > 0
  ) {
    const parsed = videoArtifactSchema.safeParse({
      type: "video",
      url: output.videoUrl,
      mimeType:
        typeof output.mimeType === "string" && output.mimeType.length > 0
          ? output.mimeType
          : "video/mp4",
      width: typeof output.width === "number" ? output.width : 1280,
      height: typeof output.height === "number" ? output.height : 720,
      ...(typeof output.durationSeconds === "number"
        ? { durationSeconds: output.durationSeconds }
        : {}),
      ...(typeof output.title === "string" ? { title: output.title } : {}),
      ...(toRecord(output.placement) ? { placement: output.placement } : {}),
    });
    return parsed.success ? [parsed.data] : undefined;
  }

  const rawArtifacts = output.artifacts;
  return Array.isArray(rawArtifacts) ? (rawArtifacts as ToolArtifact[]) : undefined;
}

function coerceToolOutput(output: unknown): Record<string, unknown> | undefined {
  const record = toRecord(output);
  if (!record) return undefined;
  if (record.output && typeof record.output === "object" && !Array.isArray(record.output)) {
    return record.output as Record<string, unknown>;
  }
  return record;
}

function coerceToolSummary(output: unknown, summary?: string) {
  if (summary) return summary;
  const record = toRecord(output);
  if (!record) return undefined;
  if (typeof record.outputSummary === "string") return record.outputSummary;
  if (typeof record.summary === "string") return record.summary;
  if (typeof record.message === "string") return record.message;
  return undefined;
}

export function toAimcRunErrorCode(code: string | undefined) {
  switch (code) {
    case "invalid_request":
    case "run_conflict":
    case "run_failed":
    case "run_not_found":
    case "tool_failed":
      return code;
    default:
      return "run_failed";
  }
}

function mapLocalAgentTerminalEvent(input: {
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

export function adaptLocalAgentEvent(input: {
  event: AgentEvent;
  messageId: string;
  now: () => string;
  runId: string;
}): StreamEvent[] {
  const { event, messageId, now, runId } = input;

  if (event.type === "thinking" || event.type === "thinking_delta") {
    return [
      {
        type: "thinking.delta",
        runId,
        messageId,
        delta: event.text,
        timestamp: now(),
      },
    ];
  }

  if (event.type === "text_delta") {
    return [
      {
        type: "message.delta",
        runId,
        messageId,
        delta: event.text,
        timestamp: now(),
      },
    ];
  }

  if (event.type === "tool_call") {
    const inputRecord = toRecord(event.input);
    if (
      event.name === "Bash" &&
      typeof inputRecord?.command === "string" &&
      INTERNAL_SKILL_READ_RE.test(inputRecord.command)
    ) {
      return [];
    }

    return [
      {
        type: "tool.started",
        runId,
        toolCallId: event.id,
        toolName: event.name,
        ...(inputRecord ? { input: inputRecord } : {}),
        timestamp: now(),
      },
    ];
  }

  if (event.type === "tool_result") {
    const toolName = event.name ?? "unknown_tool";
    const isToolFailure = event.isError ?? event.status === "failed";
    const output = coerceToolOutput(event.output);
    const summary = coerceToolSummary(event.output, event.summary);
    if (
      toolName === "Bash" &&
      typeof output?.output === "string" &&
      INTERNAL_SKILL_READ_RE.test(output.output)
    ) {
      return [];
    }

    const artifacts = output ? buildArtifacts(toolName, output) : undefined;
    const common = {
      runId,
      toolCallId: event.id,
      toolName,
      ...(output ? { output } : {}),
      ...(summary ? { outputSummary: summary } : {}),
      ...(artifacts ? { artifacts } : {}),
      timestamp: now(),
    };

    const events: StreamEvent[] = [
      isToolFailure
        ? {
            ...common,
            type: "tool.failed",
            error: {
              code: "tool_failed",
              message: summary ?? "Tool execution failed.",
            },
          }
        : {
            ...common,
            type: "tool.completed",
          },
    ];
    if (!isToolFailure && toolName === "manipulate_canvas") {
      events.push({
        type: "canvas.sync",
        runId,
        timestamp: now(),
      });
    }
    return events;
  }

  if (event.type === "error") {
    return [
      {
        type: "run.failed",
        runId,
        error: {
          code: toAimcRunErrorCode(event.code),
          message: event.message,
        },
        timestamp: now(),
      },
    ];
  }

  if (event.type === "done") {
    return [mapLocalAgentTerminalEvent({ event, now, runId })];
  }

  return [];
}
