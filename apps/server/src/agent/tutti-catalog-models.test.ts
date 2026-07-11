import { describe, expect, it } from "vitest";

import {
  buildLocalAgentModelsFromCatalog,
  buildLocalAgentProviderInfoFromCatalog,
} from "./tutti-catalog-models.js";

describe("Tutti catalog model projections", () => {
  it("uses the same model conversion for global and per-provider views", () => {
    const providers = [
      {
        provider: "vendor:agent",
        displayName: "Vendor Agent",
        available: true,
        authState: "ok" as const,
        executablePath: "/bin/vendor-agent",
        version: "1.0.0",
        models: [
          {
            id: "fast",
            label: "Fast",
            description: "Fast model",
          },
        ],
        defaultModelId: "fast",
      },
    ];

    const globalModels = buildLocalAgentModelsFromCatalog(providers);
    const providerInfo = buildLocalAgentProviderInfoFromCatalog(providers);

    expect(globalModels).toEqual([
      {
        id: "vendor:agent:fast",
        name: "Fast",
        description: "Fast model",
        provider: "vendor:agent",
        source: "local-agent",
      },
    ]);
    expect(providerInfo[0]?.models).toEqual(globalModels);
    expect(providerInfo[0]?.defaultModelId).toBe("fast");
  });
});
