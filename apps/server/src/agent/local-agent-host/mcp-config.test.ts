import { afterEach, describe, expect, it, vi } from "vitest";

import { createAimcToolsMcpServerConfig } from "./mcp-config.js";

describe("createAimcToolsMcpServerConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the packaged MCP server entrypoint when provided", () => {
    vi.stubEnv("AIMC_TOOLS_MCP_PATH", "/package/server/tools-mcp.js");

    const config = createAimcToolsMcpServerConfig({
      gatewayBaseUrl: "http://127.0.0.1:4000/api/tools",
      gatewayToken: "tool-token",
    });

    expect(config).toMatchObject({
      name: "aimc",
      type: "stdio",
      executionSide: "sandbox",
      command: "node",
      args: ["/package/server/tools-mcp.js"],
      env: {
        AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:4000/api/tools",
        AIMC_TOOL_TOKEN: "tool-token",
      },
    });
  });

  it("keeps the source-tree MCP server as a local dev fallback", () => {
    const config = createAimcToolsMcpServerConfig({
      gatewayBaseUrl: "http://127.0.0.1:4000/api/tools",
      gatewayToken: "tool-token",
    });

    expect(config).toMatchObject({
      name: "aimc",
      type: "stdio",
      command: "pnpm",
      env: {
        AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:4000/api/tools",
        AIMC_TOOL_TOKEN: "tool-token",
      },
    });
    expect(config).not.toHaveProperty("executionSide");
  });

  it("requires a packaged MCP entrypoint for managed sandbox execution", () => {
    expect(() =>
      createAimcToolsMcpServerConfig({
        gatewayBaseUrl: "http://127.0.0.1:4000/api/tools",
        gatewayToken: "tool-token",
        requireSandboxEntrypoint: true,
      }),
    ).toThrow(
      "AIMC_TOOLS_MCP_PATH is required for managed local-agent MCP sandbox execution.",
    );
  });
});
