import { describe, expect, it } from "vitest";

import {
  formatLocalCliProviderLabel,
  getLocalCliProviderFallbackMark,
} from "../src/lib/agent-model-groups";

describe("agent model groups", () => {
  it("presents the nexight runtime alias as Tutti Agent", () => {
    expect(formatLocalCliProviderLabel("nexight")).toBe("Tutti Agent");
    expect(getLocalCliProviderFallbackMark("nexight")).toBe("TA");
  });
});
