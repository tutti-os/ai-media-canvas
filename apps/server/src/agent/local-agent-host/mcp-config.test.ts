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
      command: process.execPath,
      args: ["/package/server/tools-mcp.js"],
      env: {
        AIMC_TOOL_GATEWAY_URL: "http://127.0.0.1:4000/api/tools",
        AIMC_TOOL_TOKEN: "tool-token",
      },
    });
  });
});
