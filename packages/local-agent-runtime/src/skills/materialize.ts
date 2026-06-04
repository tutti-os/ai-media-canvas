import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SkillMaterializationRecord } from "../core/skills.js";

export async function materializeSkills(
  cwd: string,
  skills: SkillMaterializationRecord[],
) {
  const materialized: SkillMaterializationRecord[] = [];

  for (const skill of skills) {
    if (skill.deliveryMode !== "materialized-files") {
      materialized.push(skill);
      continue;
    }

    const relativeRoot =
      skill.materializedPath ?? join(".local-agent", "skills", skill.slug);
    const rootPath = join(cwd, relativeRoot);
    await mkdir(rootPath, { recursive: true });

    const mainFilePath = join(rootPath, "SKILL.md");
    await writeFile(mainFilePath, skill.content ?? `# ${skill.slug}\n`, "utf8");

    for (const file of skill.files ?? []) {
      const filePath = join(rootPath, file.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, "utf8");
    }

    materialized.push({
      ...skill,
      materializedPath: rootPath,
    });
  }

  return materialized;
}
