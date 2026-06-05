import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/types.js";
import { loadServerEnv } from "../../config/env.js";
import { createLocalStore } from "../../local/store.js";
import { createSettingsService } from "./settings-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const LOCAL_USER: AuthenticatedUser = {
  id: "local-user",
  email: "local@aimc.app",
  userMetadata: { mode: "local" },
};

describe("createSettingsService", () => {
  it("uses Agnes built-in defaults when only Agnes API key is configured", async () => {
    const env = loadServerEnv({}, {
      AGNES_API_KEY: "env-agnes-key",
    });

    expect(env).toMatchObject({
      agnesApiKey: "env-agnes-key",
      agnesBaseUrl: "https://apihub.agnes-ai.com/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      agentModel: "agnes:agnes-2.0-flash",
    });
  });

  it("keeps persisted settings separate from env fallback and resolves an effective env", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-settings-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const env = loadServerEnv({
      agentModel: "openai:gpt-4o-mini",
      openAIApiKey: "env-openai-key",
      agnesApiKey: "env-agnes-key",
      agnesBaseUrl: "https://env.agnes.example/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleApiKey: "env-google-key",
      googleVertexProject: "env-vertex-project",
      googleVertexLocation: "global",
      googleVertexVideoLocation: "us-central1",
    });
    const service = createSettingsService(store, env);

    await expect(
      service.getWorkspaceSettings(LOCAL_USER, "local-workspace"),
    ).resolves.toEqual({
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
      volcesApiKey: "",
      volcesBaseUrl: "",
    });

    await service.updateWorkspaceSettings(LOCAL_USER, "local-workspace", {
      defaultModel: "google:gemini-2.5-flash",
      providerModels: {
        openai: ["openai:gpt-4.1"],
        anthropic: ["anthropic:claude-sonnet-4-5"],
        agnes: ["agnes:agnes-2.0-flash"],
        google: ["google:gemini-2.5-flash"],
        vertex: [],
      },
      openAIApiKey: "local-openai-key",
      openAIApiBase: "http://127.0.0.1:4000/v1",
      anthropicApiKey: "local-anthropic-key",
      anthropicBaseUrl: "https://anthropic.example",
      agnesApiKey: "local-agnes-key",
      agnesBaseUrl: "https://local.agnes.example/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleApiKey: "",
      googleVertexProject: "local-vertex-project",
      googleVertexLocation: "asia-east1",
      googleVertexVideoLocation: "us-central1",
      replicateApiToken: "local-replicate-token",
      volcesApiKey: "",
      volcesBaseUrl: "",
    });

    await expect(
      service.getWorkspaceSettings(LOCAL_USER, "local-workspace"),
    ).resolves.toMatchObject({
      defaultModel: "google:gemini-2.5-flash",
      providerModels: {
        openai: ["openai:gpt-4.1"],
        anthropic: ["anthropic:claude-sonnet-4-5"],
        agnes: ["agnes:agnes-2.0-flash"],
        google: ["google:gemini-2.5-flash"],
        vertex: [],
      },
      openAIApiKey: "local-openai-key",
      openAIApiBase: "http://127.0.0.1:4000/v1",
      anthropicApiKey: "local-anthropic-key",
      anthropicBaseUrl: "https://anthropic.example",
      agnesApiKey: "local-agnes-key",
      agnesBaseUrl: "https://local.agnes.example/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleVertexProject: "local-vertex-project",
      googleVertexLocation: "asia-east1",
      googleVertexVideoLocation: "us-central1",
      replicateApiToken: "local-replicate-token",
    });

    await expect(
      service.getEffectiveServerEnv("local-workspace"),
    ).resolves.toMatchObject({
      agentModel: "google:gemini-2.5-flash",
      openAIApiKey: "local-openai-key",
      openAIApiBase: "http://127.0.0.1:4000/v1",
      anthropicApiKey: "local-anthropic-key",
      anthropicBaseUrl: "https://anthropic.example",
      agnesApiKey: "local-agnes-key",
      agnesBaseUrl: "https://local.agnes.example/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleApiKey: "env-google-key",
      googleVertexProject: "local-vertex-project",
      googleVertexLocation: "asia-east1",
      googleVertexVideoLocation: "us-central1",
      replicateApiToken: "local-replicate-token",
    });
  });

  it("uses Agnes workspace default model when defaultModel is empty", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-settings-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const env = loadServerEnv({}, {});
    const service = createSettingsService(store, env);

    await service.updateWorkspaceSettings(LOCAL_USER, "local-workspace", {
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
      agnesApiKey: "local-agnes-key",
      agnesBaseUrl: "",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
      googleApiKey: "",
      googleVertexProject: "",
      googleVertexLocation: "",
      googleVertexVideoLocation: "",
      replicateApiToken: "",
      volcesApiKey: "",
      volcesBaseUrl: "",
    });

    await expect(
      service.getEffectiveServerEnv("local-workspace"),
    ).resolves.toMatchObject({
      agentModel: "agnes:agnes-2.0-flash",
      agnesApiKey: "local-agnes-key",
      agnesBaseUrl: "https://apihub.agnes-ai.com/v1",
      agnesDefaultModel: "agnes:agnes-2.0-flash",
    });
  });

  it("preserves explicit env agentModel ahead of Agnes built-in fallback", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-settings-"));
    tempDirs.push(dataRoot);
    const env = loadServerEnv({
      agentModel: "openai:gpt-4.1",
      agnesApiKey: "env-agnes-key",
    });

    const effectiveEnv = await createSettingsService(
      createLocalStore({
        assetBaseUrl: "http://127.0.0.1:3001",
        dataRoot,
      }),
      env,
    ).getEffectiveServerEnv("local-workspace");

    expect(effectiveEnv.agentModel).toBe("openai:gpt-4.1");
    expect(effectiveEnv.agnesDefaultModel).toBe("agnes:agnes-2.0-flash");
  });

  it("resolves local CLI default models to the first concrete detected model", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-settings-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const service = createSettingsService(store, loadServerEnv({}, {}), {
      localAgentModelDiscovery: {
        detect: vi.fn().mockResolvedValue([
          {
            provider: "codex",
            result: {
              supported: true,
              models: [
                { id: "default", label: "Default (CLI config)" },
                { id: "gpt-5.5", label: "gpt-5.5" },
                { id: "gpt-5.4", label: "gpt-5.4" },
              ],
            },
          },
        ]),
      },
    });

    await service.updateWorkspaceSettings(LOCAL_USER, "local-workspace", {
      defaultModel: "codex:default",
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
      volcesApiKey: "",
      volcesBaseUrl: "",
    });

    await expect(
      service.getWorkspaceSettings(LOCAL_USER, "local-workspace"),
    ).resolves.toMatchObject({
      defaultModel: "codex:default",
    });
    await expect(
      service.getEffectiveServerEnv("local-workspace"),
    ).resolves.toMatchObject({
      agentModel: "codex:gpt-5.5",
    });
  });
});
