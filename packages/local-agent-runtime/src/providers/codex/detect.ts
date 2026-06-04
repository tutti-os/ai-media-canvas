import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { resolveCommandExecutable } from "../../process/command-resolver.js";
import { CODEX_DEFAULT_MODELS } from "./models.js";

const execFileAsync = promisify(execFile);

function parseSemver(version: string) {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function isVersionAtLeast(version: string, minimumVersion?: string) {
  if (!minimumVersion) {
    return true;
  }
  const current = parseSemver(version);
  const minimum = parseSemver(minimumVersion);
  if (!current || !minimum) {
    return true;
  }
  for (let index = 0; index < minimum.length; index += 1) {
    const currentPart = current[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }
  return true;
}

export async function detectCodex(options?: {
  command?: string;
  env?: NodeJS.ProcessEnv;
  minimumVersion?: string;
  overridePath?: string;
}) {
  const executablePath = await resolveCommandExecutable({
    command: options?.command ?? "codex",
    ...(options?.env ? { env: options.env } : {}),
    ...(options?.overridePath ? { overridePath: options.overridePath } : {}),
  });
  const { stdout } = await execFileAsync(executablePath, ["--version"], {
    env: options?.env,
  });
  const version = stdout.trim() || "unknown";
  const configDir = (options?.env?.CODEX_HOME || process.env.CODEX_HOME || "").trim()
    || path.join(homedir(), ".codex");
  const supported = isVersionAtLeast(version, options?.minimumVersion);
  return {
    authState: "unknown" as const,
    configDir,
    executablePath,
    models: CODEX_DEFAULT_MODELS,
    skillsDir: path.join(configDir, "skills"),
    supported,
    ...(options?.minimumVersion
      ? { minimumVersion: options.minimumVersion }
      : {}),
    ...(supported
      ? {}
      : {
          unsupportedReason: `Codex ${version} is older than the required ${options?.minimumVersion}`,
        }),
    version,
  };
}
