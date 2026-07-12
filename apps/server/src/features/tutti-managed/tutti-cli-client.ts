import { spawn } from "node:child_process";

import type { ServerEnv } from "../../config/env.js";

const COMMAND_TIMEOUT_MS = 15_000;
const MAX_STDOUT_BYTES = 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const unsupportedHostMessage = "当前 Tutti 不支持托管模型 CLI，请升级 Tutti";

export class TuttiManagedModelCliUnsupportedError extends Error {
  readonly code = "TUTTI_MANAGED_MODEL_CLI_UNSUPPORTED";

  constructor() {
    super(unsupportedHostMessage);
    this.name = "TuttiManagedModelCliUnsupportedError";
  }
}

export async function invokeTuttiManagedModelCli(
  env: ServerEnv,
  command: readonly string[],
  input: Record<string, unknown>,
): Promise<unknown> {
  const executable = env.tuttiCliPath?.trim();
  if (!executable) {
    throw new TuttiManagedModelCliUnsupportedError();
  }

  return await new Promise<unknown>((resolve, reject) => {
    const child = spawn(executable, [...command, "--input-json", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let stderrBytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("Tutti CLI timed out."));
    }, COMMAND_TIMEOUT_MS);

    child.once("error", (error) => {
      if (error.code === "ENOENT") {
        finish(new TuttiManagedModelCliUnsupportedError());
        return;
      }
      finish(new Error("Tutti CLI failed to start."));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + chunk.byteLength > MAX_STDOUT_BYTES) {
        child.kill();
        finish(new Error("Tutti CLI response is too large."));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_STDERR_BYTES) {
        child.kill();
        finish(new Error("Tutti CLI diagnostics are too large."));
        return;
      }
      stderr += chunk.toString("utf8");
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        if (isUnsupportedManagedModelCommand(stderr)) {
          finish(new TuttiManagedModelCliUnsupportedError());
          return;
        }
        finish(new Error("Tutti CLI command failed."));
        return;
      }
      try {
        const result: unknown = JSON.parse(stdout);
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          throw new Error("invalid JSON result");
        }
        finish(undefined, result);
      } catch {
        finish(new Error("Tutti CLI returned invalid JSON."));
      }
    });
    child.stdin.once("error", () =>
      finish(new Error("Tutti CLI input failed.")),
    );
    child.stdin.end(JSON.stringify(input));
  });
}

function isUnsupportedManagedModelCommand(stderr: string) {
  return /unknown command|unknown shorthand flag|not a valid command/iu.test(
    stderr,
  );
}
