import { afterEach, describe, expect, it } from "vitest";

import {
  FALLBACK_IMAGE_MODEL,
  getDefaultImageModelId,
} from "./default-models.js";
import { clearProviders, registerImageProvider } from "./providers/registry.js";
import type { ImageProvider } from "./types.js";

describe("generation default models", () => {
  afterEach(() => {
    clearProviders();
  });

  it("uses the first registered image model before the fallback model", () => {
    const provider: ImageProvider = {
      name: "test-image",
      models: [
        {
          id: "agnes-image/agnes-image-2.1-flash",
          displayName: "Agnes Image 2.1 Flash",
          description: "Test model",
        },
      ],
      async generate() {
        throw new Error("not used");
      },
    };
    registerImageProvider(provider);

    expect(getDefaultImageModelId()).toBe("agnes-image/agnes-image-2.1-flash");
  });

  it("falls back when no image providers are registered", () => {
    expect(getDefaultImageModelId()).toBe(FALLBACK_IMAGE_MODEL);
  });
});
