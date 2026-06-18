import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type AnyBackendProtocol,
  CompositeBackend,
  FilesystemBackend,
  LocalShellBackend,
} from "deepagents";

import type { ServerEnv } from "../../config/env.js";
import type { WorkspaceSkillEntry } from "../workspace-skills.js";
import type { AgentBackendResult } from "./index.js";
import { createWorkspaceSkillsFilesystemBackend } from "./workspace-skills.js";

type AgentBackendEnv = Pick<
  ServerEnv,
  "agentFilesRoot" | "appDataDir" | "dataRoot" | "skillsRoot"
>;

const DEFAULT_DEV_SANDBOX_ROOT = "/tmp/ai-media-canvas-sandbox-dev";

/**
 * Create a development backend with local sandbox execution.
 *
 * Uses LocalShellBackend for code execution. The agent's workspace files
 * are stored locally at agentFilesRoot, and skills are loaded from skillsRoot.
 */
export function createDevelopmentBackend(
  env: AgentBackendEnv,
  options?: {
    /** Canvas ID — used to scope the run when workspace skills are available. */
    canvasId?: string;
    /** Workspace skills loaded for this run. */
    workspaceSkills?: WorkspaceSkillEntry[];
  },
): AgentBackendResult {
  if (!env.agentFilesRoot) {
    throw new Error(
      "AIMC_AGENT_FILES_ROOT must be set when filesystem backend mode is enabled.",
    );
  }

  const appDataDir = env.appDataDir ?? env.dataRoot;
  const sandboxRoot = resolve(
    appDataDir
      ? join(appDataDir, "ai-media-canvas-sandbox-dev")
      : DEFAULT_DEV_SANDBOX_ROOT,
  );
  const runId = crypto.randomUUID();
  const sandboxDir = join(sandboxRoot, runId);
  mkdirSync(sandboxDir, { recursive: true });
  const realSandboxDir = realpathSync(sandboxDir);

  const skillsRoot = resolve(
    env.skillsRoot ?? join(env.agentFilesRoot, "skills"),
  );

  const sandbox = new LocalShellBackend({
    rootDir: sandboxDir,
    timeout: 120,
    maxOutputBytes: 200_000,
    env: {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      FONT_DIR: join(skillsRoot, "canvas-design", "canvas-fonts"),
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
  const skillsBackend = new FilesystemBackend({
    rootDir: skillsRoot,
    virtualMode: true,
  });

  const workspaceBackend = new FilesystemBackend({
    rootDir: env.agentFilesRoot,
    virtualMode: true,
  });
  const workspaceSkillsBackend = createWorkspaceSkillsFilesystemBackend({
    rootDir: join(sandboxDir, "workspace-skills"),
    workspaceSkills: options?.workspaceSkills ?? [],
  });

  const factory: AgentBackendResult["factory"] = () => {
    const routes: Record<string, AnyBackendProtocol> = {
      "/workspace/": workspaceBackend,
      "/skills/": skillsBackend,
    };

    if (workspaceSkillsBackend) {
      routes["/workspace-skills/"] = workspaceSkillsBackend;
    }

    return new CompositeBackend(sandbox, routes);
  };

  return { factory, sandboxDir: realSandboxDir };
}
