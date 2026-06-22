import { resolve } from "node:path";

import type { LocalAgentMcpStdioServerConfig } from "@tutti-os/agent-acp-kit";

export type AimcToolsMcpServerConfig = LocalAgentMcpStdioServerConfig & {
  executionSide?: "sandbox";
  type: "stdio";
};

export function createAimcToolsMcpServerConfig(input: {
  gatewayBaseUrl: string;
  gatewayToken: string;
  requireSandboxEntrypoint?: boolean;
}): AimcToolsMcpServerConfig {
  const packagedMcpServerPath = process.env.AIMC_TOOLS_MCP_PATH?.trim();
  if (packagedMcpServerPath) {
    return {
      name: "aimc",
      type: "stdio",
      executionSide: "sandbox",
      command: "node",
      args: [packagedMcpServerPath],
      env: {
        AIMC_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
        AIMC_TOOL_TOKEN: input.gatewayToken,
      },
    };
  }

  if (input.requireSandboxEntrypoint) {
    throw new Error(
      "AIMC_TOOLS_MCP_PATH is required for managed local-agent MCP sandbox execution.",
    );
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
