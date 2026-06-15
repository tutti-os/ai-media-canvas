import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../features/settings/settings-service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../features/settings/settings-service.js")
      >();
    return {
      ...actual,
      refreshGenerationProviders: vi.fn(),
    };
  },
);

import {
  clearProviders,
  registerImageProvider,
} from "../../generation/providers/registry.js";
import { createLocalToolGatewayService } from "./tool-gateway.js";

describe("createLocalToolGatewayService", () => {
  function createUserClientWithElements(
    elements: Array<Record<string, unknown>>,
  ) {
    const state = {
      content: {
        elements: structuredClone(elements),
        appState: {},
      },
    };

    return {
      state,
      from(table: string) {
        expect(table).toBe("canvases");
        return {
          select(_columns: string) {
            return this;
          },
          eq(_column: string, _value: string) {
            return this;
          },
          async single() {
            return { data: state, error: null };
          },
          update(payload: { content: typeof state.content }) {
            state.content = payload.content;
            return {
              async eq(_column: string, _value: string) {
                return { error: null };
              },
            };
          },
        };
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe("project-assets");
          return {
            async upload(
              _path: string,
              _buffer: Buffer,
              _options: { contentType: string },
            ) {
              return { error: null };
            },
            getPublicUrl(path: string) {
              return {
                data: {
                  publicUrl: `http://assets.test/${path}`,
                },
              };
            },
          };
        },
      },
    };
  }

  afterEach(() => {
    clearProviders();
  });

  it("includes workspace search and sandbox persistence tools for local-agent MCP sessions", () => {
    const backendFactory = vi.fn(() => ({
      grepRaw: vi.fn(),
    })) as never;
    const gateway = createLocalToolGatewayService({
      createUserClient: vi.fn(),
    });
    const session = gateway.createSession({
      accessToken: "access-token",
      backendFactory,
      canvasId: "canvas-1",
      runId: "run-1",
      runtimeEnv: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      sandboxDir: "/tmp/aimc-local-agent-run",
    });

    expect(gateway.getManifest(session.token).map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "project_search",
        "inspect_canvas",
        "manipulate_canvas",
        "generate_image",
        "generate_video",
        "persist_sandbox_file",
      ]),
    );
  });

  it("exposes image model schema limits in the generate_image tool manifest", () => {
    registerImageProvider({
      name: "agnes-image",
      models: [
        {
          id: "agnes-image/agnes-image-2.1-flash",
          displayName: "Agnes Image 2.1 Flash",
          description:
            "Agnes high-fidelity image generation and editing route.",
        },
      ],
      async generate() {
        throw new Error("not used");
      },
    });
    const gateway = createLocalToolGatewayService({
      createUserClient: vi.fn(),
    });
    const session = gateway.createSession({
      runId: "run-1",
      runtimeEnv: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    const tool = gateway
      .getManifest(session.token)
      .find((item) => item.name === "generate_image");
    expect(tool).toBeDefined();
    const inputSchema = tool?.inputSchema as {
      properties?: Record<string, { description?: string }>;
    };
    const modelDescription = inputSchema.properties?.model?.description ?? "";
    const aspectRatioDescription =
      inputSchema.properties?.aspectRatio?.description ?? "";

    expect(modelDescription).toContain(
      "aspectRatio: 1:1, 16:9, 9:16, 4:3, 3:4",
    );
    expect(modelDescription).toContain("inputImages: up to");
    expect(modelDescription).toContain("seed, size");
    expect(aspectRatioDescription).not.toContain("4:5");
    expect(aspectRatioDescription).not.toContain("auto-normalizes");
  });

  it("invokes project_search through the local-agent MCP gateway", async () => {
    const grepRaw = vi.fn(async () => [
      { path: "/workspace/brief.md", line: 2, text: "neon lemon robot" },
    ]);
    const gateway = createLocalToolGatewayService({
      createUserClient: vi.fn(),
    });
    const session = gateway.createSession({
      backendFactory: vi.fn(() => ({ grepRaw })) as never,
      runId: "run-1",
      runtimeEnv: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    await expect(
      gateway.callTool(session.token, "project_search", {
        query: "lemon",
      }),
    ).resolves.toMatchObject({
      isError: false,
      output: {
        matchCount: 1,
        matches: [
          {
            path: "/workspace/brief.md",
            line: 2,
            text: "neon lemon robot",
          },
        ],
      },
    });
    expect(grepRaw).toHaveBeenCalledWith("lemon", "/workspace", null);
  });

  it("persists inspect_canvas layout readiness across MCP tool calls", async () => {
    const gateway = createLocalToolGatewayService({
      createUserClient: () => createUserClientWithElements([]),
    });
    const session = gateway.createSession({
      accessToken: "access-token",
      canvasId: "canvas-1",
      runId: "run-1",
      runtimeEnv: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    await expect(
      gateway.callTool(session.token, "manipulate_canvas", {
        operations: [
          {
            action: "add_text",
            text: "产品说明",
            x: 100,
            y: 100,
          },
        ],
      }),
    ).resolves.toMatchObject({
      isError: true,
      output: {
        error: "layout_inspection_required",
      },
    });

    await expect(
      gateway.callTool(session.token, "inspect_canvas", {
        detail_level: "summary",
      }),
    ).resolves.toMatchObject({
      isError: false,
    });

    await expect(
      gateway.callTool(session.token, "manipulate_canvas", {
        operations: [
          {
            action: "add_text",
            text: "产品说明",
            x: 100,
            y: 100,
          },
        ],
      }),
    ).resolves.toMatchObject({
      isError: false,
      output: {
        applied: 1,
        success: true,
      },
    });
  });

  it("inserts direct generated images into the canvas for local-agent sessions", async () => {
    registerImageProvider({
      name: "test-provider",
      models: [
        {
          id: "test/image",
          displayName: "Test Image",
          description: "Test image model",
        },
      ],
      async generate() {
        return {
          url: "data:image/png;base64,AA==",
          mimeType: "image/png",
          width: 1024,
          height: 768,
        };
      },
    });
    const client = createUserClientWithElements([]);
    const pushToCanvas = vi.fn();
    const gateway = createLocalToolGatewayService({
      connectionPublisher: { pushToCanvas },
      createUserClient: () => client,
    });
    const session = gateway.createSession({
      accessToken: "access-token",
      canvasId: "canvas-1",
      runId: "run-1",
      runtimeEnv: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    const result = await gateway.callTool(session.token, "generate_image", {
      title: "Dancing boy",
      prompt: "A happy dancing boy",
      model: "test/image",
    });

    expect(result).toMatchObject({
      isError: false,
      output: {
        elementId: expect.any(String),
        imageUrl: expect.stringContaining(
          "http://assets.test/generated/run-1/",
        ),
      },
    });
    expect(client.state.content.elements).toHaveLength(1);
    expect(client.state.content.elements[0]).toMatchObject({
      id: (result.output as { elementId: string }).elementId,
      type: "image",
      width: 600,
      height: 450,
      customData: {
        source: "generated",
        title: "Dancing boy",
      },
    });
    expect(pushToCanvas).toHaveBeenCalledWith(
      "canvas-1",
      expect.objectContaining({
        runId: "run-1",
        type: "canvas.sync",
      }),
    );
  });

  it("returns a structured generate_image error when prompt is missing", async () => {
    const gateway = createLocalToolGatewayService({
      createUserClient: () => createUserClientWithElements([]),
    });
    const session = gateway.createSession({
      accessToken: "access-token",
      canvasId: "canvas-1",
      runId: "run-1",
      runtimeEnv: {
        agentBackendMode: "state",
        agentModel: "agnes:agnes-2.0-flash",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    await expect(
      gateway.callTool(session.token, "generate_image", {
        aspectRatio: "16:9",
        model: "test/image",
        placementHeight: 338,
      }),
    ).resolves.toMatchObject({
      isError: true,
      output: {
        error: expect.stringContaining("missing_prompt"),
      },
      outputSummary: expect.stringContaining("prompt is required"),
    });
  });
});
