import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadTuttiAgentSkillContextForRun } from "./tutti-skill-context.js";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("Tutti skill child projection", () => {
  it("projects the invocation credential only to the immediate CLI child", async () => {
    const root = await mkdtemp(join(tmpdir(), "aimc-tutti-skill-child-"));
    tempRoots.push(root);
    const credentialPath = join(root, "credential.txt");
    const tuttiCliPath = join(root, "tutti");
    await writeFile(
      tuttiCliPath,
      [
        "#!/bin/sh",
        `printf '%s' "$TSH_MANAGED_AGENT_INVOCATION_CREDENTIAL" > ${JSON.stringify(credentialPath)}`,
        'case "$*" in',
        '  *"agent list"*)',
        "cat <<'JSON'",
        JSON.stringify({
          schemaVersion: 1,
          defaultAgentTargetId: "local:codex",
          agents: [
            {
              id: "local:codex",
              provider: "codex",
              name: "Local Agent",
              availability: { status: "available" },
            },
          ],
        }),
        "JSON",
        "    ;;",
        "  *)",
        "cat <<'JSON'",
        JSON.stringify({
          schemaVersion: 2,
          agentTargetId: "local:codex",
          provider: "codex",
          agentSessionId: "run-1",
          skills: [],
        }),
        "JSON",
        "    ;;",
        "esac",
      ].join("\n"),
    );
    await chmod(tuttiCliPath, 0o755);
    vi.stubEnv("TUTTI_CLI", tuttiCliPath);
    expect(process.env.TSH_MANAGED_AGENT_INVOCATION_CREDENTIAL).toBeUndefined();

    await loadTuttiAgentSkillContextForRun({
      agentTargetId: "local:codex",
      cwd: root,
      detectContext: {
        managedAgentInvocation: {
          credential: "credential-child-1",
          cwd: root,
        },
        redactionSecrets: ["credential-child-1"],
      },
      runId: "run-1",
    });

    expect(await readFile(credentialPath, "utf8")).toBe("credential-child-1");
    expect(process.env.TSH_MANAGED_AGENT_INVOCATION_CREDENTIAL).toBeUndefined();
  });
});
