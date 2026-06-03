import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { registerModelRoutes } from "./models.js";

describe("registerModelRoutes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AIMC_CODEX_CLI_AVAILABLE = "0";
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    vi.unstubAllGlobals();
    delete process.env.AIMC_CODEX_CLI_AVAILABLE;
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

  it("includes Anthropic models only when Anthropic credentials are configured", async () => {
    const appWithoutAnthropic = Fastify();
    apps.push(appWithoutAnthropic);
    await registerModelRoutes(
      appWithoutAnthropic,
      loadServerEnv({
        agentModel: "openai:gpt-4.1",
      }, {}),
    );

    const withoutAnthropic = await appWithoutAnthropic.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(withoutAnthropic.statusCode).toBe(200);
    expect(withoutAnthropic.json().models).not.toContainEqual(
      expect.objectContaining({
        id: "anthropic:claude-sonnet-4-5",
      }),
    );

    const appWithAnthropic = Fastify();
    apps.push(appWithAnthropic);
    await registerModelRoutes(
      appWithAnthropic,
      loadServerEnv({
        agentModel: "anthropic:claude-sonnet-4-5",
        anthropicApiKey: "local-anthropic-key",
      }, {}),
    );

    const withAnthropic = await appWithAnthropic.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(withAnthropic.statusCode).toBe(200);
    expect(withAnthropic.json().models).toContainEqual({
      id: "anthropic:claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
    });
  });

  it("uses the OpenAI-compatible upstream model list when a base URL is configured", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "deepseek-chat" },
          { id: "qwen-plus" },
        ],
      }),
    });

    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv({
        agentModel: "openai:deepseek-chat",
        openAIApiKey: "local-openai-key",
        openAIApiBase: "https://gateway.example/v1",
      }, {}),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer local-openai-key",
        }),
      }),
    );
    expect(response.json().models).toEqual(
      expect.arrayContaining([
        {
          id: "openai:deepseek-chat",
          name: "deepseek-chat",
          provider: "openai",
        },
        {
          id: "openai:qwen-plus",
          name: "qwen-plus",
          provider: "openai",
        },
      ]),
    );
  });

  it("filters OpenAI-compatible model lists down to assistant-suitable models", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-5.4" },
          { id: "gpt-5.4-2026-03-05" },
          { id: "gpt-4o-audio-preview" },
          { id: "gpt-4o-realtime-preview" },
          { id: "gpt-image-1" },
          { id: "text-embedding-3-large" },
          { id: "gpt-5.3-codex" },
        ],
      }),
    });

    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv({
        agentModel: "openai:gpt-5.4",
        openAIApiKey: "local-openai-key",
        openAIApiBase: "https://api.openai.com/v1",
      }, {}),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().models).toEqual([
      {
        id: "openai:gpt-5.4",
        name: "gpt-5.4",
        provider: "openai",
      },
      {
        id: "openai:gpt-5.3-codex",
        name: "gpt-5.3-codex",
        provider: "openai",
      },
    ]);
  });

  it("includes Codex models when the local Codex CLI is available", async () => {
    process.env.AIMC_CODEX_CLI_AVAILABLE = "1";

    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv({
        agentModel: "openai:gpt-4.1",
      }, {}),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().models).toEqual(
      expect.arrayContaining([
        {
          id: "codex:gpt-5.4",
          name: "Codex GPT-5.4",
          provider: "codex",
        },
        {
          id: "codex:gpt-5.4-mini",
          name: "Codex GPT-5.4 Mini",
          provider: "codex",
        },
      ]),
    );
  });
});
