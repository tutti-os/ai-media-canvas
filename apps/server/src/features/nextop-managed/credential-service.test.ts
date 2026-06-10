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
    port: 3001,
    version: "test",
    webOrigin: "http://localhost:3000",
  };
}

describe("createNextopManagedCredentialService", () => {
  it("does not resolve API Provider selections through Nextop Managed credentials", async () => {
    const service = createNextopManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        providers: [
          {
            provider: "openai",
            apiKey: "nextop-managed-key",
            models: [
              {
                id: "openai:gpt-5.1",
                name: "GPT-5.1",
                provider: "openai",
              },
            ],
          },
        ],
      }),
      store: createStore(),
    });

    await service.connect({
      grantCode: "grant-code",
      grantRef: "grant-ref",
    });

    const apiProviderEnv = await service.resolveEnvForModel(
      createEnv(),
      "openai:gpt-5.1",
      "api-provider",
    );
    expect(apiProviderEnv.openAIApiKey).toBe("api-provider-key");

    const nextopManagedEnv = await service.resolveEnvForModel(
      createEnv(),
      "openai:gpt-5.1",
      "nextop-managed",
    );
    expect(nextopManagedEnv.openAIApiKey).toBe("nextop-managed-key");
  });

  it("revokes the Nextop grant when clearing a connection", async () => {
    const revokedGrantRefs: string[] = [];
    const service = createNextopManagedCredentialService({
      env: createEnv(),
      exchangeClient: async () => ({
        expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        providers: [
          {
            provider: "agnes",
            apiKey: "nextop-managed-key",
            models: [
              {
                id: "agnes:agnes-2.0-flash",
                name: "Agnes 2.0 Flash",
                provider: "agnes",
              },
            ],
          },
        ],
      }),
      revokeClient: async ({ grantRef }) => {
        revokedGrantRefs.push(grantRef);
      },
      store: createStore(),
    });

    await service.connect({
      grantCode: "grant-code",
      grantRef: "grant-ref",
    });
    const connection = await service.clearConnection();

    expect(revokedGrantRefs).toEqual(["grant-ref"]);
    expect(connection.connected).toBe(false);
  });
});
