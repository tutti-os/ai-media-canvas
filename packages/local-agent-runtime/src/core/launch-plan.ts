import type { LocalAgentMcpServerConfig } from "./mcp.js";

export type LaunchPlan = {
  args: string[];
  command: string;
  cwd: string;
  env?: Record<string, string>;
  prompt: string;
  promptInput: "stdin" | "argv";
  mcpServers?: LocalAgentMcpServerConfig[];
  model?: string;
  redactionSecrets?: string[];
  runId?: string;
  transport?: TransportKind;
  timeoutMs?: number;
};

export type TransportKind = "jsonl" | "plain" | "acp-json-rpc";
