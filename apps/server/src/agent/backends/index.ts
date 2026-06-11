import type { AnyBackendProtocol } from "deepagents";

import type { ServerEnv } from "../../config/env.js";
import type { WorkspaceSkillEntry } from "../workspace-skills.js";
import { createDevelopmentBackend } from "./dev.js";
import { createProductionBackendFactory } from "./prod.js";

type AgentBackendEnv = Pick<
  ServerEnv,
  "agentBackendMode" | "agentFilesRoot" | "skillsRoot"
>;

export type AgentBackendResult = {
  factory: (config: { state: unknown; store?: unknown }) => AnyBackendProtocol;
  sandboxDir?: string;
};

export function createAgentBackend(
  env: AgentBackendEnv,
  canvasId?: string,
  options?: { workspaceSkills?: WorkspaceSkillEntry[] },
): AgentBackendResult {
  if (env.agentBackendMode === "filesystem") {
    return createDevelopmentBackend(env, {
      ...(canvasId != null ? { canvasId } : {}),
      ...(options?.workspaceSkills
        ? { workspaceSkills: options.workspaceSkills }
        : {}),
    });
  }

  if (!canvasId) {
    throw new Error(
      "canvasId is required for production (state) backend mode. " +
        "Each agent run must be scoped to a project.",
    );
  }

  return createProductionBackendFactory(canvasId, {
    ...(env.skillsRoot ? { skillsRoot: env.skillsRoot } : {}),
    ...(options?.workspaceSkills
      ? { workspaceSkills: options.workspaceSkills }
      : {}),
  });
}
