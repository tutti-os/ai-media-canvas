import { afterEach, describe, expect, it } from "vitest";

import { loadServerEnv } from "../../config/env.js";
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
    registerAllProviders(loadServerEnv({ kieApiKey: "test-kie-key" }, {}));

    expect(getAvailableImageModels().map((model) => model.id)).toContain(
      "kie/nano-banana-pro",
    );
    expect(getAvailableVideoModels().map((model) => model.id)).toContain(
      "kie/veo-3.1",
    );
  });

  it("registers OpenAI image models when the default official endpoint is used", () => {
    registerAllProviders(loadServerEnv({ openAIApiKey: "sk-openai" }, {}));

    expect(getAvailableImageModels()).toContainEqual(
      expect.objectContaining({
        id: "gpt-image-1",
        provider: "openai",
      }),
    );
  });

  it("registers OpenAI image models for the explicit official endpoint", () => {
    registerAllProviders(
      loadServerEnv(
        {
          openAIApiKey: "sk-openai",
          openAIApiBase: "https://api.openai.com/v1",
        },
        {},
      ),
    );

    expect(getAvailableImageModels()).toContainEqual(
      expect.objectContaining({
        id: "gpt-image-1",
        provider: "openai",
      }),
    );
  });

  it("does not expose official OpenAI image models for OpenAI-compatible gateways", () => {
    registerAllProviders(
      loadServerEnv(
        {
          openAIApiKey: "sk-compatible",
          openAIApiBase: "https://api.deepseek.com",
        },
        {},
      ),
    );

    expect(getAvailableImageModels()).not.toContainEqual(
      expect.objectContaining({
        id: "gpt-image-1",
        provider: "openai",
      }),
    );
  });
});
