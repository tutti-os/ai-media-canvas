import { describe, expect, it } from "vitest";

import { formatModelDisplayName } from "../src/components/chat/utils";

describe("chat utils", () => {
  it("keeps GPT uppercase when formatting GPT image model ids", () => {
    expect(formatModelDisplayName("codex/gpt-image-2")).toBe("GPT Image 2");
  });
});
