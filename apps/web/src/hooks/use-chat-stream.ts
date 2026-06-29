"use client";

import { useCallback } from "react";

import type {
  ContentBlock,
  StreamEvent,
  ToolArtifact,
  ToolBlock,
} from "@aimc/shared";
import type { Message } from "./use-chat-sessions";

type MessageUpdater = (
  targetSessionId: string,
  updater: (prev: Message[]) => Message[],
) => void;

const upsertToolBlock = (
  existingBlocks: ContentBlock[],
  block: ToolBlock,
): ContentBlock[] => {
  const existingIndex = existingBlocks.findIndex(
    (item) => item.type === "tool" && item.toolCallId === block.toolCallId,
  );
  if (existingIndex < 0) {
    return [...existingBlocks, block];
  }
  return existingBlocks.map((item, index) =>
    index === existingIndex ? block : item,
  );
};

const mergeToolArtifacts = (
  existing: ToolArtifact[] | undefined,
  next: ToolArtifact[],
): ToolArtifact[] => {
  const artifacts = [...(existing ?? [])];
  for (const artifact of next) {
    const duplicate = artifacts.some(
      (item) =>
        item.type === artifact.type &&
        item.url === artifact.url &&
        item.jobId === artifact.jobId,
    );
    if (!duplicate) artifacts.push(artifact);
  }
  return artifacts;
};

const CANCELED_OUTPUT_SUMMARY = "\u5df2\u53d6\u6d88";

function normalizeMediaToolName(toolName: string): string {
  if (toolName === "image_generate") return "generate_image";
  if (toolName === "video_generate") return "generate_video";
  return toolName;
}

function isDeferredMediaToolBlock(block: ToolBlock): boolean {
  const toolName = normalizeMediaToolName(block.toolName);
  if (toolName !== "generate_image" && toolName !== "generate_video") {
    return false;
  }

  const output = block.output as Record<string, unknown> | undefined;
  return (
    block.status === "completed" &&
    output?.status === "generating" &&
    typeof output.jobId === "string"
  );
}

function isCancelableToolBlock(block: ToolBlock): boolean {
  return block.status === "running" || isDeferredMediaToolBlock(block);
}

function cancelToolBlock(block: ToolBlock): ToolBlock {
  const shouldMarkOutputCanceled =
    Boolean(block.output) || isDeferredMediaToolBlock(block);
  const canceledBlock: ToolBlock = {
    ...block,
    status: "canceled",
    outputSummary: CANCELED_OUTPUT_SUMMARY,
  };

  return shouldMarkOutputCanceled
    ? {
        ...canceledBlock,
        output: {
          ...(block.output ?? {}),
          status: "canceled",
        },
      }
    : canceledBlock;
}

/**
 * Extracts the stream event handling logic into a reusable hook.
 * Used by both the main send flow and the reconnection resume flow,
 * eliminating the ~70 lines of duplicated event-handling code.
 */
function isCodexImagegenConfirmationFailure(event: StreamEvent) {
  return (
    event.type === "tool.failed" &&
    event.error.code === "codex_imagegen_confirmation_required"
  );
}

