import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ServerEnv } from "../../config/env.js";
import { invokeTuttiManagedModelCli } from "./tutti-cli-client.js";

function envFor(path: string): ServerEnv {
  return {
    agentBackendMode: "state",
    agentModel: "openai:gpt-5.1",
    port: 3001,
    tuttiCliPath: path,
    version: "test",
    webOrigin: "http://localhost:3000",
  };
}

describe("invokeTuttiManagedModelCli", () => {
  it("sends JSON through stdin and parses only JSON stdout", async () => {
    const path = join(
      tmpdir(),
      `aimc-tutti-cli-${Date.now()}-${Math.random()}.sh`,
    );
    await writeFile(
      path,
      "#!/bin/sh\ninput=$(cat)\ncase \"$input\" in *'grantRef'*) printf '{\"ok\":true}' ;; *) exit 2 ;; esac\n",
      { mode: 0o700 },
    );
    await chmod(path, 0o700);
    await expect(
      invokeTuttiManagedModelCli(envFor(path), ["managed-model", "revoke"], {
        grantRef: "grant-1",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("uses the shared managed-model protocol fixture shape", async () => {
    const raw = await readFile(
      new URL("./testdata/managed-model-protocol.v1.json", import.meta.url),
      "utf8",
    );
    const fixture = JSON.parse(raw) as {
      commands: Record<string, { input: unknown }>;
    };
    expect(fixture.commands["managed-model.grant.exchange"]?.input).toEqual({
      contextToken: "context-test",
      grantCode: "grant-test",
      nonce: "nonce-test",
      state: "state-test",
    });
  });
});
