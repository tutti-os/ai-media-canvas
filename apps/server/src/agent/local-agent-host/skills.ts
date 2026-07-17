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
  await mapWithConcurrency(input.workspaceSkills, 6, async (skill) => {
    const skillRoot = resolve(runRoot, "workspace-skills", skill.name);
    assertInside(runRoot, skillRoot);
    await mkdir(skillRoot, { recursive: true });
    await Promise.all([
      writeFile(join(skillRoot, "SKILL.md"), skill.content, "utf8"),
      mapWithConcurrency(skill.files, 6, async (file) => {
        const filePath = resolve(skillRoot, file.path);
        assertInside(skillRoot, filePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, "utf8");
      }),
    ]);
  });
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (next < values.length) {
        const index = next++;
        await worker(values[index]!);
      }
    },
  );
  await Promise.all(workers);
}
