import { describe, expect, it } from "vitest";
import { createDefaultLocalAgentProviderPlugins } from "@tutti-os/agent-acp-kit";

import { createAimcLocalAgentProviderPlugins } from "./local-agent-providers.js";

async function collect<T>(stream: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe("createAimcLocalAgentProviderPlugins", () => {
  it("registers every default local agent provider", () => {
    const providerIds = createAimcLocalAgentProviderPlugins().map(
      (provider) => provider.id,
    );
    const defaultProviderIds = createDefaultLocalAgentProviderPlugins().map(
      (provider) => provider.id,
    );

    expect(providerIds).toEqual(defaultProviderIds);
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
