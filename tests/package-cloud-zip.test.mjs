import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cleanPreviousCloudZips,
  copyCloudZipToOutput,
  resolveCloudZipPaths,
} from "../scripts/package-cloud-zip.mjs";

test("resolveCloudZipPaths uses the cloud upload output directory", () => {
  const paths = resolveCloudZipPaths({
    outputDir: "/tmp/aimc-output",
    version: "1.2.3",
  });

  assert.equal(
    paths.buildZipPath.endsWith("build/tutti-app/ai-media-canvas-1.2.3.zip"),
    true,
  );
  assert.equal(
    paths.outputZipPath,
    "/tmp/aimc-output/ai-media-canvas-1.2.3.zip",
  );
});

test("copyCloudZipToOutput replaces stale app zips without deleting other files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "aimc-cloud-zip-"));
  const sourceZipPath = path.join(tempRoot, "ai-media-canvas-2.0.0.zip");
  const outputDir = path.join(tempRoot, "output");

  await writeFile(sourceZipPath, "new zip\n");
  await mkdir(outputDir);
  await writeFile(path.join(outputDir, "ai-media-canvas-1.0.0.zip"), "old\n");
  await writeFile(path.join(outputDir, "notes.txt"), "keep\n");

  const outputZipPath = await copyCloudZipToOutput({
    outputDir,
    sourceZipPath,
  });

  assert.equal(
    outputZipPath,
    path.join(outputDir, "ai-media-canvas-2.0.0.zip"),
  );
  assert.equal(await readFile(outputZipPath, "utf8"), "new zip\n");
  await assert.rejects(
    readFile(path.join(outputDir, "ai-media-canvas-1.0.0.zip"), "utf8"),
    /ENOENT/,
  );
  assert.equal(
    await readFile(path.join(outputDir, "notes.txt"), "utf8"),
    "keep\n",
  );
});

test("cleanPreviousCloudZips tolerates a missing output directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "aimc-cloud-zip-"));

  await cleanPreviousCloudZips(path.join(tempRoot, "missing-output"));
});
