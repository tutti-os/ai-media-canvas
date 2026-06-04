import { describe, expect, it, vi } from "vitest";

import { createLocalToolGatewayService } from "./tool-gateway.js";

describe("createLocalToolGatewayService", () => {
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
});
