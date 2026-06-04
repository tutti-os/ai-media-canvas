import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertNoSymlinks,
  createWebBuildEnv,
  createManifest,
  renderAgentsGuide,
  renderBootstrap,
  validatePackageRoot,
} from "../scripts/package-nextop-app.mjs";

async function makeTempPackageRoot() {
  return mkdtemp(path.join(os.tmpdir(), "aimc-nextop-package-test-"));
}

test("createManifest returns the Nextop package manifest contract", () => {
  const manifest = createManifest({ version: "1.2.3" });

  assert.deepEqual(manifest, {
    schemaVersion: "nextop.app.manifest.v1",
    appId: "ai-media-canvas",
    version: "1.2.3",
    name: "AI Media Canvas",
    description: "Local-first AI media canvas workspace app.",
    icon: {
      type: "asset",
      src: "icon.svg",
    },
    runtime: {
      kind: "custom",
      bootstrap: "bootstrap.sh",
      healthcheckPath: "/api/health",
    },
    launch: {
      mode: "workspace-open",
    },
    author: {
      name: "Nextop",
    },
    tags: ["generated", "local-first", "media-canvas"],
  });
});

test("renderBootstrap maps Nextop runtime env into AI Media Canvas env", () => {
  const bootstrap = renderBootstrap({ version: "1.2.3" });

  assert.match(bootstrap, /^#!\/bin\/sh\n/);
  assert.match(bootstrap, /: "\$\{NEXTOP_APP_PACKAGE_DIR:\?\}"/);
  assert.match(bootstrap, /export HOST="\$NEXTOP_APP_HOST"/);
  assert.match(bootstrap, /export AIMC_SERVER_PORT="\$NEXTOP_APP_PORT"/);
  assert.match(bootstrap, /export AIMC_APP_VERSION="1\.2\.3"/);
  assert.match(bootstrap, /export AIMC_WEB_DIST="\$NEXTOP_APP_PACKAGE_DIR\/dist"/);
  assert.match(bootstrap, /export AIMC_DATA_ROOT="\$NEXTOP_APP_DATA_DIR"/);
  assert.match(bootstrap, /export AIMC_SKILLS_ROOT="\$NEXTOP_APP_PACKAGE_DIR\/skills"/);
  assert.match(
    bootstrap,
    /export AIMC_AGENT_FILES_ROOT="\$\{NEXTOP_WORKSPACE_ROOT:-\$NEXTOP_APP_DATA_DIR\}"/,
  );
  assert.match(bootstrap, /exec node "\$NEXTOP_APP_PACKAGE_DIR\/server\/server.js"/);
});

test("renderAgentsGuide is non-empty and documents package layout", () => {
  const guide = renderAgentsGuide();

  assert.match(guide, /AI Media Canvas/);
  assert.match(guide, /nextop\.app\.json/);
  assert.match(guide, /bootstrap\.sh/);
  assert.match(guide, /icon\.svg/);
  assert.match(guide, /NEXTOP_APP_DATA_DIR/);
});

test("Nextop icon asset keeps the original logo style with a contrast-safe tile", async () => {
  const icon = await readFile(
    path.resolve("apps/web/public/brand/aimc-nextop-app-icon.svg"),
    "utf8",
  );

  assert.match(icon, /<svg/);
  assert.match(icon, /<rect/);
  assert.match(icon, /fill="#F8FAFC"/);
  assert.match(icon, /stroke="#E5E7EB"/);
  assert.match(icon, /fill="#000"/);
});

test("createWebBuildEnv prevents local dev server URLs from being baked into package dist", () => {
  const env = createWebBuildEnv({
    AIMC_SERVER_BASE_URL: "http://localhost:3001",
    NEXT_PUBLIC_AIMC_SERVER_BASE_URL: "http://127.0.0.1:3001",
  });

  assert.equal(env.AIMC_SERVER_BASE_URL, "");
  assert.equal(env.NEXT_PUBLIC_AIMC_SERVER_BASE_URL, "");
});

test("validatePackageRoot requires the files Nextop imports", async () => {
  const packageRoot = await makeTempPackageRoot();

  await assert.rejects(
    validatePackageRoot(packageRoot),
    /Missing required package file: nextop\.app\.json/,
  );

  await writeFile(
    path.join(packageRoot, "nextop.app.json"),
    `${JSON.stringify(createManifest({ version: "1.2.3" }))}\n`,
  );
  await writeFile(path.join(packageRoot, "AGENTS.md"), "Package guide\n");
  await writeFile(path.join(packageRoot, "bootstrap.sh"), renderBootstrap());
  await chmod(path.join(packageRoot, "bootstrap.sh"), 0o755);

  await validatePackageRoot(packageRoot);
});

test("assertNoSymlinks rejects symlink entries", async () => {
  const packageRoot = await makeTempPackageRoot();
  await mkdir(path.join(packageRoot, "dist"));
  await writeFile(path.join(packageRoot, "dist", "index.html"), "ok");
  await symlink("index.html", path.join(packageRoot, "dist", "linked.html"));

  await assert.rejects(
    assertNoSymlinks(packageRoot),
    /Package contains symlink/,
  );
});
