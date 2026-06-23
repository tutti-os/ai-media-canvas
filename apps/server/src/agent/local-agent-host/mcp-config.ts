import { resolve } from "node:path";

import type { LocalAgentMcpServerConfig } from "@tutti-os/agent-acp-kit";

export type AimcToolsMcpServerConfig = LocalAgentMcpServerConfig & {
  executionSide?: "vm";
  startupTimeoutMs?: number;
  type: "stdio";
  toolTimeoutMs?: number;
};

export function createAimcToolsMcpServerConfig(input: {
  gatewayBaseUrl: string;
  gatewayToken: string;
  requireSandboxEntrypoint?: boolean;
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
      executionSide: "vm",
      command: "node",
      args: [packagedMcpServerPath],
      ...timeoutConfig,
      env: {
        AIMC_TOOL_GATEWAY_URL: input.gatewayBaseUrl,
        AIMC_TOOL_TOKEN: input.gatewayToken,
      },
    };
  }

  if (input.requireSandboxEntrypoint) {
    throw new Error(
      "AIMC_TOOLS_MCP_PATH is required for managed local-agent MCP VM execution.",
    );
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
