import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { registerTuttiCliRoutes } from "./tutti-cli.js";

const apps: Array<ReturnType<typeof Fastify>> = [];

describe("registerTuttiCliRoutes", () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("wraps project creation as a CLI JSON output", async () => {
    const projectOperations = {
      createProject: vi.fn(async (input) => ({
        project: {
          id: "11111111-1111-4111-8111-111111111111",
          name: input.name,
        },
      })),
      getProject: vi.fn(),
      listProjects: vi.fn(),
    };
    const app = buildTestApp({ projectOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/projects/create",
      payload: {
        name: "Launch board",
        description: "A local planning canvas",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(projectOperations.createProject).toHaveBeenCalledWith({
      name: "Launch board",
      description: "A local planning canvas",
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        project: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Launch board",
        },
      },
    });
  });

  it("maps hyphenated agent run flags to the shared run request", async () => {
    const agentOperations = {
      cancelRun: vi.fn(),
      listRunEvents: vi.fn(),
      startRun: vi.fn(async (input) => ({
        conversationId: input.conversationId,
        runId: "run-1",
        sessionId: input.sessionId,
        status: "accepted" as const,
      })),
    };
    const app = buildTestApp({ agentOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/agent/run",
      payload: {
        "session-id": "session-1",
        "conversation-id": "canvas-1",
        prompt: "Create a product poster",
        "runtime-kind": "local-agent",
        "runtime-provider": "codex",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(agentOperations.startRun).toHaveBeenCalledWith({
      sessionId: "session-1",
      conversationId: "canvas-1",
      prompt: "Create a product poster",
      runtimeKind: "local-agent",
      runtimeProvider: "codex",
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        conversationId: "canvas-1",
        runId: "run-1",
        sessionId: "session-1",
        status: "accepted",
      },
    });
  });

  it("maps one-time Codex imagegen consent on agent runs", async () => {
    const agentOperations = {
      cancelRun: vi.fn(),
      listRunEvents: vi.fn(),
      startRun: vi.fn(async (input) => ({
        conversationId: input.conversationId,
        runId: "run-1",
        sessionId: input.sessionId,
        status: "accepted" as const,
      })),
    };
    const app = buildTestApp({ agentOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/agent/run",
      payload: {
        "session-id": "session-1",
        "conversation-id": "canvas-1",
        prompt: "Continue the image task",
        "codex-imagegen-consent": "allow-once",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(agentOperations.startRun).toHaveBeenCalledWith({
      sessionId: "session-1",
      conversationId: "canvas-1",
      prompt: "Continue the image task",
      delegationConsent: {
        codexImagegen: "allow-once",
      },
    });
  });

  it("forwards optional canvas save base revisions", async () => {
    const canvasOperations = {
      getCanvas: vi.fn(),
      saveCanvas: vi.fn(async () => ({ ok: true, revision: 4 })),
    };
    const app = buildTestApp({ canvasOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/canvases/save",
      payload: {
        "canvas-id": "canvas-1",
        "base-revision": "3",
        "content-json": JSON.stringify({
          elements: [],
          appState: {},
          files: {},
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(canvasOperations.saveCanvas).toHaveBeenCalledWith(
      "canvas-1",
      {
        elements: [],
        appState: {},
        files: {},
      },
      { baseRevision: 3 },
    );
    expect(response.json()).toEqual({
      kind: "json",
      value: { ok: true, revision: 4 },
    });
  });

  it("requires generation image commands to pass a model", async () => {
    const jobOperations = {
      createImageJob: vi.fn(),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/image",
      payload: {
        prompt: "A launch poster",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(jobOperations.createImageJob).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      kind: "error",
      error: {
        code: "application_error",
        message: "Invalid command input.",
      },
    });
  });

  it("requires generation video commands to pass a model", async () => {
    const jobOperations = {
      createVideoJob: vi.fn(),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/video",
      payload: {
        prompt: "A launch video",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(jobOperations.createVideoJob).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      kind: "error",
      error: {
        code: "application_error",
        message: "Invalid command input.",
      },
    });
  });

  it("forwards explicit generation models to job operations", async () => {
    const jobOperations = {
      createImageJob: vi.fn(async (input) => ({
        job: {
          id: "job-1",
          payload: input,
          status: "queued",
        },
      })),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/image",
      payload: {
        prompt: "A launch poster",
        model: "agnes-image/agnes-image-2.1-flash",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "agnes-image/agnes-image-2.1-flash",
      caller_provider: "external-cli",
    });
  });

  it("allows explicit direct-user generation image commands without caller metadata", async () => {
    const jobOperations = {
      createImageJob: vi.fn(async (input) => ({
        job: {
          id: "job-1",
          payload: input,
          status: "queued",
        },
      })),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/image",
      payload: {
        prompt: "A launch poster",
        model: "codex/gpt-image-2",
        "direct-user": true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "codex/gpt-image-2",
    });
  });

  it("forwards optional agent caller metadata for proxied generation image commands", async () => {
    const jobOperations = {
      createImageJob: vi.fn(async (input) => ({
        job: {
          id: "job-1",
          payload: input,
          status: "queued",
        },
      })),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/image",
      payload: {
        prompt: "A launch poster",
        model: "codex/gpt-image-2",
        "caller-provider": "claude",
        "codex-imagegen-consent": "allow-once",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "codex/gpt-image-2",
      caller_provider: "claude",
      codex_imagegen_consent: "allow-once",
      codex_imagegen_delegation_allowed: true,
    });
  });

  it("routes CLI agent consent decisions to agent operations", async () => {
    const agentOperations = {
      cancelRun: vi.fn(),
      listRunEvents: vi.fn(),
      submitConsent: vi.fn(async (input) => ({
        decision: input.decision,
        runId: input.runId,
        status: "accepted",
      })),
      startRun: vi.fn(),
    };
    const app = buildTestApp({ agentOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/agent/consent",
      payload: {
        "run-id": "run-1",
        decision: "allow-once",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(agentOperations.submitConsent).toHaveBeenCalledWith({
      runId: "run-1",
      decision: "allow-once",
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        decision: "allow-once",
        runId: "run-1",
        status: "accepted",
      },
    });
  });

  it("patches Codex image delegation through CLI settings update", async () => {
    const currentSettings = {
      defaultModel: "",
      providerModels: {
        openai: [],
        anthropic: [],
        agnes: [],
        google: [],
        vertex: [],
      },
      openAIApiKey: "",
      openAIApiBase: "",
      anthropicApiKey: "",
      anthropicBaseUrl: "",
      agnesApiKey: "",
      agnesBaseUrl: "",
      agnesDefaultModel: "",
      googleApiKey: "",
      googleVertexProject: "",
      googleVertexLocation: "",
      googleVertexVideoLocation: "",
      replicateApiToken: "",
      kieApiKey: "",
      kieBaseUrl: "",
      volcesApiKey: "",
      volcesBaseUrl: "",
      codexImagegenDelegation: "ask" as const,
    };
    const settingsService = {
      getWorkspaceSettings: vi.fn(async () => currentSettings),
      updateWorkspaceSettings: vi.fn(async (_user, _workspaceId, settings) => ({
        ...settings,
      })),
    };
    const app = buildTestApp({ settingsService });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/settings/update",
      payload: {
        "codex-imagegen-delegation": "always",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(settingsService.updateWorkspaceSettings).toHaveBeenCalledWith(
      null,
      "local-workspace",
      {
        ...currentSettings,
        codexImagegenDelegation: "always",
      },
    );
    expect(response.json()).toMatchObject({
      kind: "json",
      value: {
        settings: {
          codexImagegenDelegation: "always",
        },
      },
    });
  });

  it("returns CLI errors for missing required inputs", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/projects/get",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      kind: "error",
      error: {
        code: "application_error",
        message: "Invalid command input.",
      },
    });
  });
});

function buildTestApp(overrides: Record<string, unknown> = {}) {
  const app = Fastify();
  apps.push(app);
  void registerTuttiCliRoutes(app, {
    agentOperations: {
      cancelRun: vi.fn(),
      listRunEvents: vi.fn(),
      startRun: vi.fn(),
      ...(overrides.agentOperations as object | undefined),
    } as never,
    canvasOperations: {
      getCanvas: vi.fn(),
      saveCanvas: vi.fn(),
      ...(overrides.canvasOperations as object | undefined),
    } as never,
    chatOperations: {
      createMessage: vi.fn(),
      createSession: vi.fn(),
      listMessages: vi.fn(),
      listSessions: vi.fn(),
      ...(overrides.chatOperations as object | undefined),
    } as never,
    env: loadServerEnv({ version: "1.2.3" }, {}),
    jobOperations: {
      cancelJob: vi.fn(),
      createImageJob: vi.fn(),
      createVideoJob: vi.fn(),
      getJob: vi.fn(),
      listJobs: vi.fn(),
      ...(overrides.jobOperations as object | undefined),
    } as never,
    ...(overrides.settingsService
      ? { settingsService: overrides.settingsService as never }
      : {}),
    projectOperations: {
      createProject: vi.fn(),
      getProject: vi.fn(),
      listProjects: vi.fn(),
      ...(overrides.projectOperations as object | undefined),
    } as never,
    skillOperations: {
      getSkill: vi.fn(),
      installCatalogSkill: vi.fn(),
      listInstalledSkills: vi.fn(),
      toggleSkill: vi.fn(),
      ...(overrides.skillOperations as object | undefined),
    } as never,
  });
  return app;
}
