import { request } from "node:http";
import readline from "node:readline";

type JsonRpcId = number | string;

type JsonRpcRequest = {
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

const gatewayUrl = process.env.AIMC_TOOL_GATEWAY_URL;
const toolToken = process.env.AIMC_TOOL_TOKEN;

// Node's global fetch uses Undici's 5-minute response timeout by default. Image
// jobs may legitimately run for up to 10 minutes, so use the native HTTP client
// with an explicit total timeout. The gateway is always a local HTTP endpoint,
// and the enclosing local-agent tool timeout remains the ultimate 30-minute
// guard.
const TOOL_GATEWAY_RESPONSE_TIMEOUT_MS = 15 * 60_000;

if (!gatewayUrl || !toolToken) {
  console.error("Missing AIMC_TOOL_GATEWAY_URL or AIMC_TOOL_TOKEN.");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

function send(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function logMcpToolEvent(event: string, fields: Record<string, unknown>) {
  process.stderr.write(
    `${JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      scope: "local_agent.mcp_server",
      event,
      ...fields,
    })}\n`,
  );
}

async function requestJson<T>(input: {
  body?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  url: string;
}): Promise<{ payload: T; status: number }> {
  return new Promise((resolve, reject) => {
    const target = new URL(input.url);
    if (target.protocol !== "http:") {
      reject(new Error(`Unsupported tool gateway protocol: ${target.protocol}`));
      return;
    }

    const req = request(
      target,
      {
        method: input.method ?? "GET",
        headers: input.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        response.on("end", () => {
          clearTimeout(timeout);
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({
              payload: (raw.length > 0 ? JSON.parse(raw) : {}) as T,
              status: response.statusCode ?? 500,
            });
          } catch {
            reject(
              new Error(
                `Tool gateway returned invalid JSON (${response.statusCode ?? 500}).`,
              ),
            );
          }
        });
      },
    );
    const timeout = setTimeout(() => {
      req.destroy(
        new Error(
          `Tool gateway request timed out after ${TOOL_GATEWAY_RESPONSE_TIMEOUT_MS}ms.`,
        ),
      );
    }, TOOL_GATEWAY_RESPONSE_TIMEOUT_MS);
    req.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    if (input.body) req.write(input.body);
    req.end();
  });
}

async function fetchManifest() {
  const response = await requestJson<{ tools?: unknown }>({
    url: `${gatewayUrl}/manifest`,
    headers: {
      Authorization: `Bearer ${toolToken}`,
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Tool manifest failed: ${response.status}`);
  }

  return Array.isArray(response.payload.tools) ? response.payload.tools : [];
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; result: Record<string, unknown> }> {
  const response = await requestJson<{
    error?: { message?: string };
    result?: Record<string, unknown>;
  }>({
    url: `${gatewayUrl}/${encodeURIComponent(name)}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${toolToken}`,
    },
    body: JSON.stringify({ arguments: args }),
  });

  const payload = response.payload;

  if (response.status < 200 || response.status >= 300) {
    if (payload.result && typeof payload.result === "object") {
      return { isError: true, result: payload.result };
    }
    throw new Error(payload.error?.message ?? `Tool call failed: ${response.status}`);
  }

  return { isError: false, result: payload.result ?? {} };
}

function sendError(id: JsonRpcId | undefined, code: number, message: string, data?: unknown) {
  send({
    jsonrpc: "2.0",
    ...(id !== undefined ? { id } : {}),
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  });
}

async function handleRequest(message: JsonRpcRequest) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "aimc-tools-mcp",
          version: "0.0.1",
        },
      },
    });
    return;
  }

  if (message.method === "notifications/initialized") {
    return;
  }

  if (message.method === "tools/list") {
    try {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: await fetchManifest(),
        },
      });
    } catch (error) {
      sendError(
        message.id,
        -32000,
        error instanceof Error ? error.message : "Unable to load tool manifest.",
      );
    }
    return;
  }

  if (message.method === "tools/call") {
    const toolName =
      typeof message.params?.name === "string" ? message.params.name : "";
    const args =
      message.params?.arguments &&
      typeof message.params.arguments === "object" &&
      !Array.isArray(message.params.arguments)
        ? (message.params.arguments as Record<string, unknown>)
        : {};

    if (!toolName) {
      logMcpToolEvent("tool_call_invalid", {
        requestId: message.id,
        reason: "missing_tool_name",
      });
      sendError(message.id, -32602, "Tool name is required.");
      return;
    }

    const startedAt = Date.now();
    logMcpToolEvent("tool_call_received", {
      requestId: message.id,
      toolName,
      inputKeys: Object.keys(args).sort(),
      ...(stringField(args.model) ? { model: args.model } : {}),
      ...(stringField(args.aspectRatio) ? { aspectRatio: args.aspectRatio } : {}),
      ...(stringField(args.title) ? { title: args.title } : {}),
    });

    try {
      const { isError, result } = await callTool(toolName, args);
      logMcpToolEvent("tool_call_completed", {
        requestId: message.id,
        toolName,
        isError,
        elapsedMs: Date.now() - startedAt,
      });
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          ...(isError ? { isError: true } : {}),
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        },
      });
    } catch (error) {
      logMcpToolEvent("tool_call_failed", {
        requestId: message.id,
        toolName,
        elapsedMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Tool call failed.",
      });
      sendError(
        message.id,
        -32000,
        error instanceof Error ? error.message : "Tool call failed.",
      );
    }
    return;
  }

  sendError(message.id, -32601, `Unsupported method: ${message.method ?? "unknown"}`);
}

rl.on("line", (line) => {
  if (!line.trim()) return;

  let message: JsonRpcRequest;
  try {
    message = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }

  void handleRequest(message);
});
