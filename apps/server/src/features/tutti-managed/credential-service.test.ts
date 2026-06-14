import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { TuttiManagedConnection } from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import { createTuttiManagedCredentialService } from "./credential-service.js";

function createStore() {
  let connection: TuttiManagedConnection = {
    connected: false,
    providers: [],
    models: [],
  };
  return {
    clearTuttiManagedConnection() {
      connection = {
        connected: false,
        providers: [],
        models: [],
      };
    },
    getTuttiManagedConnection() {
      return connection;
    },
    updateTuttiManagedConnection(next: TuttiManagedConnection) {
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
    tuttiApiBaseUrl: "http://127.0.0.1:3009",
    tuttiAppId: "ai-media-canvas",
    tuttiAppInstallationId: "workspace-1:ai-media-canvas",
    tuttiAppServerToken: "tutti-app-token",
    tuttiWorkspaceId: "workspace-1",
    port: 3001,
    version: "test",
    webOrigin: "http://localhost:3000",
  };
}

function createContextToken(env: ServerEnv) {
  const payload = {
    appId: env.tuttiAppId,
    aud: env.tuttiAppId,
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    installationId: env.tuttiAppInstallationId,
    iss: new URL(env.tuttiApiBaseUrl ?? "").origin,
    workspaceId: env.tuttiWorkspaceId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", env.tuttiAppServerToken ?? "")
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

async function connectService(
  service: ReturnType<typeof createTuttiManagedCredentialService>,
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

describe("createTuttiManagedCredentialService", () => {
  it("does not resolve API Provider selections through Tutti Managed credentials", async () => {
    const env = createEnv();
    const service = createTuttiManagedCredentialService({
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
          apiKey: "tutti-managed-key",
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

    await expect(service.listModels()).resolves.toEqual([
      {
        id: "tutti:openai:gpt-5.1",
        name: "GPT-5.1",
        provider: "openai",
        source: "tutti-managed",
      },
    ]);

    const tuttiManagedEnv = await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(tuttiManagedEnv.openAIApiKey).toBe("tutti-managed-key");
    expect(tuttiManagedEnv.agentModel).toBe("openai:gpt-5.1");
  });

  it("resolves Tutti-prefixed models even when the stored source is stale", async () => {
    const env = createEnv();
    const requestedModels: string[] = [];
    const service = createTuttiManagedCredentialService({
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
      providerCredentialClient: async ({ model }) => {
        requestedModels.push(model);
        return {
          credential: {
            provider: "agnes",
            apiKey: "tutti-managed-agnes-key",
            baseUrl: "https://managed.agnes.example/v1",
          },
          expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        };
      },
      store: createStore(),
    });

    await connectService(service, env);

    const resolvedEnv = await service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:agnes-2.0-flash",
      "api-provider",
    );

    expect(resolvedEnv.agentModel).toBe("agnes:agnes-2.0-flash");
    expect(resolvedEnv.agnesApiKey).toBe("tutti-managed-agnes-key");
    expect(resolvedEnv.agnesBaseUrl).toBe("https://managed.agnes.example/v1");
    expect(requestedModels).toEqual(["agnes-2.0-flash"]);
  });

  it("revokes the Tutti grant when clearing a connection", async () => {
    const env = createEnv();
    const revokedGrantRefs: string[] = [];
    const service = createTuttiManagedCredentialService({
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
    const service = createTuttiManagedCredentialService({
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
    ).rejects.toThrow("Invalid Tutti Managed connect challenge.");
  });

  it("caches provider credentials by provider and model", async () => {
    const env = createEnv();
    const requestedModels: string[] = [];
    const service = createTuttiManagedCredentialService({
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
      "tutti:agnes:model-a",
      "tutti-managed",
    );
    const modelBEnv = await service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-b",
      "tutti-managed",
    );
    const modelAEnvAgain = await service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );

    expect(modelAEnv.agnesApiKey).toBe("key-for-model-a");
    expect(modelBEnv.agnesApiKey).toBe("key-for-model-b");
    expect(modelAEnvAgain.agnesApiKey).toBe("key-for-model-a");
    expect(requestedModels).toEqual(["model-a", "model-b"]);
  });

  it("treats stored grants as disconnected when Tutti runtime env is not configured", async () => {
    const store = createStore();
    store.updateTuttiManagedConnection({
      connected: true,
      grantRef: "stale-grant-ref",
      providers: ["openai"],
      models: [
        {
          id: "tutti:openai:gpt-5.1",
          name: "GPT-5.1",
          provider: "openai",
        },
      ],
    });
    const requestedModels: string[] = [];
    const service = createTuttiManagedCredentialService({
      env: {
        agentBackendMode: "state",
        agentModel: "openai:gpt-5.1",
        openAIApiKey: "api-provider-key",
        port: 3001,
        version: "test",
        webOrigin: "http://localhost:3000",
      },
      providerCredentialClient: async ({ model }) => {
        requestedModels.push(model);
        return {
          credential: {
            provider: "openai",
            apiKey: "tutti-managed-key",
          },
        };
      },
      store,
    });

    expect(service.getConnection().connected).toBe(false);
    await expect(service.listModels()).resolves.toEqual([]);
    const env = await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(env.openAIApiKey).toBe("api-provider-key");
    expect(requestedModels).toEqual([]);

    await service.clearConnection();
    expect(store.getTuttiManagedConnection().connected).toBe(false);
  });
});
