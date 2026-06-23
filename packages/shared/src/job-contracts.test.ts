import { describe, expect, it } from "vitest";

import { createImageJobRequestSchema } from "./job-contracts.js";

describe("createImageJobRequestSchema", () => {
  it("accepts optional Codex image delegation metadata for agent proxy jobs", () => {
    const result = createImageJobRequestSchema.safeParse({
      prompt: "A product poster",
      model: "codex/gpt-image-2",
      caller_provider: "claude",
      codex_imagegen_consent: "allow-once",
      codex_imagegen_delegation_allowed: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid Codex image delegation consent values", () => {
    const result = createImageJobRequestSchema.safeParse({
      prompt: "A product poster",
      model: "codex/gpt-image-2",
      caller_provider: "claude",
      codex_imagegen_consent: "always",
    });

    expect(result.success).toBe(false);
  });
});
