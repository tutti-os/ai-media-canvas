import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { resolveCommandExecutable } from "../../process/command-resolver.js";
import { CLAUDE_DEFAULT_MODELS } from "./models.js";

const execFileAsync = promisify(execFile);

export async function detectClaude(options?: {
  command?: string;
  env?: NodeJS.ProcessEnv;
  overridePath?: string;
}) {
  const executablePath = await resolveCommandExecutable({
    command: options?.command ?? "claude",
    ...(options?.env ? { env: options.env } : {}),
    fallbackCommands: ["openclaude"],
    ...(options?.overridePath ? { overridePath: options.overridePath } : {}),
  });
  const { stdout } = await execFileAsync(executablePath, ["--version"], {
    env: options?.env,
  });
  const configDir = path.join(homedir(), ".claude");
  return {
    authState: "unknown" as const,
    configDir,
    executablePath,
    models: CLAUDE_DEFAULT_MODELS,
    skillsDir: path.join(configDir, "skills"),
    supported: true,
    version: stdout.trim() || "unknown",
  };
}
