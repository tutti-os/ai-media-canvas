import type { SkillMaterializationRecord } from "@aimc/local-agent-runtime";

import type { UserDataClient } from "../../auth/request.js";
import { loadWorkspaceSkills, type WorkspaceSkillEntry } from "../workspace-skills.js";

export async function resolveAimcWorkspaceSkills(input: {
  canvasId?: string;
  createUserClient?: (accessToken: string) => unknown;
  accessToken?: string;
}) {
  if (!input.canvasId || !input.accessToken || !input.createUserClient) {
    return [];
  }

  const client = input.createUserClient(input.accessToken) as UserDataClient;
  return loadWorkspaceSkills(client, input.canvasId);
}

export function mapWorkspaceSkillsToLocalAgentManifest(
  workspaceSkills: WorkspaceSkillEntry[],
): SkillMaterializationRecord[] {
  return workspaceSkills.map((skill) => ({
    skillId: skill.name,
    slug: skill.name,
    content: skill.content,
    files: skill.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
    materializedPath: `workspace-skills/${skill.name}`,
    deliveryMode: "materialized-files",
  }));
}
