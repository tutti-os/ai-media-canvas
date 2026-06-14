import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { SkillMaterializationRecord } from "@tutti-os/agent-acp-kit";

import type { UserDataClient } from "../../auth/request.js";
import {
  type WorkspaceSkillEntry,
  loadWorkspaceSkills,
} from "../workspace-skills.js";

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

function assertInside(rootDir: string, targetPath: string) {
  const relativePath = relative(rootDir, targetPath);
  if (relativePath === "" || relativePath.startsWith("..")) {
    throw new Error(
      `Workspace skill materialization path escapes run directory: ${targetPath}`,
    );
  }
}

export async function materializeWorkspaceSkillsForLocalAgent(input: {
  runDir: string;
  workspaceSkills: WorkspaceSkillEntry[];
}) {
  const runRoot = resolve(input.runDir);
  for (const skill of input.workspaceSkills) {
    const skillRoot = resolve(runRoot, "workspace-skills", skill.name);
    assertInside(runRoot, skillRoot);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), skill.content, "utf8");

    for (const file of skill.files) {
      const filePath = resolve(skillRoot, file.path);
      assertInside(skillRoot, filePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, "utf8");
    }
  }
}
