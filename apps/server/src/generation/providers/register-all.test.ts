import { afterEach, describe, expect, it } from "vitest";

import type { ServerEnv } from "../../config/env.js";
import { registerAllProviders } from "./register-all.js";
import {
  clearProviders,
  getAvailableImageModels,
  getAvailableVideoModels,
} from "./registry.js";

describe("registerAllProviders", () => {
  afterEach(() => {
    clearProviders();
  });

  it("registers Kie image and video providers when configured", () => {
    registerAllProviders({
      ...MINIMAL_SERVER_ENV,
      kieApiKey: "test-kie-key",
    });

    expect(getAvailableImageModels().map((model) => model.id)).toContain(
      "kie/nano-banana-pro",
    );
    expect(getAvailableVideoModels().map((model) => model.id)).toContain(
      "kie/veo-3.1",
    );
  });
});

const MINIMAL_SERVER_ENV: ServerEnv = {
  agentBackendMode: "state",
  agentModel: "mock",
  port: 0,
  version: "test",
  webOrigin: "http://localhost:3000",
};
