import { afterEach, describe, expect, it } from "vitest";

import { clearProviders } from "../../generation/providers/registry.js";
import { runImageGenerate } from "./image-generate.js";

describe("runImageGenerate", () => {
  afterEach(() => {
    clearProviders();
  });

  it("returns a capability card output when image generation has no provider", async () => {
    clearProviders();

    const result = await runImageGenerate({
      title: "Poster",
      prompt: "Generate a poster",
      model: "agnes-image/seedream-v4",
    });

    expect(result.summary).toBe("media_provider_configuration_required");
    expect(result.error).toBe("media_provider_configuration_required");
    expect(result.capabilityRequired).toMatchObject({
      kind: "media_provider_configuration_required",
      capability: "image_generation",
      titleKey: "capabilityRequired.imageTitle",
      descriptionKey: "capabilityRequired.imageDescription",
      action: {
        type: "open_settings",
        tab: "media",
        labelKey: "capabilityRequired.configureMedia",
      },
    });
    expect(JSON.stringify(result.capabilityRequired)).not.toContain("连接");
  });
});
