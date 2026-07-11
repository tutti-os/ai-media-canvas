import { describe, expect, it } from "vitest";

import {
  formatLocalCliProviderLabel,
  getLocalCliProviderFallbackMark,
  localAgentProvidersFromModelResponse,
} from "../src/lib/agent-model-groups";

describe("agent model groups", () => {
  it("formats the canonical Tutti Agent provider id", () => {
    expect(formatLocalCliProviderLabel("tutti-agent")).toBe("Tutti Agent");
    expect(getLocalCliProviderFallbackMark("tutti-agent")).toBe("TA");
  });

  it("tokenizes scoped provider ids for labels and fallback marks", () => {
    expect(formatLocalCliProviderLabel("vendor:agent")).toBe("Vendor Agent");
    expect(getLocalCliProviderFallbackMark("vendor:agent")).toBe("VA");
  });

  it("does not add providers back when the current server returns an explicit empty catalog", () => {
    expect(
      localAgentProvidersFromModelResponse({
        models: [{ id: "codex:default", name: "Codex", provider: "codex" }],
        localAgentProviders: [],
      }),
    ).toEqual([]);
  });
});