export function useChatStream(updateSessionMessages: MessageUpdater) {
  /**
   * Apply a single StreamEvent to the assistant message identified by assistantId
   * in the given session. This is the single source of truth for how events
   * mutate the message list.
   *
   * Edge case handling:
   * - Empty deltas are ignored to prevent unnecessary re-renders
   * - Missing assistantId in message list is tolerated (logged, not thrown)
   * - Duplicate tool.started events for the same toolCallId are safely deduplicated
   * - Unknown event types from newer server versions are silently ignored
   */
  const applyStreamEvent = useCallback(
    (event: StreamEvent, assistantId: string, sessionId: string) => {
      if (!assistantId || !sessionId) {
        console.warn(
          "[chat-stream] applyStreamEvent called with missing ids:",
          {
            assistantId,
            sessionId,
            eventType: event.type,
          },
        );
        return;
      }

      const update = (updater: (prev: Message[]) => Message[]) =>
        updateSessionMessages(sessionId, updater);

      switch (event.type) {
        case "message.delta": {
          // Skip truly empty deltas -- they cause unnecessary re-renders
          const delta = event.delta;
          if (delta === undefined || delta === null) break;

          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const blocks = [...m.contentBlocks];
              const last = blocks[blocks.length - 1];
              if (last && last.type === "text") {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + delta,
                };
              } else {
                blocks.push({ type: "text", text: delta });
              }
              return { ...m, contentBlocks: blocks };
            }),
          );
          break;
        }

        case "thinking.delta": {
          const delta = event.delta;
          if (delta === undefined || delta === null) break;

          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const blocks = [...m.contentBlocks];
              const last = blocks[blocks.length - 1];
              if (last && last.type === "thinking") {
                blocks[blocks.length - 1] = {
                  ...last,
                  thinking: last.thinking + delta,
                };
              } else {
                blocks.push({ type: "thinking", thinking: delta });
              }
              return { ...m, contentBlocks: blocks };
            }),
          );
          break;
        }

        case "tool.started":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const newBlock: ToolBlock = {
                type: "tool",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "running",
                ...(event.input ? { input: event.input } : {}),
              };
              return {
                ...m,
                contentBlocks: upsertToolBlock(m.contentBlocks, newBlock),
              };
            }),
          );
          break;

        case "tool.completed":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const existingBlock = m.contentBlocks.find(
                (block) =>
                  block.type === "tool" &&
                  block.toolCallId === event.toolCallId,
              ) as ToolBlock | undefined;
              const completedBlock: ToolBlock = {
                type: "tool",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "completed",
                ...(existingBlock?.input ? { input: existingBlock.input } : {}),
                ...(event.output ? { output: event.output } : {}),
                ...(event.outputSummary
                  ? { outputSummary: event.outputSummary }
                  : {}),
                ...(event.artifacts ? { artifacts: event.artifacts } : {}),
              };
              return {
                ...m,
                contentBlocks: upsertToolBlock(m.contentBlocks, completedBlock),
              };
            }),
          );
          break;

        case "tool.failed":
          if (isCodexImagegenConfirmationFailure(event)) {
            break;
          }
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const existingBlock = m.contentBlocks.find(
                (block) =>
                  block.type === "tool" &&
                  block.toolCallId === event.toolCallId,
              ) as ToolBlock | undefined;
              const failedBlock: ToolBlock = {
                type: "tool",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "failed",
                ...(existingBlock?.input ? { input: existingBlock.input } : {}),
                ...(event.output ? { output: event.output } : {}),
                outputSummary:
                  event.outputSummary ??
                  event.error.message ??
                  existingBlock?.outputSummary,
                ...(event.artifacts ? { artifacts: event.artifacts } : {}),
              };
              return {
                ...m,
                contentBlocks: upsertToolBlock(m.contentBlocks, failedBlock),
              };
            }),
          );
          break;

        case "run.failed": {
          console.warn("[chat-stream] run.failed:", event.error.message);
          const failureMessage =
            event.error.message
              .split("\n")
              .map((line) => line.trim())
              .find(Boolean) ?? "抱歉，处理过程中遇到问题，请重试。";
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              // Mark all running tool blocks as failed so spinners stop while preserving error state
              const blocks = m.contentBlocks.map((block) =>
                block.type === "tool" && block.status === "running"
                  ? {
                      ...block,
                      status: "failed" as const,
                      outputSummary: "\u5904\u7406\u5931\u8d25",
                    }
                  : block,
              );
              const hasText = blocks.some((b) => b.type === "text");
              return {
                ...m,
                contentBlocks: hasText
                  ? blocks
                  : [
                      ...blocks,
                      {
                        type: "text" as const,
                        text: `抱歉，处理过程中遇到问题：${failureMessage}`,
                      },
                    ],
              };
            }),
          );
          break;
        }

        case "run.canceled":
          // Clean up active tool UI when a run stops before completion. Deferred
          // media jobs have already emitted tool.completed, but still render as
          // active until their backend job resolves.
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const hasCancelable = m.contentBlocks.some(
                (b) => b.type === "tool" && isCancelableToolBlock(b),
              );
              if (!hasCancelable) return m;
              return {
                ...m,
                contentBlocks: m.contentBlocks.map((block) =>
                  block.type === "tool" && isCancelableToolBlock(block)
                    ? cancelToolBlock(block)
                    : block,
                ),
              };
            }),
          );
          break;

        default:
          // Unknown event types are silently ignored -- new event types may be
          // added server-side before the frontend is updated
          break;
      }
    },
    [updateSessionMessages],
  );

  const updateToolBlock = useCallback(
    (
      sessionId: string,
      toolCallId: string,
      updater: (block: ToolBlock) => ToolBlock,
    ) => {
      if (!sessionId || !toolCallId) return;
      updateSessionMessages(sessionId, (prev) =>
        prev.map((message) => {
          let changed = false;
          const contentBlocks = message.contentBlocks.map((block) => {
            if (block.type !== "tool" || block.toolCallId !== toolCallId) {
              return block;
            }
            changed = true;
            return updater(block);
          });
          return changed ? { ...message, contentBlocks } : message;
        }),
      );
    },
    [updateSessionMessages],
  );

  const completeToolBlockWithArtifacts = useCallback(
    (
      sessionId: string,
      toolCallId: string,
      artifacts: ToolArtifact[],
      outputPatch?: Record<string, unknown>,
    ) => {
      updateToolBlock(sessionId, toolCallId, (block) => ({
        ...block,
        status: "completed",
        output: {
          ...(block.output ?? {}),
          ...(outputPatch ?? {}),
          status: "succeeded",
        },
        artifacts: mergeToolArtifacts(block.artifacts, artifacts),
      }));
    },
    [updateToolBlock],
  );

  const failToolBlock = useCallback(
    (sessionId: string, toolCallId: string, errorMessage: string) => {
      updateToolBlock(sessionId, toolCallId, (block) => ({
        ...block,
        status: "failed",
        output: {
          ...(block.output ?? {}),
          status: "failed",
          error: errorMessage,
        },
        outputSummary: errorMessage,
      }));
    },
    [updateToolBlock],
  );

  return { applyStreamEvent, completeToolBlockWithArtifacts, failToolBlock };
}

