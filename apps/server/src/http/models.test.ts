import { MANAGED_AGENT_INVOCATION_CREDENTIAL_HEADER } from "@tutti-os/agent-acp-kit";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalAgentModelDetectContext } from "../agent/local-agent-models.js";
import { loadServerEnv } from "../config/env.js";
import { listAgentModels, registerModelRoutes } from "./models.js";

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
    vi.unstubAllEnvs();
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
      source: "api-provider",
    });
    expect(withAgnes.json().models).toContainEqual({
      id: "agnes:agnes-1.5-flash",
      name: "Agnes 1.5 Flash",
      provider: "agnes",
      source: "api-provider",
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
          appDataDir: "/tmp/aimc-app-data",
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
        id: "anthropic:claude-sonnet-4-6",
      }),
    );

    const appWithAnthropic = Fastify();
    apps.push(appWithAnthropic);
    await registerModelRoutes(
      appWithAnthropic,
      loadServerEnv(
        {
          agentModel: "anthropic:claude-sonnet-4-6",
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
      id: "anthropic:claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      provider: "anthropic",
      source: "api-provider",
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
    const models = response.json().models;
    expect(models).toEqual(
      expect.arrayContaining([
        {
          id: "openai:deepseek-chat",
          name: "deepseek-chat",
          provider: "openai",
          source: "api-provider",
        },
        {
          id: "openai:qwen-plus",
          name: "qwen-plus",
          provider: "openai",
          source: "api-provider",
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
        source: "api-provider",
      },
      {
        id: "openai:gpt-5.3-codex",
        name: "gpt-5.3-codex",
        provider: "openai",
        source: "api-provider",
      },
    ]);
  });

  it("includes local-agent models from package discovery", async () => {
    const localAgentModelDiscovery = {
      detect: vi.fn(async (_context?: LocalAgentModelDetectContext) => [
        {
          provider: "codex" as const,
          displayName: "Codex CLI",
          result: {
            authState: "ok" as const,
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
          provider: "claude-code" as const,
          displayName: "Claude Code",
          result: {
            authState: "ok" as const,
            executablePath: "claude",
            models: [
              {
                id: "sonnet",
                label: "Sonnet (alias)",
                description: "Custom Sonnet model",
              },
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
            authState: "ok" as const,
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
          appDataDir: "/tmp/aimc-app-data",
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
    const models = response.json().models;
    expect(models).toEqual(
      expect.arrayContaining([
        {
          id: "codex:default",
          name: "Default (CLI config)",
          provider: "codex",
          source: "local-agent",
        },
        {
          id: "codex:gpt-live",
          name: "gpt-live",
          provider: "codex",
          source: "local-agent",
        },
        {
          id: "claude-code:sonnet",
          name: "Sonnet (alias)",
          description: "Custom Sonnet model",
          provider: "claude-code",
          source: "local-agent",
        },
        {
          id: "claude-code:claude:opus",
          name: "Scoped Opus",
          provider: "claude-code",
          source: "local-agent",
        },
        {
          id: "hermes:openai-codex:gpt-5.4",
          name: "Hermes GPT",
          provider: "hermes",
          source: "local-agent",
        },
      ]),
    );
    expect(localAgentModelDiscovery.detect).toHaveBeenCalledTimes(1);
    expect(localAgentModelDiscovery.detect).toHaveBeenCalledWith(undefined);
  });

  it("bypasses cached local-agent detection when model refresh is requested", async () => {
    const localAgentModelDiscovery = {
      detect: vi.fn(async (_context?: LocalAgentModelDetectContext) => [
        {
          provider: "claude-code" as const,
          displayName: "Claude Code",
          result: {
            authState: "ok" as const,
            executablePath: "claude",
            models: [{ id: "sonnet", label: "Sonnet" }],
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
          appDataDir: "/tmp/aimc-app-data",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/models?refresh=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().models).toContainEqual({
      id: "claude-code:sonnet",
      name: "Sonnet",
      provider: "claude-code",
      source: "local-agent",
    });
    expect(localAgentModelDiscovery.detect).toHaveBeenCalledWith({
      refresh: true,
    });
  });

  it("passes a managed agent invocation to local-agent model discovery for POST model requests", async () => {
    vi.stubEnv("TUTTI_APP_DATA_DIR", "/tmp/aimc-app-data");
    vi.stubEnv("CODEX_HOME", "/tmp/user-codex-home");
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/tmp/user-claude-config");
    const localAgentModelDiscovery = {
      detect: vi.fn(async (_context?: LocalAgentModelDetectContext) => [
        {
          provider: "nexight" as const,
          displayName: "Nexight",
          result: {
            authState: "ok" as const,
            executablePath: "nexight",
            models: [{ id: "default", label: "Default (Nexight)" }],
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
          appDataDir: "/tmp/aimc-app-data",
        },
        {},
      ),
      undefined,
      { localAgentModelDiscovery },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/models",
      headers: {
        [MANAGED_AGENT_INVOCATION_CREDENTIAL_HEADER]: "credential-model-1",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().models).toContainEqual({
      id: "nexight:default",
      name: "Default (Nexight)",
      provider: "nexight",
      source: "local-agent",
    });
    expect(localAgentModelDiscovery.detect).toHaveBeenCalledWith({
      managedAgentInvocation: {
        credential: "credential-model-1",
        cwd: "/tmp/aimc-app-data",
      },
      cwd: "/tmp/aimc-app-data",
      env: expect.objectContaining({
        TUTTI_APP_DATA_DIR: "/tmp/aimc-app-data",
      }),
      redactionSecrets: ["credential-model-1"],
    });
    const detectContext = localAgentModelDiscovery.detect.mock.calls[0]?.[0];
    expect(detectContext?.env ?? {}).toMatchObject({
      TUTTI_APP_DATA_DIR: "/tmp/aimc-app-data",
    });
    expect(detectContext?.env ?? {}).not.toEqual(
      expect.objectContaining({
        CLAUDE_CONFIG_DIR: expect.any(String),
        CODEX_HOME: expect.any(String),
        PATH: expect.any(String),
      }),
    );
  });

  it("keeps managed model discovery credentials out of logs", async () => {
    const logger = { warn: vi.fn() };
    await listAgentModels({
      env: loadServerEnv(
        {
          agentModel: "openai:gpt-4.1",
          appDataDir: "/tmp/aimc-app-data",
        },
        {},
      ),
      localAgentModelDiscovery: {
        detect: vi.fn(async () => {
          throw new Error("credential-model-1");
        }),
      },
      logger,
      managedAgentDetectContext: {
        cwd: "/tmp/aimc-app-data",
        managedAgentInvocation: {
          credential: "credential-model-1",
          cwd: "/tmp/aimc-app-data",
        },
      },
    });

    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      "credential-model-1",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      {},
      "Failed to load local-agent models; omitting local providers.",
    );
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
});
