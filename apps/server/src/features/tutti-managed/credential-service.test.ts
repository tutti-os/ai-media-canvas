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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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

  it("caps exported credentials at five minutes and refreshes before the lease expires", async () => {
    const env = createEnv();
    let nowMs = Date.now();
    let requestCount = 0;
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => ({
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
      now: () => nowMs,
      providerCredentialClient: async () => {
        requestCount += 1;
        return {
          credential: {
            provider: "openai",
            apiKey: `managed-key-${requestCount}`,
          },
          expiresAt: new Date(nowMs + 5 * 60 * 60 * 1000).toISOString(),
        };
      },
      store,
    });
    await connectService(service, env);

    const first = await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    const leaseExpiryMs = Date.parse(
      store.getTuttiManagedConnection().expiresAt ?? "",
    );
    expect(leaseExpiryMs).toBe(nowMs + 5 * 60 * 1000);

    nowMs += 4 * 60 * 1000 + 29 * 1000;
    const cached = await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(cached.openAIApiKey).toBe("managed-key-1");

    nowMs += 2 * 1000;
    const refreshed = await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(refreshed.openAIApiKey).toBe("managed-key-2");
    expect(requestCount).toBe(2);
  });

  it("preserves a shorter upstream lease and rejects invalid or expired leases", async () => {
    const env = createEnv();
    const nowMs = Date.now();
    const store = createStore();
    const expiries = [
      new Date(nowMs + 2 * 60 * 1000).toISOString(),
      "not-an-expiry",
      new Date(nowMs - 1).toISOString(),
    ];
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
        providers: ["openai"],
      }),
      now: () => nowMs,
      providerCredentialClient: async () => {
        const expiresAt = expiries.shift();
        if (!expiresAt) throw new Error("missing test expiry");
        return {
          credential: { provider: "openai", apiKey: "managed-key" },
          expiresAt,
        };
      },
      store,
    });
    await connectService(service, env);

    await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(Date.parse(store.getTuttiManagedConnection().expiresAt ?? "")).toBe(
      nowMs + 2 * 60 * 1000,
    );

    await service.clearConnection();
    await connectService(service, env);
    await expect(
      service.resolveEnvForModel(
        createEnv(),
        "tutti:openai:gpt-5.1",
        "tutti-managed",
      ),
    ).rejects.toThrow("expiry is invalid or expired");

    await service.clearConnection();
    await connectService(service, env);
    await expect(
      service.resolveEnvForModel(
        createEnv(),
        "tutti:openai:gpt-5.1",
        "tutti-managed",
      ),
    ).rejects.toThrow("expiry is invalid or expired");
  });

  it("deduplicates concurrent credential requests for the same grant and model", async () => {
    const env = createEnv();
    const deferred = createDeferred<{
      credential: { provider: "openai"; apiKey: string };
      expiresAt: string;
    }>();
    let requestCount = 0;
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
        providers: ["openai"],
      }),
      providerCredentialClient: async () => {
        requestCount += 1;
        return deferred.promise;
      },
      store: createStore(),
    });
    await connectService(service, env);

    const first = service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    const second = service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(requestCount).toBe(1);
    deferred.resolve({
      credential: { provider: "openai", apiKey: "managed-key" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { openAIApiKey: "managed-key" },
      { openAIApiKey: "managed-key" },
    ]);
  });

  it("does not invalidate active credentials for rejected connect attempts", async () => {
    const env = createEnv();
    let requestCount = 0;
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
        providers: ["openai"],
      }),
      providerCredentialClient: async () => {
        requestCount += 1;
        return {
          credential: { provider: "openai", apiKey: "managed-key" },
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        };
      },
      store: createStore(),
    });
    await connectService(service, env);
    await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );

    await expect(
      service.connect({
        contextToken: createContextToken(env),
        grantCode: "invalid-challenge-code",
        nonce: "invalid-challenge-nonce",
        state: "invalid-challenge-state",
      }),
    ).rejects.toThrow("Invalid Tutti Managed connect challenge");

    const challenge = service.createConnectChallenge();
    await expect(
      service.connect({
        contextToken: "invalid-context-token",
        grantCode: "invalid-token-code",
        nonce: challenge.nonce,
        state: challenge.state,
      }),
    ).rejects.toThrow("Invalid Tutti context token");

    await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(requestCount).toBe(1);
  });

  it("keeps the active credential cache when a newer grant exchange fails", async () => {
    const env = createEnv();
    let exchangeCount = 0;
    let credentialRequestCount = 0;
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => {
        exchangeCount += 1;
        if (exchangeCount > 1) {
          throw new Error("grant exchange failed");
        }
        return {
          grantRef: "active-grant-ref",
          models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
          providers: ["openai" as const],
        };
      },
      providerCredentialClient: async () => {
        credentialRequestCount += 1;
        return {
          credential: { provider: "openai", apiKey: "managed-key" },
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        };
      },
      store,
    });
    await connectService(service, env);
    await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );

    await expect(connectService(service, env)).rejects.toThrow(
      "grant exchange failed",
    );

    const resolved = await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    expect(resolved.openAIApiKey).toBe("managed-key");
    expect(credentialRequestCount).toBe(1);
    expect(store.getTuttiManagedConnection()).toMatchObject({
      connected: true,
      grantRef: "active-grant-ref",
    });
  });

  it("does not restore a connection when clear supersedes an in-flight grant exchange", async () => {
    const env = createEnv();
    const exchange = createDeferred<{
      grantRef: string;
      models: [{ id: string; name: string; provider: "openai" }];
      providers: ["openai"];
    }>();
    let exchangeCount = 0;
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => {
        exchangeCount += 1;
        if (exchangeCount === 1) {
          return {
            grantRef: "active-grant-ref",
            models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
            providers: ["openai"],
          };
        }
        return exchange.promise;
      },
      revokeClient: async () => undefined,
      store,
    });
    await connectService(service, env);

    const pendingConnect = connectService(service, env);
    await service.clearConnection();
    exchange.resolve({
      grantRef: "stale-grant-ref",
      models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
      providers: ["openai"],
    });

    await expect(pendingConnect).rejects.toThrow(
      "connection request became stale",
    );
    expect(store.getTuttiManagedConnection().connected).toBe(false);
  });

  it("does not overwrite a shorter credential lease with a stale model catalog snapshot", async () => {
    const env = createEnv();
    const nowMs = Date.now();
    const catalog = createDeferred<{
      models: [{ id: string; name: string; provider: "openai" }];
    }>();
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
        providers: ["openai"],
      }),
      modelCatalogClient: async () => catalog.promise,
      now: () => nowMs,
      providerCredentialClient: async () => ({
        credential: { provider: "openai", apiKey: "managed-key" },
        expiresAt: new Date(nowMs + 2 * 60 * 1000).toISOString(),
      }),
      store,
    });
    await connectService(service, env);

    const pendingCatalog = service.listModels();
    await service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    catalog.resolve({
      models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
    });
    await pendingCatalog;

    expect(Date.parse(store.getTuttiManagedConnection().expiresAt ?? "")).toBe(
      nowMs + 2 * 60 * 1000,
    );
  });

  it("does not restore a cleared connection from an in-flight credential request", async () => {
    const env = createEnv();
    const deferred = createDeferred<{
      credential: { provider: "openai"; apiKey: string };
      expiresAt: string;
    }>();
    const store = createStore();
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => ({
        grantRef: "grant-ref",
        models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
        providers: ["openai"],
      }),
      providerCredentialClient: async () => deferred.promise,
      store,
    });
    await connectService(service, env);

    const pending = service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );
    await service.clearConnection();
    deferred.resolve({
      credential: { provider: "openai", apiKey: "stale-key" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(pending).rejects.toThrow("request became stale");
    expect(store.getTuttiManagedConnection().connected).toBe(false);
  });

  it("does not overwrite a reconnected grant from an older credential request", async () => {
    const env = createEnv();
    const deferred = createDeferred<{
      credential: { provider: "openai"; apiKey: string };
      expiresAt: string;
    }>();
    const store = createStore();
    let exchangeCount = 0;
    const service = createTuttiManagedCredentialService({
      env,
      exchangeClient: async () => {
        exchangeCount += 1;
        return {
          grantRef: `grant-ref-${exchangeCount}`,
          models: [{ id: "gpt-5.1", name: "GPT-5.1", provider: "openai" }],
          providers: ["openai" as const],
        };
      },
      providerCredentialClient: async () => deferred.promise,
      store,
    });
    await connectService(service, env);
    const pending = service.resolveEnvForModel(
      createEnv(),
      "tutti:openai:gpt-5.1",
      "tutti-managed",
    );

    await connectService(service, env);
    deferred.resolve({
      credential: { provider: "openai", apiKey: "stale-key" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(pending).rejects.toThrow("request became stale");
    expect(store.getTuttiManagedConnection()).toMatchObject({
      connected: true,
      grantRef: "grant-ref-2",
    });
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
