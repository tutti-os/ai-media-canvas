import readline from "node:readline";

type JsonRpcId = number | string;

type JsonRpcRequest = {
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

const gatewayUrl = process.env.AIMC_TOOL_GATEWAY_URL;
const toolToken = process.env.AIMC_TOOL_TOKEN;

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

async function fetchManifest() {
  const response = await fetch(`${gatewayUrl}/manifest`, {
    headers: {
      Authorization: `Bearer ${toolToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Tool manifest failed: ${response.status}`);
  }

  const payload = (await response.json()) as { tools?: unknown };
  return Array.isArray(payload.tools) ? payload.tools : [];
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${gatewayUrl}/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${toolToken}`,
    },
    body: JSON.stringify({ arguments: args }),
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: Record<string, unknown>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Tool call failed: ${response.status}`);
  }

  return payload.result ?? {};
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
      sendError(message.id, -32602, "Tool name is required.");
      return;
    }

    try {
      const result = await callTool(toolName, args);
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        },
      });
    } catch (error) {
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
