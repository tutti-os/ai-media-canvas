import { describe, expect, it } from "vitest";

import {
  runCreateRequestSchema,
  workspaceSettingsSchema,
} from "./contracts.js";

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

  it("accepts explicit resume requests with a source run", () => {
    expect(
      runCreateRequestSchema.safeParse({
        ...baseRunCreateRequest,
        resumeFromRunId: "run_previous",
        resumeMode: "provider-local",
      }).success,
    ).toBe(true);

    expect(
      runCreateRequestSchema.safeParse({
        ...baseRunCreateRequest,
        resumeFromRunId: "run_previous",
        resumeMode: "handoff",
      }).success,
    ).toBe(true);
  });

  it("requires a source run for non-fresh resume modes", () => {
    const result = runCreateRequestSchema.safeParse({
      ...baseRunCreateRequest,
      resumeMode: "handoff",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "resumeMode requires resumeFromRunId unless resumeMode=fresh.",
          path: ["resumeFromRunId"],
        }),
      ]),
    );
  });
});

describe("workspaceSettingsSchema", () => {
  it("accepts Kie media provider settings", () => {
    const result = workspaceSettingsSchema.safeParse({
      defaultModel: "",
      providerModels: {
        openai: [],
        anthropic: [],
        agnes: [],
        google: [],
        vertex: [],
      },
      openAIApiKey: "",
      openAIApiBase: "",
      anthropicApiKey: "",
      anthropicBaseUrl: "",
      agnesApiKey: "",
      agnesBaseUrl: "",
      agnesDefaultModel: "",
      googleApiKey: "",
      googleVertexProject: "",
      googleVertexLocation: "",
      googleVertexVideoLocation: "",
      replicateApiToken: "",
      codexImagegenEnabled: false,
      volcesApiKey: "",
      volcesBaseUrl: "",
      kieApiKey: "local-kie-key",
      kieBaseUrl: "https://api.kie.ai",
    });

    expect(result.success).toBe(true);
  });
});
