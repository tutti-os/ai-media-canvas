import { describe, expect, it } from "vitest";

import {
  augmentClaudeDetectionModels,
  createAimcLocalAgentProviderPlugins,
} from "./local-agent-providers.js";

async function collect<T>(stream: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe("createAimcLocalAgentProviderPlugins", () => {
  it("adds Claude Code configured models after the CLI default option", () => {
    const detection = augmentClaudeDetectionModels(
      {
        authState: "unknown",
        executablePath: "claude",
        models: [
          { id: "default", label: "Default (CLI config)" },
          { id: "sonnet", label: "Sonnet (alias)" },
        ],
        supported: true,
        version: "2.1.162",
      },
      ["minimax-m2.5", "sonnet", "minimax-m2.5"],
    );

    expect(detection?.models).toEqual([
      { id: "default", label: "Default (CLI config)" },
      { id: "minimax-m2.5", label: "minimax-m2.5" },
      { id: "sonnet", label: "Sonnet (alias)" },
    ]);
  });

  it("maps current Claude Code assistant stream-json content into text deltas", async () => {
    const claude = createAimcLocalAgentProviderPlugins().find(
      (provider) => provider.id === "claude",
    );
    const adapter = claude?.createAdapter?.();
    expect(adapter).toBeDefined();

    async function* rawStream() {
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: "<reasoning>thinking</reasoning>\n\nClaude OK",
            },
          ],
        },
      };
    }

    const events = await collect(adapter.parseEvents(rawStream()));

    expect(events).toEqual([
      { type: "thinking", text: "thinking" },
      { type: "text_delta", text: "Claude OK" },
    ]);
  });

  it("falls back to Claude Code result text when no assistant item was emitted", async () => {
    const claude = createAimcLocalAgentProviderPlugins().find(
      (provider) => provider.id === "claude",
    );
    const adapter = claude?.createAdapter?.();
    expect(adapter).toBeDefined();

    async function* rawStream() {
      yield {
        type: "result",
        is_error: false,
        result: "Claude result OK",
      };
    }

    const events = await collect(adapter.parseEvents(rawStream()));

    expect(events).toEqual([{ type: "text_delta", text: "Claude result OK" }]);
  });
});
