import { describe, expect, it, vi } from "vitest";

import {
  buildLocalAgentModels,
  resolveCodexImagegenAgentModel,
} from "./local-agent-models.js";

describe("local agent model helpers", () => {
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
});
