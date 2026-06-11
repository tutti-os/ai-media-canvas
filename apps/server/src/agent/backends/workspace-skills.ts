import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  type AnyBackendProtocol,
  type BackendProtocolV2,
  type EditResult,
  FilesystemBackend,
  type WriteResult,
} from "deepagents";

import type { WorkspaceSkillEntry } from "../workspace-skills.js";

function assertInside(rootDir: string, targetPath: string) {
  const relativePath = relative(rootDir, targetPath);
  if (relativePath === "" || relativePath.startsWith("..")) {
    throw new Error(`Workspace skill path escapes root: ${targetPath}`);
  }
}

class ReadonlyBackend implements BackendProtocolV2 {
  constructor(private readonly inner: BackendProtocolV2) {}

  ls(path: string) {
    return this.inner.ls(path);
  }

  read(path: string, offset?: number, limit?: number) {
    return this.inner.read(path, offset, limit);
  }

  readRaw(path: string) {
    return this.inner.readRaw(path);
  }

  grep(pattern: string, path?: string | null, glob?: string | null) {
    return this.inner.grep(pattern, path, glob);
  }

  glob(pattern: string, path?: string) {
    return this.inner.glob(pattern, path);
  }

  write(path: string): WriteResult {
    return {
      error: `Workspace skills are read-only: ${path}`,
    };
  }

  edit(path: string): EditResult {
    return {
      error: `Workspace skills are read-only: ${path}`,
    };
  }
}

export function createWorkspaceSkillsFilesystemBackend(input: {
  rootDir: string;
  workspaceSkills: WorkspaceSkillEntry[];
}): AnyBackendProtocol | null {
  if (input.workspaceSkills.length === 0) {
    return null;
  }

  const rootDir = resolve(input.rootDir);
  mkdirSync(rootDir, { recursive: true });

  for (const skill of input.workspaceSkills) {
    const skillRoot = resolve(rootDir, skill.name);
    assertInside(rootDir, skillRoot);
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, "SKILL.md"), skill.content, "utf8");

    for (const file of skill.files) {
      const filePath = resolve(skillRoot, file.path);
      assertInside(skillRoot, filePath);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content, "utf8");
    }
  }

  const backend = new FilesystemBackend({
    rootDir: realpathSync(rootDir),
    virtualMode: true,
  });
  return new ReadonlyBackend(backend);
}
