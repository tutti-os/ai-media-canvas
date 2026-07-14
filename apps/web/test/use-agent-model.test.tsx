// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAgentModel } from "../src/hooks/use-agent-model";

describe("useAgentModel", () => {
  afterEach(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });

  it("rejects new local-agent selections without an exact target", () => {
    const { result } = renderHook(() => useAgentModel());

    expect(() => {
      act(() => result.current.setModel("codex:gpt-5.4", "local-agent"));
    }).toThrow("require an exact Agent Target ID");
    expect(localStorage.getItem("aimc:agent-model")).toBeNull();
  });

  it("updates its snapshot when another tab changes any selection key", () => {
    localStorage.setItem("aimc:agent-model", "codex:gpt-5.4");
    localStorage.setItem("aimc:agent-model-source", "local-agent");
    localStorage.setItem("aimc:agent-target-id", "team:designer");
    const { result } = renderHook(() => useAgentModel());

    expect(result.current.agentTargetId).toBe("team:designer");

    act(() => {
      localStorage.setItem("aimc:agent-target-id", "team:reviewer");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "aimc:agent-target-id" }),
      );
    });

    expect(result.current.agentTargetId).toBe("team:reviewer");
  });
});
