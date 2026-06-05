import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { registerModelRoutes } from "./models.js";

describe("registerModelRoutes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const fetchMock = vi.fn();
  const emptyLocalAgentModelDiscovery = {
    detect: vi.fn(async () => []),
  };

  beforeEach(() => {
    fetchMock.mockReset();
    emptyLocalAgentModelDiscovery.detect.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    vi.unstubAllGlobals();
  });

  it("loads trusted local agent mode from the environment", () => {
    expect(
      loadServerEnv({}, { AIMC_TRUSTED_LOCAL_AGENT_MODE: "false" })
        .trustedLocalAgentMode,
    ).toBe(false);
    expect(loadServerEnv({}, {}).trustedLocalAgentMode).toBe(true);
  });

  it("includes Agnes models only when Agnes credentials are configured", async () => {
    const appWithoutAgnes = Fastify();
    apps.push(appWithoutAgnes);
    await registerModelRoutes(
      appWithoutAgnes,
      loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery: emptyLocalAgentModelDiscovery },
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
      loadServerEnv(
        {
          agentModel: "agnes:agnes-2.0-flash",
          agnesApiKey: "local-agnes-key",
          agnesBaseUrl: "https://agnes.example/v1",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery: emptyLocalAgentModelDiscovery },
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
      loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery: emptyLocalAgentModelDiscovery },
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
      loadServerEnv(
        {
          agentModel: "anthropic:claude-sonnet-4-5",
          anthropicApiKey: "local-anthropic-key",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery: emptyLocalAgentModelDiscovery },
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
        data: [{ id: "deepseek-chat" }, { id: "qwen-plus" }],
      }),
    });

    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv(
        {
          agentModel: "openai:deepseek-chat",
          openAIApiKey: "local-openai-key",
          openAIApiBase: "https://gateway.example/v1",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery: emptyLocalAgentModelDiscovery },
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
      loadServerEnv(
        {
          agentModel: "openai:gpt-5.4",
          openAIApiKey: "local-openai-key",
          openAIApiBase: "https://api.openai.com/v1",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery: emptyLocalAgentModelDiscovery },
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

  it("includes local-agent models from package discovery", async () => {
    const localAgentModelDiscovery = {
      detect: vi.fn(async () => [
        {
          provider: "codex" as const,
          displayName: "Codex CLI",
          result: {
            authState: "unknown" as const,
            executablePath: "codex",
            models: [
              { id: "default", label: "Default (CLI config)" },
              { id: "gpt-live", label: "gpt-live" },
            ],
            supported: true,
            version: "1.0.0",
          },
        },
        {
          provider: "claude" as const,
          displayName: "Claude Code",
          result: {
            authState: "unknown" as const,
            executablePath: "claude",
            models: [
              { id: "sonnet", label: "Sonnet (alias)" },
              { id: "claude:opus", label: "Scoped Opus" },
            ],
            supported: true,
            version: "1.0.0",
          },
        },
        {
          provider: "hermes" as const,
          displayName: "Hermes",
          result: {
            authState: "unknown" as const,
            executablePath: "hermes",
            models: [{ id: "openai-codex:gpt-5.4", label: "Hermes GPT" }],
            supported: true,
            version: "1.0.0",
          },
        },
      ]),
    };
    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().models).toEqual(
      expect.arrayContaining([
        {
          id: "codex:default",
          name: "Default (CLI config)",
          provider: "codex",
        },
        {
          id: "codex:gpt-live",
          name: "gpt-live",
          provider: "codex",
        },
        {
          id: "claude:sonnet",
          name: "Sonnet (alias)",
          provider: "claude",
        },
        {
          id: "claude:opus",
          name: "Scoped Opus",
          provider: "claude",
        },
        {
          id: "hermes:openai-codex:gpt-5.4",
          name: "Hermes GPT",
          provider: "hermes",
        },
      ]),
    );
    expect(localAgentModelDiscovery.detect).toHaveBeenCalledTimes(1);
  });

  it("omits local-agent models when trusted local mode is disabled", async () => {
    const localAgentModelDiscovery = {
      detect: vi.fn(async () => [
        {
          provider: "codex" as const,
          displayName: "Codex CLI",
          result: {
            authState: "unknown" as const,
            executablePath: "codex",
            models: [{ id: "gpt-live", label: "gpt-live" }],
            supported: true,
            version: "1.0.0",
          },
        },
      ]),
    };
    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
          trustedLocalAgentMode: false,
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().models).not.toContainEqual(
      expect.objectContaining({ provider: "codex" }),
    );
    expect(localAgentModelDiscovery.detect).not.toHaveBeenCalled();
  });

  it("installs a pinned local-agent provider through the installer", async () => {
    const localAgentProviderInstaller = vi.fn(async () => ({
      provider: "codex" as const,
      status: "succeeded" as const,
      command: "npm install -g @openai/codex @zed-industries/codex-acp",
      before: {
        availability: "not_installed" as const,
        reason: "cli_not_found" as const,
        cli: { binary: "codex", installed: false },
        adapter: { binary: "codex-acp", installed: false },
        auth: { ok: false, required: true },
      },
      after: {
        availability: "ready" as const,
        reason: "ready" as const,
        cli: { binary: "codex", installed: true, path: "/usr/bin/codex" },
        adapter: {
          binary: "codex-acp",
          installed: true,
          path: "/usr/bin/codex-acp",
        },
        auth: { ok: true, required: false },
      },
    }));
    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
        },
        {},
      ),
      undefined,
      {
        localAgentModelDiscovery: emptyLocalAgentModelDiscovery,
        localAgentProviderInstaller,
      },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/local-agent/providers/codex/install",
    });

    expect(response.statusCode).toBe(200);
    expect(localAgentProviderInstaller).toHaveBeenCalledWith("codex");
    expect(response.json()).toEqual({
      provider: "codex",
      status: "succeeded",
      availability: "ready",
      reason: "ready",
      message: "Codex is installed and ready.",
    });
  });

  it("rejects unsupported local-agent provider installation requests", async () => {
    const localAgentProviderInstaller = vi.fn();
    const app = Fastify();
    apps.push(app);
    await registerModelRoutes(
      app,
      loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
        },
        {},
      ),
      undefined,
      {
        localAgentModelDiscovery: emptyLocalAgentModelDiscovery,
        localAgentProviderInstaller,
      },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/local-agent/providers/gemini/install",
    });

    expect(response.statusCode).toBe(400);
    expect(localAgentProviderInstaller).not.toHaveBeenCalled();
  });
});
