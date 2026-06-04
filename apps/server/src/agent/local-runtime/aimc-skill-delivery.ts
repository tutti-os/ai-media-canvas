import type { SkillMaterializationRecord } from "@aimc/local-agent-runtime";

import type { WorkspaceSkillEntry } from "../workspace-skills.js";

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
