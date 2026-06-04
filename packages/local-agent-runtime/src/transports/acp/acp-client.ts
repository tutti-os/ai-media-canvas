import type { AgentEvent } from "../../core/events.js";
import type { AgentRunParams, ProviderLaunchPlan } from "../../core/provider-plugin.js";
import { spawnSupervisedProcess } from "../../process/supervisor.js";
import { createJsonRpcLineParser, sendJsonRpc } from "./acp-jsonrpc.js";
import { choosePermissionOutcome } from "./acp-permissions.js";
import { buildAcpSessionNewParams } from "./acp-session.js";

function pushSessionUpdateEvents(queue: AgentEvent[], params: unknown) {
  const payload = (params ?? {}) as Record<string, unknown>;
  const update = ((payload.update ?? payload.event ?? payload) ?? {}) as Record<
    string,
    unknown
  >;
  const kind = String(update.type ?? update.kind ?? update.status ?? "");

  const text =
    typeof update.text === "string"
      ? update.text
      : typeof update.delta === "string"
        ? update.delta
        : typeof update.content === "string"
          ? update.content
          : undefined;
  if (text && /reason|thinking/i.test(kind)) {
    queue.push({ type: "thinking_delta", text });
    return;
  }
  if (text && (/text|message|delta|content/i.test(kind) || !kind)) {
    queue.push({ type: "text_delta", text });
    return;
  }

  const toolCall =
    (update.toolCall ?? update.tool_call ?? update.call) as
      | Record<string, unknown>
      | undefined;
  if (toolCall || /tool.*(call|start)|call.*start/i.test(kind)) {
    const source = toolCall ?? update;
    queue.push({
      type: "tool_call",
      id: String(source.id ?? source.toolCallId ?? source.callId ?? "tool"),
      name: String(source.name ?? source.toolName ?? "tool"),
      ...(source.input !== undefined ? { input: source.input } : {}),
    });
    return;
  }

  const toolResult =
    (update.toolResult ?? update.tool_result ?? update.result) as
      | Record<string, unknown>
      | undefined;
  if (toolResult || /tool.*(result|complete|failed)|call.*(complete|failed)/i.test(kind)) {
    const source = toolResult ?? update;
    const isFailed =
      source.status === "failed" ||
      source.isError === true ||
      source.error !== undefined ||
      /failed|error/i.test(kind);
    queue.push({
      type: "tool_result",
      id: String(source.id ?? source.toolCallId ?? source.callId ?? "tool"),
      ...(source.name ?? source.toolName
        ? { name: String(source.name ?? source.toolName) }
        : {}),
      status: isFailed ? "failed" : "completed",
      ...(source.output !== undefined ? { output: source.output } : {}),
      ...(source.error !== undefined ? { error: String(source.error) } : {}),
    });
    return;
  }

  if (update.usage !== undefined || /usage/i.test(kind)) {
    queue.push({ type: "usage", usage: update.usage ?? update });
    return;
  }

  if (/done|complete|finished|cancel|fail|error/i.test(kind)) {
    const status =
      /cancel/i.test(kind)
        ? "canceled"
        : /fail|error/i.test(kind)
          ? "failed"
          : "completed";
    queue.push({
      type: "done",
      status,
      reason:
        status === "canceled"
          ? "cancelled"
          : status === "failed"
            ? "error"
            : "completed",
      ...(typeof update.sessionId === "string" ? { sessionId: update.sessionId } : {}),
      ...(typeof update.resumeToken === "string"
        ? { resumeToken: update.resumeToken }
        : {}),
    });
  }
}

export async function* runAcpTransport(
  plan: ProviderLaunchPlan,
  params: AgentRunParams,
): AsyncGenerator<AgentEvent> {
  const processHandle = spawnSupervisedProcess({
    ...plan,
    keepStdinOpen: true,
    ...(params.signal ? { signal: params.signal } : {}),
  });
  const queue: AgentEvent[] = [];
  let done = false;
  let fatalError = false;
  let nextId = 1;

  const parser = createJsonRpcLineParser((message) => {
    if (message.error) {
      fatalError = true;
      queue.push({
        type: "error",
        code: String(message.error.code ?? "acp_error"),
        message: message.error.message ?? "ACP error",
      });
      return;
    }

    if (message.method === "session/request_permission") {
      const params = (message.params ?? {}) as {
        options?: Array<{ kind?: string; optionId?: string }>;
      };
      if (message.id !== undefined) {
        sendJsonRpc(processHandle.child.stdin, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            outcome: choosePermissionOutcome(params.options ?? []),
          },
        });
      }
      return;
    }

    if (message.method === "message/stream") {
      const payload = (message.params ?? {}) as { delta?: string };
      if (payload.delta) {
        queue.push({ type: "text_delta", text: payload.delta });
      }
      return;
    }

    if (message.method === "session/update") {
      pushSessionUpdateEvents(queue, message.params);
      return;
    }
  });

  processHandle.child.stdout.on("data", (chunk: string) => parser.feed(chunk));
  processHandle.child.stderr.on("data", (chunk: string) => {
    queue.push({ type: "stderr", text: processHandle.stderr.redact(chunk) });
  });

  sendJsonRpc(processHandle.child.stdin, {
    jsonrpc: "2.0",
    id: nextId++,
    method: "initialize",
    params: {
      clientInfo: { name: "local-agent-runtime", version: "0.0.0" },
      protocolVersion: 1,
    },
  });
  sendJsonRpc(processHandle.child.stdin, {
    jsonrpc: "2.0",
    id: nextId++,
    method: "session/new",
    params: buildAcpSessionNewParams(
      params.cwd,
      params.mcpServers ? { mcpServers: params.mcpServers } : undefined,
    ),
  });
  sendJsonRpc(processHandle.child.stdin, {
    jsonrpc: "2.0",
    id: nextId++,
    method: "session/prompt",
    params: {
      prompt: params.prompt,
      ...(params.model ? { model: params.model } : {}),
    },
  });

  void processHandle.waitForExit().then(({ code, signal, timedOut }) => {
    if (timedOut) {
      queue.push({
        type: "error",
        code: "process_timeout",
        message: `ACP process timed out after ${plan.timeoutMs}ms.`,
      });
    } else if (code && code !== 0) {
      const stderrTail = processHandle.stderr.tail().trim();
      queue.push({
        type: "error",
        code: "process_exit_nonzero",
        message:
          stderrTail.length > 0
            ? stderrTail
            : `ACP process exited with code ${code}.`,
      });
    }
    const canceled = signal != null;
    const failed = fatalError || timedOut || (code != null && code !== 0);
    queue.push({
      type: "done",
      status: canceled ? "canceled" : failed ? "failed" : "completed",
      reason: canceled ? "cancelled" : failed ? "error" : "completed",
      exitCode: code,
    });
    done = true;
  });

  while (!done || queue.length > 0) {
    const next = queue.shift();
    if (next) {
      yield next;
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
