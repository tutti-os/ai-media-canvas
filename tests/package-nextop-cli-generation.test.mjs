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

  assert.deepEqual(imageCommand?.inputSchema.required, ["prompt", "model"]);
  assert.deepEqual(videoCommand?.inputSchema.required, ["prompt", "model"]);
  assert.match(
    guide,
    /`aimc generation image --prompt <required> --model <required>/,
  );
  assert.match(
    guide,
    /`aimc generation video --prompt <required> --model <required>/,
  );
});
