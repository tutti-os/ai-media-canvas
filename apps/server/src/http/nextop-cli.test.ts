import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { registerNextopCliRoutes } from "./nextop-cli.js";

const apps: Array<ReturnType<typeof Fastify>> = [];

describe("registerNextopCliRoutes", () => {
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
      url: "/nextop/cli/projects/create",
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
      url: "/nextop/cli/agent/run",
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

  it("returns CLI errors for missing required inputs", async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/nextop/cli/projects/get",
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
  void registerNextopCliRoutes(app, {
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
