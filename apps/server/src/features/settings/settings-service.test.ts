import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

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
      openAIApiKey: "",
      openAIApiBase: "",
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
      openAIApiKey: "local-openai-key",
      openAIApiBase: "http://127.0.0.1:4000/v1",
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
      openAIApiKey: "local-openai-key",
      openAIApiBase: "http://127.0.0.1:4000/v1",
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
      googleApiKey: "env-google-key",
      googleVertexProject: "local-vertex-project",
      googleVertexLocation: "asia-east1",
      googleVertexVideoLocation: "us-central1",
      replicateApiToken: "local-replicate-token",
    });
  });
});
