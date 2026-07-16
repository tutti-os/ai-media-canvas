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
      startupTimeoutMs: 120_000,
      toolTimeoutMs: 1_800_000,
    });

    expect(config).toMatchObject({
      name: "aimc",
      type: "stdio",
      command: "node",
      args: ["/package/server/tools-mcp.js"],
      startupTimeoutMs: 120_000,
      toolTimeoutMs: 1_800_000,
      env: {
        AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:4000/api/tools",
        AIMC_TOOL_TOKEN: "tool-token",
      },
    });
    expect(config).not.toHaveProperty("executionSide");
  });

  it("adds MCP timeout metadata for the development entrypoint", () => {
    const config = createAimcToolsMcpServerConfig({
      gatewayBaseUrl: "http://127.0.0.1:4000/api/tools",
      gatewayToken: "tool-token",
      startupTimeoutMs: 120_000,
      toolTimeoutMs: 1_800_000,
    });

    expect(config).toMatchObject({
      name: "aimc",
      type: "stdio",
      command: "pnpm",
      startupTimeoutMs: 120_000,
      toolTimeoutMs: 1_800_000,
      env: {
        AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:4000/api/tools",
        AIMC_TOOL_TOKEN: "tool-token",
      },
    });
    expect(config).not.toHaveProperty("executionSide");
  });
});
