import { describe, expect, it, vi } from "vitest";

import {
  buildLocalAgentCatalogModel,
  buildLocalAgentModels,
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
          result: {
            supported: true,
            models: [
              { id: "default", label: "Default (CLI config)" },
              { id: "gpt-5.5", label: "GPT-5.5" },
            ],
          },
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
        result: {
          supported: true,
          models: [
            { id: "default", label: "Default (CLI config)" },
            { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
          ],
        },
      },
    ]);

    await expect(
      resolveCodexImagegenAgentModel(undefined, {
        detect,
      }),
    ).resolves.toBe("gpt-5.4-mini");
    expect(detect).toHaveBeenCalledWith();
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
