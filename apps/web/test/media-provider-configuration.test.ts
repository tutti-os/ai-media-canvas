import { describe, expect, it } from "vitest";

import {
  type MediaProviderSettings,
  hasConfiguredImageProvider,
  isMediaProviderConfigured,
} from "../src/lib/media-provider-configuration";

const BASE_SETTINGS: MediaProviderSettings = {
  agnesApiKey: "",
  replicateApiToken: "",
  googleApiKey: "",
  googleVertexProject: "",
  googleVertexLocation: "",
  openAIApiKey: "",
  openAIApiBase: "",
  kieApiKey: "",
  volcesApiKey: "",
};

describe("media provider configuration", () => {
  it("treats blank OpenAI base URL as official image configuration", () => {
    const settings = {
      ...BASE_SETTINGS,
      openAIApiKey: "sk-openai",
    };

    expect(hasConfiguredImageProvider(settings)).toBe(true);
    expect(isMediaProviderConfigured("openai", "image", settings)).toBe(true);
  });

  it("treats the explicit OpenAI API URL as official image configuration", () => {
    const settings = {
      ...BASE_SETTINGS,
      openAIApiKey: "sk-openai",
      openAIApiBase: "https://api.openai.com/v1",
    };

    expect(hasConfiguredImageProvider(settings)).toBe(true);
    expect(isMediaProviderConfigured("openai", "image", settings)).toBe(true);
  });

  it("treats the RayinAI gateway as an OpenAI image configuration", () => {
    const settings = {
      ...BASE_SETTINGS,
      openAIApiKey: "sk-compatible",
      openAIApiBase: "https://code.rayinai.com",
    };

    expect(hasConfiguredImageProvider(settings)).toBe(true);
    expect(isMediaProviderConfigured("openai", "image", settings)).toBe(true);
  });

  it("does not treat OpenAI-compatible gateways as official image configuration", () => {
    const settings = {
      ...BASE_SETTINGS,
      openAIApiKey: "sk-compatible",
      openAIApiBase: "https://api.deepseek.com",
    };

    expect(hasConfiguredImageProvider(settings)).toBe(false);
    expect(isMediaProviderConfigured("openai", "image", settings)).toBe(false);
  });

  it("treats Codex imagegen as configured when the backend exposes it", () => {
    expect(
      isMediaProviderConfigured("codex-imagegen", "image", BASE_SETTINGS),
    ).toBe(true);
    expect(
      isMediaProviderConfigured("codex-imagegen", "video", BASE_SETTINGS),
    ).toBe(false);
  });
});