export function materializeAssistantBlocksFromEvents(
  events: StreamEvent[],
): ContentBlock[] {
  let blocks: ContentBlock[] = [];

  const updateBlocks = (updater: (prev: ContentBlock[]) => ContentBlock[]) => {
    blocks = updater(blocks);
  };

  const applyMaterializedEvent = (event: StreamEvent) => {
    switch (event.type) {
      case "message.delta": {
        const delta = event.delta;
        if (delta === undefined || delta === null) break;

        updateBlocks((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.type === "text") {
            next[next.length - 1] = {
              ...last,
              text: last.text + delta,
            };
          } else {
            next.push({ type: "text", text: delta });
          }
          return next;
        });
        break;
      }

      case "thinking.delta": {
        const delta = event.delta;
        if (delta === undefined || delta === null) break;

        updateBlocks((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.type === "thinking") {
            next[next.length - 1] = {
              ...last,
              thinking: last.thinking + delta,
            };
          } else {
            next.push({ type: "thinking", thinking: delta });
          }
          return next;
        });
        break;
      }

      case "tool.started": {
        updateBlocks((prev) =>
          upsertToolBlock(prev, {
            type: "tool",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: "running",
            ...(event.input ? { input: event.input } : {}),
          }),
        );
        break;
      }

      case "tool.completed": {
        const existingBlock = blocks.find(
          (block) =>
            block.type === "tool" && block.toolCallId === event.toolCallId,
        ) as ToolBlock | undefined;
        updateBlocks((prev) =>
          upsertToolBlock(prev, {
            type: "tool",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: "completed",
            ...(existingBlock?.input ? { input: existingBlock.input } : {}),
            ...(event.output ? { output: event.output } : {}),
            ...(event.outputSummary
              ? { outputSummary: event.outputSummary }
              : {}),
            ...(event.artifacts ? { artifacts: event.artifacts } : {}),
          }),
        );
        break;
      }

      case "tool.failed": {
        if (isCodexImagegenConfirmationFailure(event)) {
          break;
        }
        const existingBlock = blocks.find(
          (block) =>
            block.type === "tool" && block.toolCallId === event.toolCallId,
        ) as ToolBlock | undefined;
        updateBlocks((prev) =>
          upsertToolBlock(prev, {
            type: "tool",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: "failed",
            ...(existingBlock?.input ? { input: existingBlock.input } : {}),
            ...(event.output ? { output: event.output } : {}),
            outputSummary:
              event.outputSummary ??
              event.error.message ??
              existingBlock?.outputSummary,
            ...(event.artifacts ? { artifacts: event.artifacts } : {}),
          }),
        );
        break;
      }

      case "run.failed": {
        updateBlocks((prev) => {
          const next = prev.map((block) =>
            block.type === "tool" && block.status === "running"
              ? {
                  ...block,
                  status: "failed" as const,
                  outputSummary: "\u5904\u7406\u5931\u8d25",
                }
              : block,
          );
          const hasText = next.some((block) => block.type === "text");
          if (hasText) return next;
          return [
            ...next,
            {
              type: "text" as const,
              text: `抱歉，处理过程中遇到问题：${
                event.error.message
                  .split("\n")
                  .map((line) => line.trim())
                  .find(Boolean) ?? "抱歉，处理过程中遇到问题，请重试。"
              }`,
            },
          ];
        });
        break;
      }

      case "run.canceled": {
        updateBlocks((prev) =>
          prev.map((block) =>
            block.type === "tool" && isCancelableToolBlock(block)
              ? cancelToolBlock(block)
              : block,
          ),
        );
        break;
      }

      default:
        break;
    }
  };

  for (const event of events) {
    applyMaterializedEvent(event);
  }

  return blocks;
}
