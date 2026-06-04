import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  createCodexProvider,
  createLocalAgentRuntime,
  type AgentEvent,
  type AgentRunMessage,
  type LocalAgentMcpServerConfig,
} from "@aimc/local-agent-runtime";
import {
  imageArtifactSchema,
  type StreamEvent,
  type ToolArtifact,
  videoArtifactSchema,
} from "@aimc/shared";

import type {
  LocalCodexRuntimeExecutionContext,
  LocalCodexRuntimeProviderDeps,
  RuntimeExecutionContext,
} from "./types.js";
import { assertLocalCodexRuntimeExecutionContext } from "./types.js";
import { mapLocalAgentTerminalEvent } from "./event-mapper.js";
import { mapWorkspaceSkillsToLocalAgentManifest } from "../local-runtime/aimc-skill-delivery.js";

const INTERNAL_SKILL_READ_RE =
  /\/skills\/.+\/SKILL\.md|(?:^|[\s'"])(?:\.\/)?workspace-skills\/[^\s'"]+/;

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeCodexModel(model: string) {
  if (model === "codex:gpt-5") return "codex:gpt-5.4";
  if (model === "codex:gpt-5-mini") return "codex:gpt-5.4-mini";
  return model;
}

function extractMessageText(content: string | unknown): string {
  return typeof content === "string" ? content : "";
}

async function loadConversationHistory(
  sessionId: string,
  currentPrompt: string,
  loadSessionMessages?: (sessionId: string) => Promise<Array<{ role: "user" | "assistant"; content: string | unknown }>>,
): Promise<AgentRunMessage[]> {
  if (!loadSessionMessages) return [];

  const messages = await loadSessionMessages(sessionId);
  if (messages.length === 0) return [];

  const normalizedCurrent = currentPrompt.trim().replace(/\s+/g, " ");
  const lastMessage = messages.at(-1);
  const shouldDropLastUser =
    lastMessage?.role === "user" &&
    extractMessageText(lastMessage.content).trim().replace(/\s+/g, " ") ===
      normalizedCurrent;

  const history = shouldDropLastUser ? messages.slice(0, -1) : messages;
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: extractMessageText(message.content),
    }));
}

function buildMcpServerConfig(input: {
  gatewayBaseUrl: string;
  gatewayToken: string;
}): LocalAgentMcpServerConfig {
  const serverRoot = resolve(import.meta.dirname, "../../..");
  const mcpServerPath = resolve(import.meta.dirname, "../local-runtime/aimc-tools-mcp.ts");
  return {
    name: "aimc",
    type: "stdio",
    command: "pnpm",
    args: ["--dir", serverRoot, "exec", "tsx", mcpServerPath],
    env: {
      AIMC_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
      AIMC_TOOL_TOKEN: input.gatewayToken,
    },
  };
}

