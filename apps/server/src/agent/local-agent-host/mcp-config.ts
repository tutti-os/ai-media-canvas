import { resolve } from "node:path";

import type { LocalAgentMcpServerConfig } from "@nextop-os/agent-acp-kit";

export function createAimcToolsMcpServerConfig(input: {
  gatewayBaseUrl: string;
  gatewayToken: string;
}): LocalAgentMcpServerConfig {
  const packagedMcpServerPath = process.env.AIMC_TOOLS_MCP_PATH?.trim();
  if (packagedMcpServerPath) {
    return {
      name: "aimc",
      type: "stdio",
      command: process.execPath,
      args: [packagedMcpServerPath],
      env: {
        AIMC_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
        AIMC_TOOL_TOKEN: input.gatewayToken,
      },
    };
  }

  const serverRoot = resolve(import.meta.dirname, "../../..");
  const mcpServerPath = resolve(import.meta.dirname, "./tools-mcp.ts");
  return {
    name: "aimc",
    type: "stdio",
    command: "pnpm",
    args: ["--dir", serverRoot, "exec", "tsx", mcpServerPath],
    env: {
      AIMC_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
      AIMC_TOOL_TOKEN: input.gatewayToken,
    },
  };
}
