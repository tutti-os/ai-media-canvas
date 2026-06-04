import { describe, expect, it } from "vitest";

import {
  createHermesProvider,
  createKimiProvider,
  createKiroProvider,
} from "../../src/index.js";

describe("ACP provider wrappers", () => {
  it("exposes concrete provider plugins backed by the shared ACP transport", async () => {
    const providers = [
      createHermesProvider(),
      createKimiProvider(),
      createKiroProvider(),
    ];

    expect(providers.map((provider) => provider.id)).toEqual([
      "hermes",
      "kimi",
      "kiro",
    ]);

    for (const provider of providers) {
      const plan = await provider.buildLaunchPlan({
        runId: `run_${provider.id}`,
        cwd: "/tmp",
        prompt: "hello",
        runtimeKind: "local-agent",
        runtimeProvider: provider.id,
      });

      expect(plan.promptInput).toBe("stdin");
      expect(plan.args).toEqual(["acp"]);
      expect(provider.capabilities()).toMatchObject({
        nativeResume: false,
        streaming: true,
      });
    }
  });
});
