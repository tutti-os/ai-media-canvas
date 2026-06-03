import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { registerModelRoutes } from "./models.js";

describe("registerModelRoutes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("includes Agnes models only when Agnes credentials are configured", async () => {
    const appWithoutAgnes = Fastify();
    apps.push(appWithoutAgnes);
    await registerModelRoutes(
      appWithoutAgnes,
      loadServerEnv({
        agentModel: "openai:gpt-4.1",
      }, {}),
    );

    const withoutAgnes = await appWithoutAgnes.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(withoutAgnes.statusCode).toBe(200);
    expect(withoutAgnes.json().models).not.toContainEqual(
      expect.objectContaining({
        id: "agnes:agnes-2.0-flash",
      }),
    );

    const appWithAgnes = Fastify();
    apps.push(appWithAgnes);
    await registerModelRoutes(
      appWithAgnes,
      loadServerEnv({
        agentModel: "agnes:agnes-2.0-flash",
        agnesApiKey: "local-agnes-key",
        agnesBaseUrl: "https://agnes.example/v1",
      }, {}),
    );

    const withAgnes = await appWithAgnes.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(withAgnes.statusCode).toBe(200);
    expect(withAgnes.json().models).toContainEqual({
      id: "agnes:agnes-2.0-flash",
      name: "Agnes 2.0 Flash",
      provider: "agnes",
    });
  });
});
