import {
  type AimcErrorCode,
  type StreamEvent,
  type ToolArtifact,
  errorCodeValues,
  imageArtifactSchema,
  videoArtifactSchema,
} from "@aimc/shared";
import type { AgentEvent } from "@tutti-os/agent-acp-kit";
import { createPipelineLogger } from "../../ws/logger.js";

const INTERNAL_SKILL_READ_RE =
  /\/skills\/.+\/SKILL\.md|(?:^|[\s'"])(?:\.\/)?workspace-skills\/[^\s'"]+/;
const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

function toAimcErrorCode(value: unknown): AimcErrorCode {
  return typeof value === "string" &&
    (errorCodeValues as readonly string[]).includes(value)
    ? (value as AimcErrorCode)
    : "tool_failed";
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function formatAskUserQuestionInput(
  input: Record<string, unknown> | undefined,
) {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  const lines: string[] = [];

  questions.forEach((rawQuestion, index) => {
    const questionRecord = toRecord(rawQuestion);
    if (!questionRecord) return;

    const header =
      typeof questionRecord.header === "string" &&
      questionRecord.header.trim().length > 0
        ? questionRecord.header.trim()
        : undefined;
    const question =
      typeof questionRecord.question === "string" &&
      questionRecord.question.trim().length > 0
        ? questionRecord.question.trim()
        : undefined;
    if (!header && !question) return;

    lines.push(
      header && question
        ? `${index + 1}. ${header}: ${question}`
        : `${index + 1}. ${question ?? header}`,
    );

    const options = Array.isArray(questionRecord.options)
      ? questionRecord.options
      : [];
    for (const rawOption of options) {
      const optionRecord = toRecord(rawOption);
      if (!optionRecord) continue;
      const label =
        typeof optionRecord.label === "string" ? optionRecord.label.trim() : "";
      if (!label) continue;
      const description =
        typeof optionRecord.description === "string"
          ? optionRecord.description.trim()
          : "";
      lines.push(
        description.length > 0 ? `- ${label}: ${description}` : `- ${label}`,
      );
    }
  });

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function extractLocalAssetId(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, "http://localhost");
    const isRelative = value.startsWith("/");
    const isLoopback =
      parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (!isRelative && !isLoopback) return undefined;
    if (!parsed.pathname.startsWith("/local-assets/")) return undefined;
    return (
      parsed.pathname.slice("/local-assets/".length).split("/")[0] || undefined
    );
  } catch {
    return undefined;
  }
}

function toPersistentLocalAssetUrl(
  assetId: string | undefined,
  fallback: string,
) {
  return assetId ? `/local-assets/${assetId}` : fallback;
}

function buildArtifacts(
  toolName: string,
  output: Record<string, unknown>,
): ToolArtifact[] | undefined {
  const imageUrl =
    typeof output.imageUrl === "string" && output.imageUrl.length > 0
      ? output.imageUrl
      : toolName === "persist_sandbox_file" &&
          typeof output.url === "string" &&
          output.url.length > 0
        ? output.url
        : toolName === "screenshot_canvas" &&
            typeof output.screenshotUrl === "string" &&
            output.screenshotUrl.length > 0
          ? output.screenshotUrl
          : undefined;
  if (
    (toolName === "generate_image" ||
      toolName === "screenshot_canvas" ||
      toolName === "persist_sandbox_file") &&
    imageUrl
  ) {
    const assetId =
      typeof output.assetId === "string"
        ? output.assetId
        : extractLocalAssetId(imageUrl);
    const parsed = imageArtifactSchema.safeParse({
      type: "image",
      ...(assetId ? { assetId } : {}),
      url: toPersistentLocalAssetUrl(assetId, imageUrl),
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
    const assetId =
      typeof output.assetId === "string"
        ? output.assetId
        : extractLocalAssetId(output.videoUrl);
    const parsed = videoArtifactSchema.safeParse({
      type: "video",
      ...(assetId ? { assetId } : {}),
      url: toPersistentLocalAssetUrl(assetId, output.videoUrl),
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
  return Array.isArray(rawArtifacts)
    ? (rawArtifacts as ToolArtifact[])
    : undefined;
}

function coerceToolOutput(
  output: unknown,
): Record<string, unknown> | undefined {
  const record = toRecord(output);
  if (!record) return undefined;
  if (
    record.output &&
    typeof record.output === "object" &&
    !Array.isArray(record.output)
  ) {
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
  const log = createPipelineLogger("local_agent.events", { runId });

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
    if (event.name === ASK_USER_QUESTION_TOOL) {
      const delta = formatAskUserQuestionInput(inputRecord);
      log.info("tool_call_suppressed", {
        providerToolName: event.name,
        reason: "ask_user_question_as_text",
        toolCallId: event.id,
      });
      return delta
        ? [
            {
              type: "message.delta",
              runId,
              messageId,
              delta,
              timestamp: now(),
            },
          ]
        : [];
    }

    if (
      event.name === "Bash" &&
      typeof inputRecord?.command === "string" &&
      INTERNAL_SKILL_READ_RE.test(inputRecord.command)
    ) {
      log.info("tool_call_suppressed", {
        providerToolName: event.name,
        reason: "internal_skill_read",
        toolCallId: event.id,
      });
      return [];
    }

    log.info("tool_call_mapped", {
      providerToolName: event.name,
      toolCallId: event.id,
      inputKeys: inputRecord ? Object.keys(inputRecord).sort() : [],
    });
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
    if (toolName === ASK_USER_QUESTION_TOOL) {
      log.info("tool_result_suppressed", {
        providerToolName: toolName,
        reason: "ask_user_question_as_text",
        toolCallId: event.id,
      });
      return [];
    }

    const isToolFailure = event.isError ?? event.status === "failed";
    const output = coerceToolOutput(event.output);
    const summary = coerceToolSummary(event.output, event.summary);
    if (
      toolName === "Bash" &&
      typeof output?.output === "string" &&
      INTERNAL_SKILL_READ_RE.test(output.output)
    ) {
      log.info("tool_result_suppressed", {
        providerToolName: toolName,
        reason: "internal_skill_read",
        toolCallId: event.id,
      });
      return [];
    }

    const artifacts = output ? buildArtifacts(toolName, output) : undefined;
    log.info("tool_result_mapped", {
      providerToolName: toolName,
      toolCallId: event.id,
      isError: isToolFailure,
      outputKeys: output ? Object.keys(output).sort() : [],
      artifactCount: artifacts?.length ?? 0,
    });
    const common = {
      runId,
      toolCallId: event.id,
      toolName,
      ...(output ? { output } : {}),
      ...(summary ? { outputSummary: summary } : {}),
      ...(artifacts ? { artifacts } : {}),
      timestamp: now(),
    };
    const toolErrorCode = toAimcErrorCode(output?.error);

    const events: StreamEvent[] = [
      isToolFailure
        ? {
            ...common,
            type: "tool.failed",
            error: {
              code: toolErrorCode,
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
