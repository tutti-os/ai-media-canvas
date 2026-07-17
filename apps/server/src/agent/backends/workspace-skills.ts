import { mkdir, realpath, writeFile } from "node:fs/promises";
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

export async function createWorkspaceSkillsFilesystemBackend(input: {
  rootDir: string;
  workspaceSkills: WorkspaceSkillEntry[];
}): Promise<AnyBackendProtocol | null> {
  if (input.workspaceSkills.length === 0) {
    return null;
  }

  const rootDir = resolve(input.rootDir);
  await mkdir(rootDir, { recursive: true });

  await mapWithConcurrency(input.workspaceSkills, 4, async (skill) => {
    const skillRoot = resolve(rootDir, skill.name);
    assertInside(rootDir, skillRoot);
    await mkdir(skillRoot, { recursive: true });

    await mapWithConcurrency([
      { path: "SKILL.md", content: skill.content },
      ...skill.files,
    ], 6, async (file) => {
      const filePath = resolve(skillRoot, file.path);
      assertInside(skillRoot, filePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, "utf8");
    });
  });

  const backend = new FilesystemBackend({
    rootDir: await realpath(rootDir),
    virtualMode: true,
  });
  return new ReadonlyBackend(backend);
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item) await worker(item);
    }
  }));
}
