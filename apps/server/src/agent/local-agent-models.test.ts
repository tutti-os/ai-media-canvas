import { describe, expect, it, vi } from "vitest";

import {
  buildLocalAgentCatalogModel,
  buildLocalAgentModels,
  buildLocalAgentProviderInfo,
  createDefaultLocalAgentModelDiscovery,
  resolveCodexImagegenAgentModel,
} from "./local-agent-models.js";

describe("local agent model helpers", () => {
  it("converts one provider catalog model through the shared projection", () => {
    expect(
      buildLocalAgentCatalogModel("vendor:agent", {
        id: "fast",
        label: "Fast",
        description: "Fast model",
      }),
    ).toEqual({
      id: "vendor:agent:fast",
      name: "Fast",
      description: "Fast model",
      provider: "vendor:agent",
      source: "local-agent",
    });
    expect(
      buildLocalAgentCatalogModel("vendor:agent", { id: "   " }),
    ).toBeNull();
  });

  it("builds local agent model ids from provider detections", () => {
    expect(
      buildLocalAgentModels([
        {
          provider: "codex",
          displayName: "Codex",
          supported: true,
          authState: "ok",
          models: [
            { id: "default", label: "Default (CLI config)" },
            { id: "gpt-5.5", label: "GPT-5.5" },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "codex:default",
        name: "Default (CLI config)",
        provider: "codex",
        source: "local-agent",
      },
      {
        id: "codex:gpt-5.5",
        name: "GPT-5.5",
        provider: "codex",
        source: "local-agent",
      },
    ]);
  });

  it("resolves Codex Imagegen agent model from detected Codex models", async () => {
    const detect = vi.fn(async () => [
      {
        provider: "codex",
        displayName: "Codex",
        supported: true,
        authState: "ok",
        models: [
          { id: "default", label: "Default (CLI config)" },
          { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
        ],
      },
    ]);

    await expect(
      resolveCodexImagegenAgentModel(undefined, {
        detect,
      }),
    ).resolves.toBe("gpt-5.4-mini");
    expect(detect).toHaveBeenCalledWith();
  });

  it("uses one flat detection projection for models and provider info", () => {
    const detections = [
      {
        provider: "codex" as const,
        displayName: "Codex",
        supported: true,
        authState: "expired" as const,
        models: [{ id: "fast", label: "Fast" }],
        defaultModelId: "fast",
      },
    ];
    expect(buildLocalAgentProviderInfo(detections)).toMatchObject([
      {
        provider: "codex",
        supported: true,
        authState: "expired",
        defaultModelId: "codex:fast",
        models: [{ id: "codex:fast" }],
      },
    ]);
  });

  it("keeps legacy provider info unique when multiple targets share a provider", () => {
    expect(
      buildLocalAgentProviderInfo([
        {
          agentTargetId: "team:designer",
          provider: "codex",
          displayName: "Designer",
          supported: true,
          authState: "ok",
          models: [{ id: "design", label: "Design" }],
        },
        {
          agentTargetId: "team:reviewer",
          provider: "codex",
          displayName: "Reviewer",
          supported: true,
          authState: "ok",
          models: [{ id: "review", label: "Review" }],
          defaultModelId: "review",
          isDefault: true,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        provider: "codex",
        defaultModelId: "codex:review",
        models: [
          expect.objectContaining({ id: "codex:review" }),
          expect.objectContaining({ id: "codex:design" }),
        ],
      }),
    ]);
  });

  it("uses configured Codex Imagegen model before detection", async () => {
    await expect(
      resolveCodexImagegenAgentModel("codex:gpt-5.5", {
        async detect() {
          throw new Error("detection should not run for configured models");
        },
      }),
    ).resolves.toBe("gpt-5.5");
  });

  it("keeps a refreshed runtime active when an older detection finishes later", async () => {
    const staleResult = [{ provider: "codex", result: null }];
    const refreshedResult = [{ provider: "tutti-agent", result: null }];
    let resolveStale: ((value: unknown) => void) | undefined;
    const staleDetection = new Promise((resolve) => {
      resolveStale = resolve;
    });
    const staleDetect = vi.fn(() => staleDetection);
    const refreshedDetect = vi.fn(async () => refreshedResult);
    const createRuntime = vi
      .fn()
      .mockReturnValueOnce({ detect: staleDetect })
      .mockReturnValueOnce({ detect: refreshedDetect });
    const discovery = createDefaultLocalAgentModelDiscovery(
      createRuntime as never,
    );

    const pendingStaleDetection = discovery.detect();
    await expect(discovery.detect({ refresh: true })).resolves.toBe(
      refreshedResult,
    );
    resolveStale?.(staleResult);
    await expect(pendingStaleDetection).resolves.toBe(staleResult);

    await expect(discovery.detect()).resolves.toBe(refreshedResult);
    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(staleDetect).toHaveBeenCalledTimes(1);
    expect(refreshedDetect).toHaveBeenNthCalledWith(1, { refresh: true });
    expect(refreshedDetect).toHaveBeenNthCalledWith(2, undefined);
  });
});
