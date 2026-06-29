import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { registerTuttiCliRoutes } from "./nextop-cli.js";

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

  it("imports local image files without embedding them in canvas content JSON", async () => {
    const canvasOperations = {
      importImageFile: vi.fn(async (input) => ({
        assetId: "asset-1",
        elementId: "element-1",
        url: "http://127.0.0.1:3001/local-assets/asset-1",
        width: input.width,
        height: input.height,
      })),
    };
    const app = buildTestApp({ canvasOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/canvases/insert-image",
      payload: {
        "canvas-id": "canvas-1",
        "file-path": "/tmp/generated.png",
        title: "Generated poster",
        width: 1200,
        height: 1600,
        x: 10,
        y: 20,
        "placement-width": 300,
        "placement-height": 400,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(canvasOperations.importImageFile).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      filePath: "/tmp/generated.png",
      title: "Generated poster",
      width: 1200,
      height: 1600,
      placement: {
        x: 10,
        y: 20,
        width: 300,
        height: 400,
      },
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        assetId: "asset-1",
        elementId: "element-1",
        url: "http://127.0.0.1:3001/local-assets/asset-1",
        width: 1200,
        height: 1600,
      },
    });
  });

  it("imports local video files without embedding them in canvas content JSON", async () => {
    const canvasOperations = {
      importVideoFile: vi.fn(async (input) => ({
        assetId: "video-asset-1",
        durationSeconds: input.durationSeconds,
        elementId: "element-1",
        url: "http://127.0.0.1:3001/local-assets/video-asset-1",
        width: input.width,
        height: input.height,
      })),
    };
    const app = buildTestApp({ canvasOperations });

    const response = await app.inject({
      method: "POST",
      url: "/tutti/cli/canvases/insert-video",
      payload: {
        "canvas-id": "canvas-1",
        "file-path": "/tmp/generated.mp4",
        title: "Generated clip",
        width: 1920,
        height: 1080,
        duration: 8,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(canvasOperations.importVideoFile).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      filePath: "/tmp/generated.mp4",
      title: "Generated clip",
      width: 1920,
      height: 1080,
      durationSeconds: 8,
    });
    expect(response.json()).toEqual({
      kind: "json",
      value: {
        assetId: "video-asset-1",
        durationSeconds: 8,
        elementId: "element-1",
        url: "http://127.0.0.1:3001/local-assets/video-asset-1",
        width: 1920,
        height: 1080,
      },
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
