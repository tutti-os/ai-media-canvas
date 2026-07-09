import type { LocalAgentRuntime } from "@tutti-os/agent-acp-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveTuttiAgentProviderCatalog } from "./agent-provider-catalog.js";
import { toKitAgentProviderId } from "./agent-provider-id.js";
import { modelsFromTuttiComposerOptions } from "./composer-options-models.js";
import {
  parseDaemonStatusModels,
  queryTuttiAgentProviderStatuses,
} from "./tutti-daemon-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tutti agent provider catalog", () => {
  it("keeps kit-only providers when daemon status is partial and accepts available status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        const body = url.endsWith("/v1/agent-providers/status")
          ? {
              providers: [
                { provider: "codex", availability: { status: "available" } },
              ],
            }
          : {};
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const runtime = {
      detect: async () => [
        {
          provider: "codex",
          displayName: "Codex",
          result: { executablePath: "codex", models: [] },
        },
        {
          provider: "cursor",
          displayName: "Cursor",
          result: {
            executablePath: "cursor",
            models: [
              {
                id: "default",
                label: "Default",
                description: "Cursor default",
              },
            ],
          },
        },
      ],
    } as unknown as LocalAgentRuntime;

    const catalog = await resolveTuttiAgentProviderCatalog({
      runtime,
      includeComposerModels: false,
      daemon: { apiBaseUrl: "http://localhost:43120", appServerToken: "token" },
    });

    expect(catalog.providers.map((provider) => provider.provider)).toEqual([
      "codex",
      "cursor",
    ]);
    expect(catalog.providers[0]?.available).toBe(true);
    expect(catalog.providers[1]?.models[0]?.description).toBe("Cursor default");
  });

  it("uses an injected CLI runner without a configured CLI path", async () => {
    const result = await queryTuttiAgentProviderStatuses([], {
      runTuttiCli: async () => ({
        providers: [{ provider: "cursor", status: "available" }],
      }),
    });

    expect(result?.providers[0]?.provider).toBe("cursor");
  });

  it("parses string model ids and live composer defaults", () => {
    expect(
      parseDaemonStatusModels({
        provider: "cursor",
        models: ["auto", "composer-1"],
      }),
    ).toEqual([
      { id: "auto", label: "auto" },
      { id: "composer-1", label: "composer-1" },
    ]);
    expect(
      modelsFromTuttiComposerOptions({
        runtimeContext: {
          configOptions: [
            {
              id: "model",
              currentValue: "composer-1",
              options: [{ value: "composer-1", display_name: "Composer 1" }],
            },
          ],
        },
        modelConfig: { defaultValue: "auto" },
      }),
    ).toEqual({
      models: [{ id: "composer-1", label: "Composer 1" }],
      defaultModelId: "composer-1",
    });
  });

  it("preserves colons in registered provider ids", () => {
    expect(toKitAgentProviderId("vendor:agent")).toBe("vendor:agent");
  });
});
