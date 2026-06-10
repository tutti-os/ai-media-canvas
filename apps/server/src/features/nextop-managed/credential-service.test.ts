import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { NextopManagedConnection } from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import { createNextopManagedCredentialService } from "./credential-service.js";

function createStore() {
  let connection: NextopManagedConnection = {
    connected: false,
    providers: [],
    models: [],
  };
  return {
    clearNextopManagedConnection() {
      connection = {
        connected: false,
        providers: [],
        models: [],
      };
    },
    getNextopManagedConnection() {
      return connection;
    },
    updateNextopManagedConnection(next: NextopManagedConnection) {
      connection = next;
      return connection;
    },
  };
}

function createEnv(): ServerEnv {
  return {
    agentBackendMode: "state",
    agentModel: "openai:gpt-5.1",
    openAIApiKey: "api-provider-key",
    nextopApiBaseUrl: "http://127.0.0.1:3009",
    nextopAppId: "ai-media-canvas",
    nextopAppInstallationId: "workspace-1:ai-media-canvas",
    nextopAppServerToken: "nextop-app-token",
    nextopWorkspaceId: "workspace-1",
    port: 3001,
    version: "test",
    webOrigin: "http://localhost:3000",
  };
}

function createContextToken(env: ServerEnv) {
  const payload = {
    appId: env.nextopAppId,
    aud: env.nextopAppId,
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    installationId: env.nextopAppInstallationId,
    iss: new URL(env.nextopApiBaseUrl ?? "").origin,
    workspaceId: env.nextopWorkspaceId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", env.nextopAppServerToken ?? "")
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

async function connectService(
  service: ReturnType<typeof createNextopManagedCredentialService>,
  env: ServerEnv,
) {
  const challenge = service.createConnectChallenge();
  return service.connect({
    contextToken: createContextToken(env),
    grantCode: "grant-code",
    nonce: challenge.nonce,
    state: challenge.state,
  });
}

describe("createNextopManagedCredentialService", () => {
  it("does not resolve API Provider selections through Nextop Managed credentials", async () => {
    const env = createEnv();
    const service = createNextopManagedCredentialService({
      env,
      exchangeClient: async () => ({
        expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        grantRef: "grant-ref",
        models: [
          {
            id: "gpt-5.1",
            name: "GPT-5.1",
            provider: "openai",
          },
        ],
        providers: ["openai"],
      }),
      providerCredentialClient: async () => ({
        credential: {
          provider: "openai",
          apiKey: "nextop-managed-key",
        },
        expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      }),
      store: createStore(),
    });

    await connectService(service, env);

    const apiProviderEnv = await service.resolveEnvForModel(
      createEnv(),
      "openai:gpt-5.1",
      "api-provider",
    );
    expect(apiProviderEnv.openAIApiKey).toBe("api-provider-key");

    const nextopManagedEnv = await service.resolveEnvForModel(
      createEnv(),
      "nextop:openai:gpt-5.1",
      "nextop-managed",
    );
    expect(nextopManagedEnv.openAIApiKey).toBe("nextop-managed-key");
    expect(nextopManagedEnv.agentModel).toBe("openai:gpt-5.1");
  });

  it("revokes the Nextop grant when clearing a connection", async () => {
    const env = createEnv();
    const revokedGrantRefs: string[] = [];
    const service = createNextopManagedCredentialService({
      env,
      exchangeClient: async () => ({
        expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        grantRef: "grant-ref",
        models: [
          {
            id: "agnes-2.0-flash",
            name: "Agnes 2.0 Flash",
            provider: "agnes",
          },
        ],
        providers: ["agnes"],
      }),
      revokeClient: async ({ grantRef }) => {
        revokedGrantRefs.push(grantRef);
      },
      store: createStore(),
    });

    await connectService(service, env);
    const connection = await service.clearConnection();

    expect(revokedGrantRefs).toEqual(["grant-ref"]);
    expect(connection.connected).toBe(false);
  });

  it("rejects grant exchange when the connect challenge is missing", async () => {
    const env = createEnv();
    const service = createNextopManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        providers: ["agnes"],
      }),
      store: createStore(),
    });

    await expect(
      service.connect({
        contextToken: createContextToken(env),
        grantCode: "grant-code",
        nonce: "missing-nonce-value",
        state: "missing-state-value",
      }),
    ).rejects.toThrow("Invalid Nextop Managed connect challenge.");
  });

  it("caches provider credentials by provider and model", async () => {
    const env = createEnv();
    const requestedModels: string[] = [];
    const service = createNextopManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [
          {
            id: "model-a",
            name: "Model A",
            provider: "agnes",
          },
          {
            id: "model-b",
            name: "Model B",
            provider: "agnes",
          },
        ],
        providers: ["agnes"],
      }),
      providerCredentialClient: async ({ model }) => {
        requestedModels.push(model);
        return {
          credential: {
            provider: "agnes",
            apiKey: `key-for-${model}`,
          },
          expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        };
      },
      store: createStore(),
    });
    await connectService(service, env);

    const modelAEnv = await service.resolveEnvForModel(
      createEnv(),
      "nextop:agnes:model-a",
      "nextop-managed",
    );
    const modelBEnv = await service.resolveEnvForModel(
      createEnv(),
      "nextop:agnes:model-b",
      "nextop-managed",
    );
    const modelAEnvAgain = await service.resolveEnvForModel(
      createEnv(),
      "nextop:agnes:model-a",
      "nextop-managed",
    );

    expect(modelAEnv.agnesApiKey).toBe("key-for-model-a");
    expect(modelBEnv.agnesApiKey).toBe("key-for-model-b");
    expect(modelAEnvAgain.agnesApiKey).toBe("key-for-model-a");
    expect(requestedModels).toEqual(["model-a", "model-b"]);
  });
});
