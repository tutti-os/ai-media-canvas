import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import type { ServerEnv } from "../../config/env.js";

const COMMAND_TIMEOUT_MS = 15_000;
const TERMINATION_GRACE_MS = 1_000;
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
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(executable, [...command, "--input-json", "-"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      reject(cliError("Tutti CLI failed to start", error));
      return;
    }
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let terminationTimer: NodeJS.Timeout | undefined;

    const terminateChild = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.kill("SIGTERM");
      } catch {
        return;
      }
      terminationTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, TERMINATION_GRACE_MS);
      terminationTimer.unref();
    };
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
      terminateChild();
      finish(new Error("Tutti CLI timed out."));
    }, COMMAND_TIMEOUT_MS);

    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        finish(new TuttiManagedModelCliUnsupportedError());
        return;
      }
      finish(cliError("Tutti CLI failed to start", error));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        terminateChild();
        finish(new Error("Tutti CLI response is too large."));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_STDERR_BYTES) {
        terminateChild();
        finish(new Error("Tutti CLI diagnostics are too large."));
        return;
      }
      stderrChunks.push(chunk);
    });
    child.once("close", (code) => {
      if (terminationTimer) clearTimeout(terminationTimer);
      if (settled) return;
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        if (isUnsupportedManagedModelCommand(stderr)) {
          finish(new TuttiManagedModelCliUnsupportedError());
          return;
        }
        finish(
          new Error(`Tutti CLI command failed: ${formatDiagnostic(stderr)}`),
        );
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
    child.stdin.once("error", (error) => {
      terminateChild();
      finish(cliError("Tutti CLI input failed", error));
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function isUnsupportedManagedModelCommand(stderr: string) {
  return [
    /(?:^|\n)unknown command:\s+managed-model(?:\s|$)/u,
    /(?:^|\n)Error:\s+unknown command\s+"managed-model"(?:\s|"|$)/u,
    /(?:^|\n)Error:\s+unknown shorthand flag:.*for ".*managed-model.*"/u,
    /(?:^|\n)managed-model(?:\s+[\w.-]+)*\s+is not a valid command\.?$/u,
  ].some((pattern) => pattern.test(stderr));
}

function cliError(prefix: string, error: unknown) {
  const detail = error instanceof Error ? formatDiagnostic(error.message) : "";
  return new Error(detail ? `${prefix}: ${detail}` : `${prefix}.`);
}

function formatDiagnostic(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, 512) : "unknown error";
}
