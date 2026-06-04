import type {
  LocalAgentMcpEnvEntry,
  NormalizedLocalAgentMcpHttpServerConfig,
  NormalizedLocalAgentMcpStdioServerConfig,
} from "../../core/mcp.js";

export type AcpSessionNewParams = {
  cwd: string;
  mcpServers: Array<
    | (NormalizedLocalAgentMcpStdioServerConfig & {
        type: "stdio";
        env: LocalAgentMcpEnvEntry[];
      })
    | (NormalizedLocalAgentMcpHttpServerConfig & {
        type: "http";
        env: LocalAgentMcpEnvEntry[];
      })
  >;
};

export type JsonRpcEnvelope = {
  id?: number | string;
  jsonrpc: "2.0";
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
};
