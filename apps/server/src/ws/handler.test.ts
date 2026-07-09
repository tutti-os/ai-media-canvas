import { createDefaultLocalAgentProviderPlugins } from "@tutti-os/agent-acp-kit";
import { describe, expect, it } from "vitest";

import { isLocalAgentRuntimeRequested } from "../agent/run-orchestrator.js";

describe("isLocalAgentRuntimeRequested", () => {
  it("detects explicit local-agent requests", () => {
    expect(isLocalAgentRuntimeRequested({ runtimeKind: "local-agent" })).toBe(
      true,
    );
    expect(isLocalAgentRuntimeRequested({ runtimeProvider: "claude" })).toBe(
      true,
    );
  });

  it("detects registered local agent model prefixes", () => {
    const providerIds = createDefaultLocalAgentProviderPlugins().map(
      (item) => item.id,
    );
    expect(providerIds.length).toBeGreaterThan(0);
    for (const provider of providerIds) {
      expect(
        isLocalAgentRuntimeRequested({ model: `${provider}:default` }),
      ).toBe(true);
    }
    expect(isLocalAgentRuntimeRequested({ model: "nextop:default" })).toBe(
      false,
    );
  });

  it("does not treat server model specifiers as local-agent requests", () => {
    expect(
      isLocalAgentRuntimeRequested({ model: "agnes:agnes-2.0-flash" }),
    ).toBe(false);
    expect(isLocalAgentRuntimeRequested({ model: "gpt-5.4" })).toBe(false);
  });
});
