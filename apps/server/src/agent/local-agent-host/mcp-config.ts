import { resolve } from "node:path";

import type { LocalAgentMcpServerConfig } from "@tutti-os/agent-acp-kit";

export type AimcToolsMcpServerConfig = LocalAgentMcpServerConfig & {
  startupTimeoutMs?: number;
  type: "stdio";
  toolTimeoutMs?: number;
};

export function createAimcToolsMcpServerConfig(input: {
  gatewayBaseUrl: string;
  gatewayToken: string;
  startupTimeoutMs?: number;
  toolTimeoutMs?: number;
}): AimcToolsMcpServerConfig {
  const timeoutConfig = {
    ...(input.startupTimeoutMs
      ? { startupTimeoutMs: input.startupTimeoutMs }
      : {}),
    ...(input.toolTimeoutMs ? { toolTimeoutMs: input.toolTimeoutMs } : {}),
  };
  const packagedMcpServerPath = process.env.AIMC_TOOLS_MCP_PATH?.trim();
  if (packagedMcpServerPath) {
    return {
      name: "aimc",
      type: "stdio",
      command: "node",
      args: [packagedMcpServerPath],
      ...timeoutConfig,
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
    ...timeoutConfig,
    env: {
      AIMC_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
      AIMC_TOOL_TOKEN: input.gatewayToken,
    },
  };
}
