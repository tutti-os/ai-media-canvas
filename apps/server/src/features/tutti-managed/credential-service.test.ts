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
    tuttiCliPath: "/tmp/tutti-cli",
    tuttiWorkspaceId: "workspace-1",
    port: 3001,
    version: "test",
    webOrigin: "http://localhost:3000",
  };
}

function createContextToken() {
  return "public-context-token";
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject(reason?: unknown) {
      if (!rejectPromise)
        throw new Error("Deferred promise was not initialized.");
      rejectPromise(reason);
    },
    resolve(value: T) {
      if (!resolvePromise)
        throw new Error("Deferred promise was not initialized.");
      resolvePromise(value);
    },
  };
}

async function connectService(
  service: ReturnType<typeof createTuttiManagedCredentialService>,
  env: ServerEnv,
) {
  const challenge = service.createConnectChallenge();
  return service.connect({
    contextToken: createContextToken(),
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
        contextToken: createContextToken(),
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

  it("caps managed credentials at five minutes and refreshes within thirty seconds", async () => {
    const current = Date.parse("2026-01-01T00:00:00.000Z");
    const store = createStore();
    let credentialRequests = 0;
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        expiresAt: new Date(current + 60 * 60 * 1000).toISOString(),
        grantRef: "grant-ref",
        models: [{ id: "model-a", name: "Model A", provider: "agnes" }],
        providers: ["agnes"],
      }),
      now: () => current,
      providerCredentialClient: async () => {
        credentialRequests += 1;
        return {
          credential: { provider: "agnes", apiKey: "managed-key" },
          expiresAt: new Date(current + 20_000).toISOString(),
        };
      },
      store,
    });

    await connectService(service, createEnv());
    const connectionExpiry = store.getTuttiManagedConnection().expiresAt;
    expect(connectionExpiry).toBeDefined();
    expect(Date.parse(connectionExpiry ?? "")).toBe(current + 5 * 60 * 1000);

    await service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );
    await service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );

    expect(credentialRequests).toBe(2);
    const credentialExpiry = store.getTuttiManagedConnection().expiresAt;
    expect(credentialExpiry).toBeDefined();
    expect(Date.parse(credentialExpiry ?? "")).toBe(current + 20_000);
  });

  it("rejects an expired exchange lease and revokes the returned grant", async () => {
    const current = Date.parse("2026-01-01T00:00:00.000Z");
    const store = createStore();
    const revokedGrantRefs: string[] = [];
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        expiresAt: new Date(current - 1).toISOString(),
        grantRef: "expired-grant-ref",
        models: [],
        providers: ["agnes"],
      }),
      now: () => current,
      revokeClient: async ({ grantRef }) => {
        revokedGrantRefs.push(grantRef);
      },
      store,
    });

    await expect(connectService(service, createEnv())).rejects.toThrow(
      "credential expiry is invalid",
    );
    expect(revokedGrantRefs).toEqual(["expired-grant-ref"]);
    expect(store.getTuttiManagedConnection().connected).toBe(false);
  });

  it("rejects an expired provider credential instead of extending its lease", async () => {
    const current = Date.parse("2026-01-01T00:00:00.000Z");
    let requestCount = 0;
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "model-a", name: "Model A", provider: "agnes" }],
        providers: ["agnes"],
      }),
      now: () => current,
      providerCredentialClient: async () => {
        requestCount += 1;
        return {
          credential: { provider: "agnes", apiKey: "managed-key" },
          expiresAt: new Date(
            current + (requestCount === 1 ? -1 : 60_000),
          ).toISOString(),
        };
      },
      store: createStore(),
    });
    await connectService(service, createEnv());

    await expect(
      service.resolveEnvForModel(
        createEnv(),
        "tutti:agnes:model-a",
        "tutti-managed",
      ),
    ).rejects.toThrow("credential expiry is invalid");

    await expect(
      service.resolveEnvForModel(
        createEnv(),
        "tutti:agnes:model-a",
        "tutti-managed",
      ),
    ).resolves.toMatchObject({ agnesApiKey: "managed-key" });
    expect(requestCount).toBe(2);
  });

  it("rejects a provider credential that does not match the requested provider", async () => {
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "model-a", name: "Model A", provider: "agnes" }],
        providers: ["agnes"],
      }),
      providerCredentialClient: async () => ({
        credential: { provider: "openai", apiKey: "wrong-provider-key" },
      }),
      store: createStore(),
    });
    await connectService(service, createEnv());

    await expect(
      service.resolveEnvForModel(
        createEnv(),
        "tutti:agnes:model-a",
        "tutti-managed",
      ),
    ).rejects.toThrow("provider credential does not match request");
  });

  it("shares one in-flight credential request for concurrent model resolution", async () => {
    const pendingCredential = deferred<{
      credential: { apiKey: string; provider: "agnes" };
      expiresAt: string;
    }>();
    let credentialRequests = 0;
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "model-a", name: "Model A", provider: "agnes" }],
        providers: ["agnes"],
      }),
      providerCredentialClient: async () => {
        credentialRequests += 1;
        return await pendingCredential.promise;
      },
      store: createStore(),
    });
    await connectService(service, createEnv());

    const first = service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );
    const second = service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );
    await Promise.resolve();
    expect(credentialRequests).toBe(1);

    pendingCredential.resolve({
      credential: { provider: "agnes", apiKey: "managed-key" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(first).resolves.toMatchObject({ agnesApiKey: "managed-key" });
    await expect(second).resolves.toMatchObject({ agnesApiKey: "managed-key" });
  });

  it("keeps an active credential request valid when a replacement connect fails", async () => {
    const pendingCredential = deferred<{
      credential: { apiKey: string; provider: "agnes" };
    }>();
    const pendingReconnect = deferred<never>();
    let exchangeCount = 0;
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => {
        exchangeCount += 1;
        if (exchangeCount === 1) {
          return {
            grantRef: "grant-ref",
            models: [{ id: "model-a", name: "Model A", provider: "agnes" }],
            providers: ["agnes"],
          };
        }
        return await pendingReconnect.promise;
      },
      providerCredentialClient: async () => await pendingCredential.promise,
      store: createStore(),
    });
    await connectService(service, createEnv());

    const resolving = service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );
    await Promise.resolve();
    const challenge = service.createConnectChallenge();
    const reconnecting = service.connect({
      contextToken: createContextToken(),
      grantCode: "replacement-grant-code",
      nonce: challenge.nonce,
      state: challenge.state,
    });
    await Promise.resolve();

    pendingCredential.resolve({
      credential: { provider: "agnes", apiKey: "managed-key" },
    });
    await expect(resolving).resolves.toMatchObject({
      agnesApiKey: "managed-key",
    });

    pendingReconnect.reject(new Error("replacement exchange failed"));
    await expect(reconnecting).rejects.toThrow("replacement exchange failed");
  });

  it("preserves newer connection metadata after a credential request completes", async () => {
    const pendingCredential = deferred<{
      credential: { apiKey: string; provider: "agnes" };
    }>();
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "old-model", name: "Old model", provider: "agnes" }],
        providers: ["agnes"],
      }),
      providerCredentialClient: async () => await pendingCredential.promise,
      store,
    });
    await connectService(service, createEnv());

    const resolving = service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:old-model",
      "tutti-managed",
    );
    await Promise.resolve();
    store.updateTuttiManagedConnection({
      ...store.getTuttiManagedConnection(),
      models: [
        {
          id: "tutti:agnes:new-model",
          name: "New model",
          provider: "agnes",
        },
      ],
    });
    pendingCredential.resolve({
      credential: { provider: "agnes", apiKey: "managed-key" },
    });

    await expect(resolving).resolves.toMatchObject({
      agnesApiKey: "managed-key",
    });
    expect(store.getTuttiManagedConnection().models).toEqual([
      {
        id: "tutti:agnes:new-model",
        name: "New model",
        provider: "agnes",
      },
    ]);
  });

  it("rejects a stale credential response after disconnect without restoring local state", async () => {
    const pendingCredential = deferred<{
      credential: { apiKey: string; provider: "agnes" };
    }>();
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "model-a", name: "Model A", provider: "agnes" }],
        providers: ["agnes"],
      }),
      providerCredentialClient: async () => await pendingCredential.promise,
      revokeClient: async () => undefined,
      store,
    });
    await connectService(service, createEnv());

    const resolving = service.resolveEnvForModel(
      createEnv(),
      "tutti:agnes:model-a",
      "tutti-managed",
    );
    await Promise.resolve();
    await service.clearConnection();
    pendingCredential.resolve({
      credential: { provider: "agnes", apiKey: "stale-key" },
    });

    await expect(resolving).rejects.toThrow("connection changed");
    expect(store.getTuttiManagedConnection().connected).toBe(false);
  });

  it("does not clear a new connection after an earlier revoke completes", async () => {
    const pendingRevoke = deferred<void>();
    const store = createStore();
    let exchangeCount = 0;
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => {
        exchangeCount += 1;
        return {
          grantRef: exchangeCount === 1 ? "old-grant" : "new-grant",
          models: [],
          providers: ["agnes"],
        };
      },
      revokeClient: async () => await pendingRevoke.promise,
      store,
    });
    await connectService(service, createEnv());

    const clearing = service.clearConnection();
    const nextChallenge = service.createConnectChallenge();
    await service.connect({
      contextToken: createContextToken(),
      grantCode: "new-grant-code",
      nonce: nextChallenge.nonce,
      state: nextChallenge.state,
    });
    pendingRevoke.resolve();
    await clearing;

    expect(store.getTuttiManagedConnection().grantRef).toBe("new-grant");
  });

  it("does not let a stale model catalog overwrite a replacement connection", async () => {
    const pendingCatalog = deferred<{
      models: Array<{ id: string; name: string; provider: "agnes" }>;
    }>();
    const store = createStore();
    let exchangeCount = 0;
    const service = createTuttiManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => {
        exchangeCount += 1;
        return {
          grantRef: exchangeCount === 1 ? "old-grant" : "new-grant",
          models:
            exchangeCount === 1
              ? [{ id: "old", name: "Old", provider: "agnes" }]
              : [{ id: "new", name: "New", provider: "agnes" }],
          providers: ["agnes"],
        };
      },
      modelCatalogClient: async () => await pendingCatalog.promise,
      revokeClient: async () => undefined,
      store,
    });
    await connectService(service, createEnv());

    const listing = service.listModels();
    await Promise.resolve();
    await service.clearConnection();
    const nextChallenge = service.createConnectChallenge();
    await service.connect({
      contextToken: createContextToken(),
      grantCode: "new-grant-code",
      nonce: nextChallenge.nonce,
      state: nextChallenge.state,
    });
    pendingCatalog.resolve({
      models: [{ id: "old-catalog", name: "Old catalog", provider: "agnes" }],
    });

    await expect(listing).resolves.toEqual([
      {
        id: "tutti:agnes:new",
        name: "New",
        provider: "agnes",
        source: "tutti-managed",
      },
    ]);
    expect(store.getTuttiManagedConnection().models).toEqual([
      { id: "tutti:agnes:new", name: "New", provider: "agnes" },
    ]);
  });
});
