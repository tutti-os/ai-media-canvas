import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";

import type { InstallableAgentProviderId } from "@aimc/shared";

type ProviderAvailability =
  | "ready"
  | "not_installed"
  | "auth_required"
  | "unknown";

type ProviderInstallReason =
  | "ready"
  | "cli_not_found"
  | "acp_adapter_not_found"
  | "auth_required"
  | "unknown";

type ProviderInstallStatus = {
  availability: ProviderAvailability;
  reason: ProviderInstallReason;
  cli: {
    binary: string;
    installed: boolean;
    path?: string;
  };
  adapter: {
    binary: string;
    installed: boolean;
    path?: string;
  };
  auth: {
    ok: boolean;
    required: boolean;
  };
};

type ProviderInstallCommandResult = {
  command: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  canceled: boolean;
};

export type AgentProviderInstallResult = {
  provider: InstallableAgentProviderId;
  status: "succeeded" | "failed" | "skipped";
  command: string | null;
  before: ProviderInstallStatus;
  after: ProviderInstallStatus;
  failureReason?:
    | "install_timed_out"
    | "install_canceled"
    | "install_start_failed"
    | "install_command_failed"
    | "post_install_probe_failed";
  commandResult?: ProviderInstallCommandResult;
};

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const AUTH_CHECK_TIMEOUT_MS = 5_000;

const INSTALL_SPECS = {
  codex: {
    displayName: "Codex",
    cliBinary: "codex",
    adapterBinary: "codex-acp",
    installCommand: "npm install -g @openai/codex @zed-industries/codex-acp",
  },
  claude: {
    displayName: "Claude Code",
    cliBinary: "claude",
    adapterBinary: "claude-agent-acp",
    installCommand:
      "npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp",
  },
} satisfies Record<
  InstallableAgentProviderId,
  {
    displayName: string;
    cliBinary: string;
    adapterBinary: string;
    installCommand: string;
  }
>;

function shellCommand(env: NodeJS.ProcessEnv) {
  if (platform() === "win32") {
    return { command: env.ComSpec || "cmd.exe", args: ["/C"] };
  }
  return { command: env.SHELL || "/bin/zsh", args: ["-lc"] };
}

async function runShell(
  command: string,
  options: {
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<ProviderInstallCommandResult> {
  return new Promise((resolve, reject) => {
    const shell = shellCommand(options.env);
    const child = spawn(shell.command, [...shell.args, command], {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let canceled = false;

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve({
        command,
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        canceled,
      });
    };
    const abort = () => {
      canceled = true;
      if (!child.killed) child.kill("SIGTERM");
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      if (!child.killed) child.kill("SIGTERM");
    }, options.timeoutMs);

    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.once("close", finish);
  });
}

async function findCommand(binary: string, env: NodeJS.ProcessEnv) {
  const result = await runShell(`command -v ${binary}`, {
    env,
    timeoutMs: AUTH_CHECK_TIMEOUT_MS,
  });
  const resolved = result.stdout.trim().split("\n")[0]?.trim();
  return result.code === 0 && resolved ? resolved : undefined;
}

async function codexAuthOk(env: NodeJS.ProcessEnv) {
  const configDir =
    (env.CODEX_HOME || process.env.CODEX_HOME || "").trim() ||
    path.join(homedir(), ".codex");
  try {
    await access(path.join(configDir, "auth.json"));
    return true;
  } catch {
    return false;
  }
}

async function providerAuthOk(
  provider: InstallableAgentProviderId,
  cliPath: string | undefined,
  env: NodeJS.ProcessEnv,
) {
  if (provider === "codex") return codexAuthOk(env);
  if (!cliPath) return false;
  const result = await runShell(`${cliPath} auth status`, {
    env,
    timeoutMs: AUTH_CHECK_TIMEOUT_MS,
  });
  return result.code === 0;
}

async function getProviderInstallStatus(
  provider: InstallableAgentProviderId,
  env: NodeJS.ProcessEnv,
): Promise<ProviderInstallStatus> {
  const spec = INSTALL_SPECS[provider];
  const cliPath = await findCommand(spec.cliBinary, env);
  const adapterPath = await findCommand(spec.adapterBinary, env);
  const authOk = await providerAuthOk(provider, cliPath, env);

  if (!cliPath) {
    return {
      availability: "not_installed",
      reason: "cli_not_found",
      cli: { binary: spec.cliBinary, installed: false },
      adapter: {
        binary: spec.adapterBinary,
        installed: Boolean(adapterPath),
        ...(adapterPath ? { path: adapterPath } : {}),
      },
      auth: { ok: false, required: true },
    };
  }

  if (!adapterPath) {
    return {
      availability: "not_installed",
      reason: "acp_adapter_not_found",
      cli: { binary: spec.cliBinary, installed: true, path: cliPath },
      adapter: { binary: spec.adapterBinary, installed: false },
      auth: { ok: authOk, required: !authOk },
    };
  }

  if (!authOk) {
    return {
      availability: "auth_required",
      reason: "auth_required",
      cli: { binary: spec.cliBinary, installed: true, path: cliPath },
      adapter: {
        binary: spec.adapterBinary,
        installed: true,
        path: adapterPath,
      },
      auth: { ok: false, required: true },
    };
  }

  return {
    availability: "ready",
    reason: "ready",
    cli: { binary: spec.cliBinary, installed: true, path: cliPath },
    adapter: { binary: spec.adapterBinary, installed: true, path: adapterPath },
    auth: { ok: true, required: false },
  };
}

export async function installAgentProvider(
  provider: InstallableAgentProviderId,
): Promise<AgentProviderInstallResult> {
  const env = { ...process.env };
  const spec = INSTALL_SPECS[provider];
  const before = await getProviderInstallStatus(provider, env);

  if (before.availability === "ready") {
    return {
      provider,
      status: "skipped",
      command: null,
      before,
      after: before,
    };
  }

  let commandResult: ProviderInstallCommandResult;
  try {
    commandResult = await runShell(spec.installCommand, {
      env,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
  } catch {
    const after = await getProviderInstallStatus(provider, env);
    return {
      provider,
      status: "failed",
      command: spec.installCommand,
      before,
      after,
      failureReason: "install_start_failed",
    };
  }

  const after = await getProviderInstallStatus(provider, env);
  const succeeded =
    commandResult.code === 0 &&
    (after.availability === "ready" || after.availability === "auth_required");

  return {
    provider,
    status: succeeded ? "succeeded" : "failed",
    command: spec.installCommand,
    before,
    after,
    ...(commandResult.timedOut
      ? { failureReason: "install_timed_out" as const }
      : commandResult.canceled
        ? { failureReason: "install_canceled" as const }
        : commandResult.code === 0
          ? {}
          : { failureReason: "install_command_failed" as const }),
    commandResult,
  };
}
