import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";

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

function readPngAlphaBounds(png) {
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  assert.equal(colorType, 6, "icon PNG must be RGBA so alpha bounds can be checked");

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;

      if (filter === 0) {
        pixels[y * stride + x] = raw;
      } else if (filter === 1) {
        pixels[y * stride + x] = (raw + left) & 0xff;
      } else if (filter === 2) {
        pixels[y * stride + x] = (raw + up) & 0xff;
      } else if (filter === 3) {
        pixels[y * stride + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        pixels[y * stride + x] = (raw + predictor) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
    }

    sourceOffset += stride;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[y * stride + x * bytesPerPixel + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    height,
    width,
    contentHeight: maxY - minY + 1,
    contentWidth: maxX - minX + 1,
  };
}

test("createManifest returns the Nextop package manifest contract", () => {
  const manifest = createManifest({ version: "1.2.3" });

  assert.deepEqual(manifest, {
    schemaVersion: "nextop.app.manifest.v1",
    appId: "ai-media-canvas",
    version: "1.2.3",
    name: "AI Media Canvas",
    description: "Local-first AI canvas for image and video generation.",
    icon: {
      type: "asset",
      src: "icon.png",
    },
    runtime: {
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
  assert.match(bootstrap, /export AIMC_TOOLS_MCP_PATH="\$NEXTOP_APP_PACKAGE_DIR\/server\/tools-mcp\.js"/);
  assert.match(
    bootstrap,
    /export AIMC_AGENT_FILES_ROOT="\$\{NEXTOP_WORKSPACE_ROOT:-\$NEXTOP_APP_DATA_DIR\}"/,
  );
  assert.match(bootstrap, /node_bin="\$\{NEXTOP_APP_NODE:-node\}"/);
  assert.match(bootstrap, /run_child "\$NEXTOP_APP_PACKAGE_DIR\/server\/worker.js" "\$worker_status_file" &/);
  assert.match(bootstrap, /worker_pid=\$!/);
  assert.match(bootstrap, /run_child "\$NEXTOP_APP_PACKAGE_DIR\/server\/server.js" "\$server_status_file" &/);
  assert.match(bootstrap, /server_pid=\$!/);
  assert.match(bootstrap, /monitor_children\(\)/);
  assert.match(bootstrap, /kill -0 "\$worker_pid"/);
  assert.match(bootstrap, /kill -0 "\$server_pid"/);
});

test("renderAgentsGuide is non-empty and documents package layout", () => {
  const guide = renderAgentsGuide();

  assert.match(guide, /AI Media Canvas/);
  assert.match(guide, /nextop\.app\.json/);
  assert.match(guide, /bootstrap\.sh/);
  assert.match(guide, /icon\.png/);
  assert.match(guide, /NEXTOP_APP_DATA_DIR/);
});

test("Nextop icon asset is a generated PNG with a contrast-safe tile", async () => {
  const iconPath = path.resolve("apps/web/public/brand/aimc-nextop-app-icon.png");
  const icon = await readFile(iconPath);
  const iconStat = await stat(iconPath);
  const bounds = readPngAlphaBounds(icon);

  assert.ok(iconStat.size > 0);
  assert.equal(bounds.width, 1024);
  assert.equal(bounds.height, 1024);
  assert.ok(
    bounds.contentWidth >= 900 && bounds.contentHeight >= 900,
    `icon content should fill most of the canvas, got ${bounds.contentWidth}x${bounds.contentHeight}`,
  );
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
  await mkdir(path.join(packageRoot, "server"));
  await writeFile(path.join(packageRoot, "server", "server.js"), "ok\n");
  await writeFile(path.join(packageRoot, "server", "worker.js"), "ok\n");
  await writeFile(path.join(packageRoot, "server", "tools-mcp.js"), "ok\n");
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
