import { describe, expect, it } from "vitest";

import { runCreateRequestSchema } from "./contracts.js";

const baseRunCreateRequest = {
  conversationId: "canvas_1",
  prompt: "Generate an image",
  sessionId: "session_1",
};

describe("runCreateRequestSchema", () => {
  it("requires a provider when local-agent runtime is requested", () => {
    const result = runCreateRequestSchema.safeParse({
      ...baseRunCreateRequest,
      runtimeKind: "local-agent",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "runtimeKind=local-agent requires runtimeProvider.",
          path: ["runtimeProvider"],
        }),
      ]),
    );
  });

  it("accepts explicit local provider ids", () => {
    expect(
      runCreateRequestSchema.safeParse({
        ...baseRunCreateRequest,
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      }).success,
    ).toBe(true);

    expect(
      runCreateRequestSchema.safeParse({
        ...baseRunCreateRequest,
        runtimeKind: "local-agent",
        runtimeProvider: "claude",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed local provider ids", () => {
    expect(
      runCreateRequestSchema.safeParse({
        ...baseRunCreateRequest,
        runtimeKind: "local-agent",
        runtimeProvider: "",
      }).success,
    ).toBe(false);

    expect(
      runCreateRequestSchema.safeParse({
        ...baseRunCreateRequest,
        runtimeKind: "local-agent",
        runtimeProvider: "../codex",
      }).success,
    ).toBe(false);
  });
});
