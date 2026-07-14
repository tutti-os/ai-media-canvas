import assert from "node:assert/strict";
import test from "node:test";

import {
  createCliManifest,
  renderCommandsGuide,
} from "../scripts/package-tutti-app.mjs";

test("Tutti CLI generation commands require explicit models", () => {
  const manifest = createCliManifest();
  const imageCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "generation image",
  );
  const videoCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "generation video",
  );
  const guide = renderCommandsGuide();

  assert.deepEqual(imageCommand?.inputSchema.required, [
    "prompt",
    "model",
    "project-id",
  ]);
  assert.deepEqual(videoCommand?.inputSchema.required, [
    "prompt",
    "model",
    "project-id",
  ]);
  assert.match(
    guide,
    /`aimc generation image --prompt <required> --model <required> --project-id <required>/,
  );
  assert.match(
    guide,
    /`aimc generation video --prompt <required> --model <required> --project-id <required>/,
  );
});

test("Tutti CLI generation commands tell agents to wait for terminal job status", () => {
  const manifest = createCliManifest();
  const imageCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "generation image",
  );
  const videoCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "generation video",
  );
  const jobGetCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "jobs get",
  );
  const guide = renderCommandsGuide();

  for (const command of [imageCommand, videoCommand, jobGetCommand]) {
    assert.match(command?.description ?? "", /queued and running/);
    assert.match(command?.description ?? "", /succeeded/);
  }
  assert.match(guide, /queued and running are intermediate states/);
  assert.match(guide, /report the generated asset from job\.result/);
});

test("Tutti CLI agent commands expose exact target discovery and deprecated provider compatibility", () => {
  const manifest = createCliManifest();
  const runCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "agent run",
  );
  const modelsCommand = manifest.commands.find(
    (command) => command.path.join(" ") === "models list",
  );

  assert.ok(runCommand?.inputSchema.properties["agent-id"]);
  assert.match(
    runCommand?.inputSchema.properties["runtime-provider"]?.description ?? "",
    /Deprecated compatibility selector/,
  );
  assert.match(modelsCommand?.description ?? "", /exact agentTargetId/);
});
