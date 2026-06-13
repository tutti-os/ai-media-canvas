import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { createAgentBackendMock } = vi.hoisted(() => ({
  createAgentBackendMock: vi.fn(() => ({ factory: { kind: "backend" } })),
}));

const { localAgentRuntimeRunMock } = vi.hoisted(() => ({
  localAgentRuntimeRunMock: vi.fn(async function* () {
    yield {
      type: "done" as const,
      reason: "completed" as const,
      exitCode: 0,
    };
  }),
}));

vi.mock("./backends/index.js", () => ({
  createAgentBackend: createAgentBackendMock,
}));

import { createLocalStore } from "../local/store.js";
import { createLocalUserClient } from "../local/user-client.js";
import { AIMC_SYSTEM_PROMPT } from "./prompts/aimc-main.js";
import { createAgentRunService } from "./runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createAgentRunService", () => {
  it("prepends saved session messages and avoids duplicating the current user prompt", async () => {
    let capturedInput: unknown;
    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn((input: unknown) => {
        capturedInput = input;
        return (async function* () {})();
      }),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [
        {
          id: "m1",
          role: "user",
          content: "请为寿司品牌做一组极简 Logo 探索。",
          contentBlocks: null,
          createdAt: "2026-06-03T13:59:35.171Z",
          toolActivities: null,
        },
        {
          id: "m2",
          role: "assistant",
          content: "好的，我会先为您呈现初步的设计方案。",
          contentBlocks: null,
          createdAt: "2026-06-03T13:59:41.885Z",
          toolActivities: null,
        },
        {
          id: "m3",
          role: "user",
          content: "继续",
          contentBlocks: null,
          createdAt: "2026-06-03T14:01:29.811Z",
          toolActivities: null,
        },
      ],
    });

    const run = runs.createRun({
      canvasId: "canvas-1",
      conversationId: "canvas-1",
      prompt: "继续",
      sessionId: "session-1",
    });

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the agent invocation.
    }

    expect(capturedInput).toMatchObject({
      messages: [
        { content: "请为寿司品牌做一组极简 Logo 探索。" },
        { content: "好的，我会先为您呈现初步的设计方案。" },
        { content: "继续" },
      ],
    });
  });

  it("uses saved session messages when a local thread id is present without persistence", async () => {
    let capturedInput: unknown;
    let capturedConfig: unknown;
    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn((input: unknown, config: unknown) => {
        capturedInput = input;
        capturedConfig = config;
        return (async function* () {})();
      }),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [
        {
          id: "m1",
          role: "user",
          content: "上一句",
          contentBlocks: null,
          createdAt: "2026-06-03T13:59:35.171Z",
          toolActivities: null,
        },
      ],
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        connectionId: "conn-1",
        threadId: "thread:session-1",
        userId: "user-1",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "run.failed")).toBe(false);
    expect(capturedInput).toMatchObject({
      messages: [{ content: "上一句" }, { content: "继续" }],
    });
    expect(capturedConfig).toMatchObject({
      configurable: {
        canvas_id: "canvas-1",
        connection_id: "conn-1",
        user_id: "user-1",
      },
    });
  });

  it("prefers an explicit server runtime kind over codex model prefix inference", async () => {
    localAgentRuntimeRunMock.mockClear();

    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-server",
            timestamp: "2026-06-04T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "server-deepagent",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the agent invocation.
    }

    expect(agentFactory).toHaveBeenCalled();
    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
  });

  it("provides a LangGraph store to server deepagent factories", async () => {
    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-server-store",
            timestamp: "2026-06-04T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "搜索项目资料",
        sessionId: "session-1",
      },
      {
        model: "agnes:agnes-2.0-flash",
        runtimeKind: "server-deepagent",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the agent invocation.
    }

    expect(agentFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        store: expect.objectContaining({
          get: expect.any(Function),
          put: expect.any(Function),
          search: expect.any(Function),
        }),
      }),
    );
  });

  it("persists explicit local runtime kind when Codex is requested", async () => {
    localAgentRuntimeRunMock.mockClear();
    const updateRun = vi.fn();

    const runs = createAgentRunService({
      agentRunStore: {
        createRun: vi.fn(),
        updateRun,
      },
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    expect(run).toMatchObject({
      runtimeKind: "local-agent",
      runtimeProvider: "codex",
    });

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localAgentRuntimeRunMock).toHaveBeenCalled();
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: run.runId,
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
        status: "running",
      }),
    );
  });

  it("preserves the local CLI default model for the host adapter", async () => {
    localAgentRuntimeRunMock.mockClear();
    const localAgentRuntimeDetectMock = vi.fn(async () => [
      {
        provider: "codex" as const,
        displayName: "Codex",
        result: {
          supported: true as const,
          models: [
            { id: "default", label: "Default (CLI config)" },
            { id: "gpt-5.5", label: "gpt-5.5" },
          ],
        },
      },
    ]);

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        detect: localAgentRuntimeDetectMock,
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:default",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localAgentRuntimeDetectMock).not.toHaveBeenCalled();
    expect(localAgentRuntimeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "default",
        provider: "codex",
      }),
    );
  });

  it("returns image jobs after inserting canvas generation nodes and polling", async () => {
    let capturedGatewaySession:
      | {
          submitImageJob?: (input: {
            aspectRatio: string;
            model: string;
            prompt: string;
            title: string;
          }) => Promise<{
            error?: string;
            elementId?: string;
            imageUrl?: string;
            jobId: string;
            mimeType?: string;
            status?: "generating";
            width?: number;
            height?: number;
          }>;
        }
      | undefined;
    const createSession = vi.fn((input) => {
      capturedGatewaySession = input;
      return { token: "tool-token" };
    });
    const getJobAdmin = vi.fn(async () => ({
      attempt_count: 0,
      max_attempts: 3,
      result: {
        asset_id: "asset-1",
        signed_url: "http://127.0.0.1:3001/local-assets/asset-1",
        object_path: "generated/asset-1.png",
        mime_type: "image/png",
        width: 1024,
        height: 1024,
      },
      status: "succeeded",
    }));
    const canvasState = {
      content: {
        elements: [] as Array<Record<string, unknown>>,
        appState: {},
        files: {},
      },
    };

    const runs = createAgentRunService({
      createUserClient: () => ({
        from(table: string) {
          if (table === "canvases") {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              async single() {
                return { data: { content: canvasState.content }, error: null };
              },
              async maybeSingle() {
                return { data: null, error: null };
              },
              update(payload: {
                content: {
                  elements: Array<Record<string, unknown>>;
                  appState: Record<string, unknown>;
                  files: Record<string, unknown>;
                };
              }) {
                canvasState.content = payload.content;
                return {
                  async eq() {
                    return { error: null };
                  },
                };
              },
            };
          }
          expect(table).toBe("workspaces");
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            limit() {
              return this;
            },
            async single() {
              return { data: { id: "workspace-1" }, error: null };
            },
          };
        },
      }),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      jobService: {
        createJob: vi.fn(async () => ({ id: "job-1" })),
        getJobAdmin,
      } as never,
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession,
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "conversation-1",
        prompt: "生成一张图",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
        userId: "user-1",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so the local tool gateway session is created.
    }

    const submitImageJob = capturedGatewaySession?.submitImageJob;
    expect(submitImageJob).toBeTypeOf("function");
    if (!submitImageJob) {
      throw new Error("Expected local tool gateway to receive submitImageJob");
    }
    await expect(
      submitImageJob({
        aspectRatio: "1:1",
        model: "agnes-image/agnes-image-2.1-flash",
        prompt: "young playful logo",
        title: "logo",
      }),
    ).resolves.toMatchObject({
      elementId: expect.any(String),
      imageUrl: "http://127.0.0.1:3001/local-assets/asset-1",
      jobId: "job-1",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    });
    expect(canvasState.content.elements).toHaveLength(1);
    expect(canvasState.content.elements[0]).toMatchObject({
      type: "image",
      customData: {
        assetId: "asset-1",
        jobId: "job-1",
        source: "generated",
        storageUrl: "/local-assets/asset-1",
        title: "logo",
      },
    });
    const fileId = canvasState.content.elements[0]?.fileId as string;
    expect(canvasState.content.files[fileId]).toMatchObject({
      assetId: "asset-1",
      mimeType: "image/png",
      objectPath: "generated/asset-1.png",
      storageUrl: "/local-assets/asset-1",
    });
    expect(getJobAdmin).toHaveBeenCalledWith("job-1");
  });

  it("keeps image generation nodes visible while job polling is pending", async () => {
    let capturedGatewaySession:
      | {
          submitImageJob?: (input: {
            aspectRatio: string;
            model: string;
            prompt: string;
            title: string;
          }) => Promise<{
            error?: string;
            elementId?: string;
            imageUrl?: string;
            jobId: string;
            mimeType?: string;
            status?: "generating";
            width?: number;
            height?: number;
          }>;
        }
      | undefined;
    const createSession = vi.fn((input) => {
      capturedGatewaySession = input;
      return { token: "tool-token" };
    });
    const canvasState = {
      content: {
        elements: [] as Array<Record<string, unknown>>,
        appState: {},
        files: {},
      },
    };
    let releaseJob: (() => void) | undefined;
    const getJobAdmin = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseJob = () =>
            resolve({
              attempt_count: 0,
              max_attempts: 3,
              result: {
                asset_id: "asset-1",
                signed_url: "http://127.0.0.1:3001/local-assets/asset-1",
                mime_type: "image/png",
                width: 1024,
                height: 1024,
              },
              status: "succeeded",
            });
        }),
    );

    const runs = createAgentRunService({
      createUserClient: () => ({
        from(table: string) {
          if (table === "canvases") {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              async single() {
                return { data: { content: canvasState.content }, error: null };
              },
              async maybeSingle() {
                return { data: null, error: null };
              },
              update(payload: {
                content: {
                  elements: Array<Record<string, unknown>>;
                  appState: Record<string, unknown>;
                  files: Record<string, unknown>;
                };
              }) {
                canvasState.content = payload.content;
                return {
                  async eq() {
                    return { error: null };
                  },
                };
              },
            };
          }
          expect(table).toBe("workspaces");
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            limit() {
              return this;
            },
            async single() {
              return { data: { id: "workspace-1" }, error: null };
            },
          };
        },
      }),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      jobService: {
        createJob: vi.fn(async () => ({ id: "job-1" })),
        getJobAdmin,
      } as never,
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession,
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "conversation-1",
        prompt: "生成一张图",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
        userId: "user-1",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so the local tool gateway session is created.
    }

    const submitImageJob = capturedGatewaySession?.submitImageJob;
    expect(submitImageJob).toBeTypeOf("function");
    if (!submitImageJob) {
      throw new Error("Expected local tool gateway to receive submitImageJob");
    }
    const promise = submitImageJob({
      aspectRatio: "1:1",
      model: "agnes-image/agnes-image-2.1-flash",
      prompt: "young playful logo",
      title: "logo",
    });
    await vi.waitFor(() => {
      expect(canvasState.content.elements).toHaveLength(1);
    });
    expect(canvasState.content.elements[0]).toMatchObject({
      type: "rectangle",
      customData: {
        type: "image-generator",
        status: "generating",
        jobId: "job-1",
        prompt: "young playful logo",
      },
    });
    releaseJob?.();
    await expect(promise).resolves.toMatchObject({
      elementId: expect.any(String),
      imageUrl: "http://127.0.0.1:3001/local-assets/asset-1",
      jobId: "job-1",
    });
  });

  it("returns video jobs with canvas generation nodes before polling", async () => {
    let capturedGatewaySession:
      | {
          submitVideoJob?: (input: {
            aspectRatio: string;
            duration: number;
            model: string;
            prompt: string;
            resolution: string;
            title: string;
          }) => Promise<{
            error?: string;
            elementId?: string;
            jobId: string;
          }>;
        }
      | undefined;
    const createSession = vi.fn((input) => {
      capturedGatewaySession = input;
      return { token: "tool-token" };
    });
    const getJobAdmin = vi.fn(async () => ({
      attempt_count: 0,
      max_attempts: 3,
      status: "running",
    }));
    const canvasState = {
      content: {
        elements: [] as Array<Record<string, unknown>>,
        appState: {},
        files: {},
      },
    };

    const runs = createAgentRunService({
      createUserClient: () => ({
        from(table: string) {
          if (table === "canvases") {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              async single() {
                return { data: { content: canvasState.content }, error: null };
              },
              async maybeSingle() {
                return { data: null, error: null };
              },
              update(payload: {
                content: {
                  elements: Array<Record<string, unknown>>;
                  appState: Record<string, unknown>;
                  files: Record<string, unknown>;
                };
              }) {
                canvasState.content = payload.content;
                return {
                  async eq() {
                    return { error: null };
                  },
                };
              },
            };
          }
          expect(table).toBe("workspaces");
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            limit() {
              return this;
            },
            async single() {
              return { data: { id: "workspace-1" }, error: null };
            },
          };
        },
      }),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      jobService: {
        createJob: vi.fn(async () => ({ id: "job-video-1" })),
        getJobAdmin,
      } as never,
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession,
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "conversation-1",
        prompt: "生成一段视频",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
        userId: "user-1",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so the local tool gateway session is created.
    }

    const submitVideoJob = capturedGatewaySession?.submitVideoJob;
    expect(submitVideoJob).toBeTypeOf("function");
    if (!submitVideoJob) {
      throw new Error("Expected local tool gateway to receive submitVideoJob");
    }
    await expect(
      submitVideoJob({
        aspectRatio: "16:9",
        duration: 5,
        model: "google-official/veo-3.1-generate-preview",
        prompt: "product reveal",
        resolution: "720p",
        title: "product reveal",
      }),
    ).resolves.toMatchObject({
      elementId: expect.any(String),
      jobId: "job-video-1",
      status: "generating",
    });
    expect(canvasState.content.elements).toHaveLength(1);
    expect(canvasState.content.elements[0]).toMatchObject({
      type: "rectangle",
      customData: {
        type: "video-generator",
        status: "generating",
        jobId: "job-video-1",
        prompt: "product reveal",
      },
    });
    expect(getJobAdmin).not.toHaveBeenCalled();
  });

  it("passes non-Codex local-agent providers through the host adapter", async () => {
    const localRun = vi.fn(async function* (params) {
      yield {
        type: "text_delta" as const,
        text: `${params.provider}:${params.runtimeProvider}`,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      localAgentProviderPlugins: [
        {
          id: "claude",
          displayName: "Claude Code",
          kind: "local-agent",
          async detect() {
            return null;
          },
          capabilities() {
            return {
              cancel: true,
              nativeResume: false,
              streaming: true,
              toolGateway: true,
              maxConcurrentRuns: 1,
            };
          },
          async buildLaunchPlan() {
            throw new Error("not used");
          },
          async *run() {
            yield* [];
            throw new Error("not used");
          },
        },
      ],
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "sonnet",
        runtimeKind: "local-agent",
        runtimeProvider: "claude",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        runtimeProvider: "claude",
        model: "sonnet",
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.delta",
          delta: "claude:claude",
        }),
      ]),
    );
  });

  it("strips the local provider prefix before invoking generic ACP providers", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      localAgentProviderPlugins: [
        {
          id: "hermes",
          displayName: "Hermes",
          kind: "local-agent",
          async detect() {
            return null;
          },
          capabilities() {
            return {
              cancel: true,
              nativeResume: false,
              streaming: true,
              toolGateway: false,
              maxConcurrentRuns: 1,
            };
          },
          async buildLaunchPlan() {
            throw new Error("not used");
          },
          async *run() {
            yield* [];
            throw new Error("not used");
          },
        },
      ],
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "hermes:openai-codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "hermes",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "hermes",
        runtimeProvider: "hermes",
        model: "openai-codex:gpt-5.4",
      }),
    );
  });

  it("resolves resume mode and passes provider-local resume into the local runtime", async () => {
    const createRun = vi.fn();
    const updateRun = vi.fn();
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
        sessionId: "provider-session-next",
        resumeToken: "resume-token-next",
      };
    });

    const runs = createAgentRunService({
      agentRunStore: {
        createRun,
        getRun: vi.fn(() => ({
          id: "run-previous",
          provider_session_id: "provider-session-prev",
          resume_token: "resume-token-prev",
          runtime_kind: "local-agent",
          runtime_provider: "codex",
          session_id: "session-1",
          status: "completed",
        })),
        updateRun,
      },
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        resumeFromRunId: "run-previous",
        resumeMode: "auto",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    expect(run.resumeMode).toBe("provider-local");
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRunId: "run-previous",
        resumeMode: "provider-local",
      }),
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resume: {
          mode: "provider",
          providerSessionId: "provider-session-prev",
          resumeToken: "resume-token-prev",
        },
      }),
    );
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSessionId: "provider-session-next",
        resumeToken: "resume-token-next",
        runId: run.runId,
      }),
    );
  });

  it("turns cross-provider resume into a handoff without provider-native resume", async () => {
    const createRun = vi.fn();
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      agentRunStore: {
        createRun,
        getRun: vi.fn(() => ({
          id: "run-previous",
          runtime_kind: "local-agent",
          runtime_provider: "claude",
          session_id: "session-1",
          status: "completed",
        })),
        updateRun: vi.fn(),
      },
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        resumeFromRunId: "run-previous",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    expect(run.resumeMode).toBe("handoff");
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRunId: "run-previous",
        resumeMode: "handoff",
      }),
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Resume handoff context:"),
        resume: {
          mode: "fresh",
        },
      }),
    );
  });

  it("passes the AIMC system prompt to local-agent providers", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: AIMC_SYSTEM_PROMPT,
      }),
    );
  });

  it("passes enabled local workspace skills to local-agent providers", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-runtime-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Runtime Skills" });
    let capturedPrompt = "";
    const localRun = vi.fn(async function* (input: {
      cwd: string;
      prompt: string;
    }) {
      capturedPrompt = input.prompt;
      expect(
        readFileSync(
          join(input.cwd, "workspace-skills", "canvas-director", "SKILL.md"),
          "utf8",
        ),
      ).toContain("Inspect the real element bounds");
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      createUserClient: () => createLocalUserClient(store),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: project.primaryCanvas.id,
        conversationId: project.primaryCanvas.id,
        mentions: [
          {
            id: "skill-system-canvas-director",
            label: "Canvas Director",
            mentionType: "skill",
            slug: "canvas-director",
          },
        ],
        prompt: "有看到 Canvas Director 这一个 skill 吗",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the provider invocation.
    }

    expect(localRun).toHaveBeenCalledWith(
      expect.objectContaining({
        skillManifest: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Inspect the real element bounds"),
            skillId: "canvas-director",
            slug: "canvas-director",
          }),
        ]),
      }),
    );
    expect(capturedPrompt).toContain(
      "workspace-skills/canvas-director/SKILL.md",
    );
    expect(capturedPrompt).toContain(
      "use relative paths such as `workspace-skills/<slug>/SKILL.md`",
    );
    expect(capturedPrompt).not.toContain(
      "/workspace-skills/canvas-director/SKILL.md",
    );
  });

  it("passes enabled workspace skills into the Agnes server backend", async () => {
    createAgentBackendMock.mockClear();
    const dataRoot = mkdtempSync(join(tmpdir(), "aimc-runtime-"));
    tempDirs.push(dataRoot);

    const store = createLocalStore({
      assetBaseUrl: "http://127.0.0.1:3001",
      dataRoot,
    });
    const project = store.createProject({ name: "Agnes Skills" });

    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-agnes-skills",
            timestamp: "2026-06-11T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      createUserClient: () => createLocalUserClient(store),
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    const run = runs.createRun(
      {
        canvasId: project.primaryCanvas.id,
        conversationId: project.primaryCanvas.id,
        mentions: [
          {
            id: "skill-system-canvas-director",
            label: "Canvas Director",
            mentionType: "skill",
            slug: "canvas-director",
          },
        ],
        prompt: "使用 Canvas Director 这个 skill 看一下画布",
        sessionId: "session-1",
      },
      {
        accessToken: "local-token",
        model: "agnes:agnes-2.0-flash",
        runtimeKind: "server-deepagent",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the server backend.
    }

    expect(agentFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceSkills: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Inspect the real element bounds"),
            name: "canvas-director",
            path: "/workspace-skills/canvas-director/SKILL.md",
          }),
        ]),
      }),
    );
    expect(createAgentBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
      }),
      project.primaryCanvas.id,
      {
        workspaceSkills: expect.arrayContaining([
          expect.objectContaining({
            name: "canvas-director",
          }),
        ]),
      },
    );
  });

  it("maps local-agent tool results into stream events with media artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_call" as const,
        id: "tool-1",
        name: "generate_image",
        input: { prompt: "poster" },
      };
      yield {
        type: "tool_result" as const,
        id: "tool-1",
        name: "generate_image",
        output: {
          imageUrl: "https://example.com/image.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          title: "poster",
        },
        summary: "generated",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(localRun).toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.started",
          toolCallId: "tool-1",
          toolName: "generate_image",
        }),
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-1",
          toolName: "generate_image",
          outputSummary: "generated",
          artifacts: [
            expect.objectContaining({
              type: "image",
              url: "https://example.com/image.png",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps local-agent screenshot tool results into image artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_result" as const,
        id: "tool-screenshot",
        name: "screenshot_canvas",
        output: {
          screenshotUrl: "https://example.com/screenshot.png",
          mimeType: "image/png",
          width: 800,
          height: 600,
        },
        summary: "screenshot captured",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "截图",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-screenshot",
          toolName: "screenshot_canvas",
          artifacts: [
            expect.objectContaining({
              type: "image",
              url: "https://example.com/screenshot.png",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps local-agent persisted sandbox files into image artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_result" as const,
        id: "tool-persist-file",
        name: "persist_sandbox_file",
        output: {
          summary: "File uploaded successfully: poster.png",
          url: "https://example.com/storage/poster.png",
          path: "workspace/generated/poster.png",
          mimeType: "image/png",
          size: 12345,
        },
        summary: "File uploaded successfully: poster.png",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "保存文件",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-persist-file",
          toolName: "persist_sandbox_file",
          outputSummary: "File uploaded successfully: poster.png",
          artifacts: [
            expect.objectContaining({
              type: "image",
              url: "https://example.com/storage/poster.png",
              mimeType: "image/png",
            }),
          ],
        }),
      ]),
    );
  });

  it("maps local-agent video tool results into stream events with video artifacts", async () => {
    const localRun = vi.fn(async function* () {
      yield {
        type: "tool_call" as const,
        id: "tool-video",
        name: "generate_video",
        input: { prompt: "motion poster" },
      };
      yield {
        type: "tool_result" as const,
        id: "tool-video",
        name: "generate_video",
        output: {
          videoUrl: "https://example.com/video.mp4",
          mimeType: "video/mp4",
          width: 1280,
          height: 720,
          durationSeconds: 5,
          title: "motion poster",
        },
        summary: "video generated",
        isError: false,
      };
      yield {
        type: "done" as const,
        reason: "completed" as const,
        exitCode: 0,
      };
    });

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localRun,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
        runtimeKind: "local-agent",
        runtimeProvider: "codex",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.completed",
          toolCallId: "tool-video",
          toolName: "generate_video",
          outputSummary: "video generated",
          artifacts: [
            expect.objectContaining({
              type: "video",
              url: "https://example.com/video.mp4",
              durationSeconds: 5,
            }),
          ],
        }),
      ]),
    );
  });

  it("falls back to the server runtime when Codex is inferred but no local gateway is registered", async () => {
    localAgentRuntimeRunMock.mockClear();

    const agentFactory = vi.fn(() => ({
      stream: vi.fn(),
      streamEvents: vi.fn(() =>
        (async function* () {
          yield {
            type: "run.completed" as const,
            runId: "run-server-fallback",
            timestamp: "2026-06-04T00:00:00.000Z",
          };
        })(),
      ),
    }));

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "继续",
        sessionId: "session-1",
      },
      {
        model: "codex:gpt-5.4",
      },
    );

    const events = [];
    for await (const event of runs.streamRun(run.runId)) {
      events.push(event);
    }

    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
    expect(agentFactory).toHaveBeenCalled();
    expect(events.some((event) => event.type === "run.failed")).toBe(false);
  });

  it("fails fast when local Codex is explicitly requested without a registered gateway", async () => {
    localAgentRuntimeRunMock.mockClear();

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    expect(() =>
      runs.createRun(
        {
          canvasId: "canvas-1",
          conversationId: "canvas-1",
          prompt: "继续",
          sessionId: "session-1",
        },
        {
          model: "codex:gpt-5.4",
          runtimeKind: "local-agent",
          runtimeProvider: "codex",
        },
      ),
    ).toThrow("No runtime provider registered for local-agent (codex)");

    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
  });

  it("does not register local Codex when trusted local mode is disabled", async () => {
    localAgentRuntimeRunMock.mockClear();

    const runs = createAgentRunService({
      env: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        trustedLocalAgentMode: false,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      localAgentRuntime: {
        run: localAgentRuntimeRunMock,
      },
      loadSessionMessages: async () => [],
      toolGateway: {
        createSession: vi.fn(() => ({ token: "tool-token" })),
        revokeSession: vi.fn(),
      } as never,
      toolGatewayBaseUrl: "http://127.0.0.1:3001/api/local-tools",
    });

    expect(() =>
      runs.createRun(
        {
          canvasId: "canvas-1",
          conversationId: "canvas-1",
          prompt: "继续",
          sessionId: "session-1",
        },
        {
          model: "codex:gpt-5.4",
          runtimeKind: "local-agent",
          runtimeProvider: "codex",
        },
      ),
    ).toThrow("No runtime provider registered for local-agent (codex)");

    expect(localAgentRuntimeRunMock).not.toHaveBeenCalled();
  });

  it("uses the managed credential runtime model instead of the Nextop model id", async () => {
    let capturedAgentOptions: unknown;
    const agentFactory = vi.fn((agentOptions) => {
      capturedAgentOptions = agentOptions;
      return {
        stream: vi.fn(),
        streamEvents: vi.fn(() =>
          (async function* () {
            yield {
              type: "run.completed" as const,
              runId: "run-managed-agnes",
              timestamp: "2026-06-13T00:00:00.000Z",
            };
          })(),
        ),
      };
    });

    const runs = createAgentRunService({
      agentFactory,
      env: {
        agentBackendMode: "state",
        agentModel: "openai:gpt-5.1",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      loadSessionMessages: async () => [],
    });

    const run = runs.createRun(
      {
        canvasId: "canvas-1",
        conversationId: "canvas-1",
        prompt: "hi",
        sessionId: "session-1",
      },
      {
        env: {
          agentBackendMode: "state",
          agentModel: "agnes:agnes-2.0-flash",
          agnesApiKey: "nextop-managed-agnes-key",
          port: 3001,
          version: "0.0.0",
          webOrigin: "http://localhost:3000",
        },
        model: "nextop:agnes:agnes-2.0-flash",
        runtimeKind: "server-deepagent",
      },
    );

    for await (const _event of runs.streamRun(run.runId)) {
      // Exhaust the stream so runtime reaches the agent factory.
    }

    expect(capturedAgentOptions).toMatchObject({
      env: expect.objectContaining({
        agentModel: "agnes:agnes-2.0-flash",
        agnesApiKey: "nextop-managed-agnes-key",
      }),
      model: "agnes:agnes-2.0-flash",
    });
  });
});
