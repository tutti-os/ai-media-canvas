import { Writable } from "node:stream";

import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { TuttiManagedModelCliUnsupportedError } from "../features/tutti-managed/tutti-cli-client.js";
import { registerTuttiManagedModelConnectionRoutes } from "./tutti-managed-model-connection.js";

describe("registerTuttiManagedModelConnectionRoutes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("does not include grant or context secrets in failure logs", async () => {
    let logs = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs += String(chunk);
        callback();
      },
    });
    const app = Fastify({ logger: { level: "warn", stream } });
    apps.push(app);
    await registerTuttiManagedModelConnectionRoutes(app, {
      tuttiManagedCredentials: {
        connect: async () => {
          throw new Error(
            "upstream echoed grant-secret and context-secret unexpectedly",
          );
        },
      } as never,
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        contextToken: "context-secret",
        grantCode: "grant-secret",
        nonce: "nonce-value-1234567890",
        state: "state-value-1234567890",
      },
      url: "/api/tutti/managed-model-connection/grant",
    });

    expect(response.statusCode).toBe(502);
    expect(logs).toContain("Tutti Managed grant exchange failed");
    expect(logs).not.toContain("grant-secret");
    expect(logs).not.toContain("context-secret");
  });

  it("reports an unsupported Tutti host without exposing internal diagnostics", async () => {
    const app = Fastify();
    apps.push(app);
    await registerTuttiManagedModelConnectionRoutes(app, {
      tuttiManagedCredentials: {
        connect: async () => {
          throw new TuttiManagedModelCliUnsupportedError();
        },
      } as never,
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        contextToken: "context-token",
        grantCode: "grant-code",
        nonce: "nonce-value-1234567890",
        state: "state-value-1234567890",
      },
      url: "/api/tutti/managed-model-connection/grant",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "service_unavailable",
        message: "当前 Tutti 不支持托管模型 CLI，请升级 Tutti",
      },
    });
  });
});