function buildArtifacts(
  toolName: string,
  output: Record<string, unknown>,
): ToolArtifact[] | undefined {
  if (
    (toolName === "generate_image" || toolName === "screenshot_canvas") &&
    typeof output.imageUrl === "string" &&
    output.imageUrl.length > 0
  ) {
    const parsed = imageArtifactSchema.safeParse({
      type: "image",
      url: output.imageUrl,
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
  if (Array.isArray(rawArtifacts)) {
    return rawArtifacts as ToolArtifact[];
  }

  return undefined;
}

function coerceToolOutput(output: unknown): Record<string, unknown> | undefined {
  const record = toRecord(output);
  if (!record) {
    return undefined;
  }
  if (record.output && typeof record.output === "object" && !Array.isArray(record.output)) {
    return record.output as Record<string, unknown>;
  }
  return record;
}

function coerceToolSummary(output: unknown, summary?: string) {
  if (summary) {
    return summary;
  }
  const record = toRecord(output);
  if (!record) {
    return undefined;
  }
  if (typeof record.outputSummary === "string") {
    return record.outputSummary;
  }
  if (typeof record.summary === "string") {
    return record.summary;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  return undefined;
}

function toAimcRunErrorCode(code: string | undefined) {
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

function adaptLocalAgentEvent(input: {
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
    const inputRecord = toRecord(event.output);
    if (
      toolName === "Bash" &&
      typeof output?.output === "string" &&
      INTERNAL_SKILL_READ_RE.test(output.output)
    ) {
      return [];
    }

    const artifacts =
      output ? buildArtifacts(toolName, output) : undefined;
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

export function createLocalCodexRuntimeProvider(
  deps: LocalCodexRuntimeProviderDeps,
) {
  const localAgentRuntime =
    deps.localAgentRuntime ??
    (deps.localAgentProvider
      ? {
          run: deps.localAgentProvider.run,
        }
      : createLocalAgentRuntime({
          providers: [createCodexProvider()],
        }));

  return {
    runtime: {
      id: "local-agent:codex",
      kind: "local-agent" as const,
      provider: "codex" as const,
      mode: "local" as const,
      status: "online" as const,
      capabilities: {
        cancel: true,
        nativeResume: true,
        streaming: true,
        toolGateway: true,
        maxConcurrentRuns: 1,
      },
    },
    async *streamRun(
      context: RuntimeExecutionContext,
    ): AsyncGenerator<StreamEvent> {
      assertLocalCodexRuntimeExecutionContext(context);
      const readyContext: LocalCodexRuntimeExecutionContext = context;

      const {
        resolvedModel,
        run,
        runtimeEnv,
        submitImageJob,
        submitVideoJob,
        workspaceSkills,
        rlog,
      } = readyContext;

      const canvasSummary = await deps.loadCanvasSummaryForRuntime(readyContext);

      let attachmentDataMap: Record<string, string> = {};
      if (run.attachments?.length) {
        const downloaded: Array<{
          assetId: string;
          base64: string;
          mimeType: string;
        }> = [];

        await Promise.all(
          run.attachments.map(async (attachment) => {
            try {
              const dataUriMatch = attachment.url.match(
                /^data:([^;]+);base64,(.+)$/,
              );
              if (dataUriMatch) {
                downloaded.push({
                  assetId: attachment.assetId,
                  mimeType: dataUriMatch[1] ?? attachment.mimeType,
                  base64: dataUriMatch[2] ?? "",
                });
                return;
              }

              const response = await fetch(attachment.url);
              const buffer = Buffer.from(await response.arrayBuffer());
              downloaded.push({
                assetId: attachment.assetId,
                mimeType:
                  attachment.mimeType ||
                  response.headers.get("content-type") ||
                  "image/png",
                base64: buffer.toString("base64"),
              });
            } catch {
              // Leave unresolved references as-is; the tool can still use raw URLs.
            }
          }),
        );

        attachmentDataMap = deps.buildAttachmentDataMap(downloaded);
      }

      const { text: enrichedPrompt } = deps.buildUserMessage(
        run.prompt,
        run.attachments ?? [],
        run.imageGenerationPreference,
        run.mentions,
        run.videoGenerationPreference,
        canvasSummary,
      );
      const prompt = [
        "You are the local Codex runtime for AI Media Canvas.",
        "If the user wants a finished visual asset, call generate_image or generate_video.",
        "Use inspect_canvas before precise canvas edits, and use manipulate_canvas for deterministic canvas updates.",
        "Do not claim an image or canvas update happened unless the tool actually succeeded.",
        enrichedPrompt,
      ].join("\n\n");

      const gatewaySession = deps.toolGateway.createSession({
        ...(run.accessToken ? { accessToken: run.accessToken } : {}),
        ...(Object.keys(attachmentDataMap).length > 0
          ? { attachmentDataMap }
          : {}),
        ...(readyContext.brandKitId ? { brandKitId: readyContext.brandKitId } : {}),
        ...(run.canvasId ? { canvasId: run.canvasId } : {}),
        ...(run.connectionId ? { connectionId: run.connectionId } : {}),
        runId: run.runId,
        runtimeEnv,
        ...(submitImageJob ? { submitImageJob } : {}),
        ...(submitVideoJob ? { submitVideoJob } : {}),
        ...(run.userId ? { userId: run.userId } : {}),
      });

      const runDir = await mkdtemp(join(tmpdir(), "aimc-local-codex-run-"));
      const history = await loadConversationHistory(
        run.sessionId,
        enrichedPrompt,
        deps.loadSessionMessages,
      );
      const skillManifest = mapWorkspaceSkillsToLocalAgentManifest(workspaceSkills);
      const mcpServers = [
        buildMcpServerConfig({
          gatewayBaseUrl: deps.toolGatewayBaseUrl,
          gatewayToken: gatewaySession.token,
        }),
      ];
      const messageId = run.assistantMessageId ?? `message_${run.runId}`;
      let terminalEmitted = false;
      let lastError: Extract<AgentEvent, { type: "error" }> | undefined;

      rlog.lap("codex_local_runtime_start");

      try {
        yield {
          type: "run.started",
          runId: run.runId,
          sessionId: run.sessionId,
          conversationId: run.conversationId,
          timestamp: deps.now(),
        };

        for await (const event of localAgentRuntime.run({
          runId: run.runId,
          provider: "codex",
          cwd: runDir,
          prompt,
          ...(history.length > 0 ? { history } : {}),
          model: normalizeCodexModel(resolvedModel),
          runtimeKind: "local-agent",
          runtimeProvider: "codex",
          mcpServers,
          signal: run.controller.signal,
          skillManifest,
        })) {
          if (event.type === "error") {
            lastError = event;
          }

          const adaptedEvents = adaptLocalAgentEvent({
            event,
            messageId,
            now: deps.now,
            runId: run.runId,
          });

          for (const adaptedEvent of adaptedEvents) {
            if (
              adaptedEvent.type === "run.completed" ||
              adaptedEvent.type === "run.canceled" ||
              adaptedEvent.type === "run.failed"
            ) {
              if (terminalEmitted) {
                continue;
              }
              terminalEmitted = true;

              if (
                adaptedEvent.type === "run.failed" &&
                lastError &&
                adaptedEvent.error.message === "Local agent run failed."
              ) {
                adaptedEvent.error = {
                  code: toAimcRunErrorCode(lastError.code),
                  message: lastError.message,
                };
              }
            }
            yield adaptedEvent;
          }
        }
      } finally {
        deps.toolGateway.revokeSession(gatewaySession.token);
        await rm(runDir, { recursive: true, force: true });
      }
    },
  };
}
