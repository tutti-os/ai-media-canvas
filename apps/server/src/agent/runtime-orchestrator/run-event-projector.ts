import type { ContentBlock, StreamEvent, ToolBlock } from "@aimc/shared";

export type AssistantMessageProjection = {
  blocks: ContentBlock[];
  textParts: string[];
};

export function createAssistantMessageProjection(): AssistantMessageProjection {
  return {
    blocks: [],
    textParts: [],
  };
}

export function projectStreamEventToAssistantMessage(
  state: AssistantMessageProjection,
  event: StreamEvent,
) {
  if (event.type === "message.delta") {
    const lastBlock = state.blocks[state.blocks.length - 1];
    if (lastBlock?.type === "text") {
      lastBlock.text += event.delta;
    } else {
      state.blocks.push({ type: "text", text: event.delta });
    }
    state.textParts.push(event.delta);
    return;
  }

  if (event.type === "tool.started") {
    const index = state.blocks.findIndex(
      (block) =>
        block.type === "tool" && block.toolCallId === event.toolCallId,
    );
    const nextBlock = {
      type: "tool",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: "running",
      ...(event.input ? { input: event.input } : {}),
    } satisfies ToolBlock;
    if (index >= 0) {
      state.blocks[index] = nextBlock;
    } else {
      state.blocks.push(nextBlock);
    }
    return;
  }

  if (event.type === "tool.completed" || event.type === "tool.failed") {
    const index = state.blocks.findIndex(
      (block) =>
        block.type === "tool" && block.toolCallId === event.toolCallId,
    );
    const currentBlock =
      index >= 0
        ? (state.blocks[index] as ToolBlock)
        : {
            type: "tool" as const,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: "running" as const,
          };
    const nextBlock: ToolBlock = {
      ...currentBlock,
      status: event.type === "tool.completed" ? "completed" : "failed",
      ...(event.output ? { output: event.output } : {}),
      ...(event.outputSummary
        ? { outputSummary: event.outputSummary }
        : event.type === "tool.failed"
          ? { outputSummary: event.error.message }
          : {}),
      ...(event.artifacts ? { artifacts: event.artifacts } : {}),
    };
    if (index < 0) {
      state.blocks.push(nextBlock);
    } else {
      state.blocks[index] = nextBlock;
    }
    return;
  }

  if (event.type === "run.failed" && state.textParts.length === 0) {
    const message = `抱歉，处理过程中遇到问题：${event.error.message}`;
    state.blocks.push({ type: "text", text: message });
    state.textParts.push(message);
  }
}
