import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ServerEnv, loadServerEnv } from "../config/env.js";
import { registerTuttiCliRoutes } from "./tutti-cli.js";

const apps: Array<ReturnType<typeof Fastify>> = [];
const tempRoots: string[] = [];

describe("registerTuttiCliRoutes", () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(
      tempRoots
        .splice(0)
        .map((tempRoot) =>
          rm(tempRoot, { force: true, recursive: true, maxRetries: 3 }),
        ),
    );
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

  it("unwraps Tutti app CLI invoke envelope input before routing", async () => {
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
        schemaVersion: "tutti.app.cli.invoke.v1",
        commandId: "ai-media-canvas.projects.create",
        appId: "ai-media-canvas",
        scope: "aimc",
        path: ["projects", "create"],
        workspaceId: "workspace-1",
        input: {
          name: "Codex image generation test",
          description: "Temporary canvas for a sample image generation.",
        },
        outputMode: "json",
        context: {
          source: "cli",
          workspaceID: "workspace-1",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(projectOperations.createProject).toHaveBeenCalledWith({
      name: "Codex image generation test",
      description: "Temporary canvas for a sample image generation.",
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

  it("requests opening the app home page when no project id is provided", async () => {
    const appOpenRequester = vi.fn(async () => undefined);
    const app = buildTestApp({
      appOpenRequester,
      env: { tuttiAppId: "ai-media-canvas" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/open",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(appOpenRequester).toHaveBeenCalledWith({
      appId: "ai-media-canvas",
      route: "/home",
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        openRequested: true,
        route: "/home",
      },
    });
  });

  it("requests opening a project's primary canvas", async () => {
    const appOpenRequester = vi.fn(async () => undefined);
    const app = buildTestApp({
      appOpenRequester,
      env: { tuttiAppId: "ai-media-canvas" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/open",
      payload: {
        "project-id": "project-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(appOpenRequester).toHaveBeenCalledWith({
      appId: "ai-media-canvas",
      params: {
        id: "canvas-1",
      },
      route: "/canvas",
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        openRequested: true,
        projectId: "project-1",
        canvasId: "canvas-1",
        params: {
          id: "canvas-1",
        },
        route: "/canvas",
      },
    });
  });

  it("passes canvas ids as app open params when invoking the Tutti CLI", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "aimc-cli-test-"));
    tempRoots.push(tempRoot);
    const argsPath = join(tempRoot, "args.txt");
    const tuttiCliPath = join(tempRoot, "tutti");
    await writeFile(
      tuttiCliPath,
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argsPath)}\n`,
    );
    await chmod(tuttiCliPath, 0o755);
    const app = buildTestApp({
      env: {
        tuttiAppId: "ai-media-canvas",
        tuttiCliPath,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/open",
      payload: {
        "project-id": "project-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect((await readFile(argsPath, "utf8")).trim().split("\n")).toEqual([
      "app",
      "open",
      "--app-id",
      "ai-media-canvas",
      "--route",
      "/canvas",
      "--param",
      "id=canvas-1",
    ]);
  });

  it("returns a CLI error when open is unavailable outside Tutti runtime", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/open",
      payload: {},
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      kind: "error",
      error: {
        code: "open_unavailable",
        message: "Tutti app id is not configured for this runtime.",
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
        "project-id": "project-1",
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

  it("requires generation image commands to pass a project id", async () => {
    const jobOperations = {
      createImageJob: vi.fn(),
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

  it("requires generation video commands to pass a project id", async () => {
    const jobOperations = {
      createVideoJob: vi.fn(),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/video",
      payload: {
        prompt: "A launch video",
        model: "google-official/veo-3.1-generate-preview",
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
        "project-id": "project-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "agnes-image/agnes-image-2.1-flash",
      project_id: "project-1",
      canvas_id: "canvas-1",
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
        "project-id": "project-1",
        "direct-user": true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "codex/gpt-image-2",
      project_id: "project-1",
      canvas_id: "canvas-1",
    });
  });

  it("unwraps Tutti app CLI invoke envelopes for generation image commands", async () => {
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
        schemaVersion: "tutti.app.cli.invoke.v1",
        commandId: "ai-media-canvas.generation.image",
        appId: "ai-media-canvas",
        scope: "aimc",
        path: ["generation", "image"],
        workspaceId: "workspace-1",
        input: {
          prompt: "A launch poster",
          model: "codex/gpt-image-2",
          "project-id": "project-1",
          "direct-user": true,
        },
        outputMode: "json",
        context: {
          source: "cli",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "codex/gpt-image-2",
      project_id: "project-1",
      canvas_id: "canvas-1",
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
        "project-id": "project-1",
        "caller-provider": "claude",
        "codex-imagegen-consent": "allow-once",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "codex/gpt-image-2",
      project_id: "project-1",
      canvas_id: "canvas-1",
      caller_provider: "claude",
      codex_imagegen_consent: "allow-once",
      codex_imagegen_delegation_allowed: true,
    });
  });

  it("prefers an explicit canvas id over the project primary canvas for image generation", async () => {
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
        "project-id": "project-1",
        "canvas-id": "canvas-explicit",
        "direct-user": true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createImageJob).toHaveBeenCalledWith({
      prompt: "A launch poster",
      model: "codex/gpt-image-2",
      project_id: "project-1",
      canvas_id: "canvas-explicit",
    });
  });

  it("uses the project primary canvas for video generation when canvas id is omitted", async () => {
    const jobOperations = {
      createVideoJob: vi.fn(async (input) => ({
        job: {
          id: "job-video-1",
          payload: input,
          status: "queued",
        },
      })),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/video",
      payload: {
        prompt: "A launch video",
        model: "google-official/veo-3.1-generate-preview",
        "project-id": "project-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createVideoJob).toHaveBeenCalledWith({
      prompt: "A launch video",
      model: "google-official/veo-3.1-generate-preview",
      project_id: "project-1",
      canvas_id: "canvas-1",
    });
  });

  it("prefers an explicit canvas id over the project primary canvas for video generation", async () => {
    const jobOperations = {
      createVideoJob: vi.fn(async (input) => ({
        job: {
          id: "job-video-1",
          payload: input,
          status: "queued",
        },
      })),
    };
    const app = buildTestApp({ jobOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/generation/video",
      payload: {
        prompt: "A launch video",
        model: "google-official/veo-3.1-generate-preview",
        "project-id": "project-1",
        "canvas-id": "canvas-explicit",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(jobOperations.createVideoJob).toHaveBeenCalledWith({
      prompt: "A launch video",
      model: "google-official/veo-3.1-generate-preview",
      project_id: "project-1",
      canvas_id: "canvas-explicit",
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
    env: loadServerEnv(
      {
        version: "1.2.3",
        ...((overrides.env as Partial<ServerEnv> | undefined) ?? {}),
      },
      {},
    ),
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
    ...(overrides.appOpenRequester
      ? { appOpenRequester: overrides.appOpenRequester as never }
      : {}),
    projectOperations: {
      createProject: vi.fn(),
      getProject: vi.fn(),
      listProjects: vi.fn(async () => ({
        projects: [
          {
            id: "project-1",
            name: "Project 1",
            slug: "project-1",
            description: null,
            thumbnailUrl: null,
            primaryCanvas: {
              id: "canvas-1",
              name: "Canvas",
              isPrimary: true,
            },
            createdAt: "2026-06-10T00:00:00.000Z",
            updatedAt: "2026-06-10T00:00:00.000Z",
          },
        ],
      })),
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
