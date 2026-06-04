import { spawn } from "node:child_process";

import { createJsonRpcLineParser, sendJsonRpc } from "./acp-jsonrpc.js";
import { buildAcpSessionNewParams } from "./acp-session.js";

export async function detectAcpModels(input: {
  args: string[];
  bin: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? 15_000;
  return await new Promise<Array<{ id: string; label: string }>>(
    (resolve, reject) => {
      const child = spawn(input.bin, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdout.setEncoding("utf8");
      let expectedId = 1;
      const parser = createJsonRpcLineParser((message) => {
        if (message.error) {
          reject(new Error(message.error.message ?? "ACP detection failed"));
          child.kill("SIGTERM");
          return;
        }
        if (message.id !== expectedId) return;
        if (expectedId === 1) {
          expectedId = 2;
          sendJsonRpc(child.stdin, {
            jsonrpc: "2.0",
            id: 2,
            method: "session/new",
            params: buildAcpSessionNewParams(input.cwd),
          });
          return;
        }
        const result = message.result as {
          models?: { availableModels?: Array<{ modelId?: string }> };
        };
        const models =
          result?.models?.availableModels
            ?.map((model) => model.modelId?.trim())
            .filter((model): model is string => Boolean(model))
            .map((model) => ({ id: model, label: model })) ?? [];
        resolve(models);
        child.kill("SIGTERM");
      });

      child.stdout.on("data", (chunk: string) => parser.feed(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ACP model detection exited with code ${code}`));
        }
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`ACP model detection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      sendJsonRpc(child.stdin, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "local-agent-runtime", version: "0.0.0" },
          protocolVersion: 1,
        },
      });

      child.once("close", () => clearTimeout(timer));
    },
  );
}
