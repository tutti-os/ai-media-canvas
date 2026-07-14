// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchModelsMock, fetchWorkspaceSettingsMock, selection, setModelMock } =
  vi.hoisted(() => ({
    fetchModelsMock: vi.fn(),
    fetchWorkspaceSettingsMock: vi.fn(),
    selection: {
      agentTargetId: null as string | null,
      model: "codex:gpt-5.4" as string | null,
      modelSource: "local-agent" as const,
    },
    setModelMock: vi.fn(),
  }));

vi.mock("../src/lib/server-api", () => ({
  fetchModels: fetchModelsMock,
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
}));

vi.mock("../src/hooks/use-agent-model", () => ({
  useAgentModel: () => ({ ...selection, setModel: setModelMock }),
}));

import { useAgentModelRequirement } from "../src/hooks/use-agent-model-requirement";

describe("useAgentModelRequirement", () => {
  beforeEach(() => {
    setModelMock.mockReset();
    fetchModelsMock.mockReset();
    fetchWorkspaceSettingsMock.mockReset();
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: { defaultModel: "", defaultModelSource: undefined },
    });
    selection.model = "codex:gpt-5.4";
    selection.agentTargetId = null;
  });

  it("migrates a unique legacy provider selection to its exact target", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [],
      localAgentProviders: [],
      localAgentTargets: [
        {
          agentTargetId: "team:designer",
          providerId: "codex",
          available: true,
        },
      ],
    });
    const { result } = renderHook(() => useAgentModelRequirement());
    await waitFor(() =>
      expect(result.current.isAgentModelConfigurationLoaded).toBe(true),
    );

    let available = false;
    await act(async () => {
      available = await result.current.ensureAgentModelConfigured();
    });

    expect(available).toBe(true);
    expect(setModelMock).toHaveBeenCalledWith(
      "codex:gpt-5.4",
      "local-agent",
      "team:designer",
    );
  });

  it("rejects a stale exact target whose provider does not match the model", async () => {
    selection.agentTargetId = "team:reviewer";
    fetchModelsMock.mockResolvedValue({
      models: [],
      localAgentProviders: [],
      localAgentTargets: [
        {
          agentTargetId: "team:reviewer",
          providerId: "claude-code",
          available: true,
        },
      ],
    });
    const { result } = renderHook(() => useAgentModelRequirement());
    await waitFor(() =>
      expect(result.current.isAgentModelConfigurationLoaded).toBe(true),
    );

    let available = true;
    await act(async () => {
      available = await result.current.ensureAgentModelConfigured();
    });

    expect(available).toBe(false);
    expect(setModelMock).not.toHaveBeenCalled();
  });
});
