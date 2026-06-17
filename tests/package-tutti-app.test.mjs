import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";

import {
  assertNoSymlinks,
  createCliManifest,
  createManifest,
  createWebBuildEnv,
  normalizePackageTimestamps,
  renderAgentsGuide,
  renderBootstrap,
  renderCommandsGuide,
  validatePackageRoot,
} from "../scripts/package-tutti-app.mjs";

async function makeTempPackageRoot() {
  return mkdtemp(path.join(os.tmpdir(), "aimc-tutti-package-test-"));
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

  assert.equal(
    colorType,
    6,
    "icon PNG must be RGBA so alpha bounds can be checked",
  );

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
      const left =
        x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[(y - 1) * stride + x - bytesPerPixel]
          : 0;

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

test("createManifest returns the Tutti package manifest contract", () => {
  const manifest = createManifest({ version: "1.2.3" });

  assert.deepEqual(manifest, {
    schemaVersion: "tutti.app.manifest.v1",
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
    cli: {
      manifest: "tutti.cli.json",
    },
    references: {
      listEndpoint: "/tutti/references/list",
    },
    localizationInfo: {
      defaultLocale: "en",
      additionalLocales: [
        {
          locale: "zh-CN",
          file: "locales/zh-CN/manifest.json",
        },
      ],
    },
    launch: {
      mode: "workspace-open",
    },
    author: {
      name: "Tutti",
    },
    tags: ["generated", "local-first", "media-canvas"],
  });
});

test("root Tutti app manifest matches the generated package manifest", async () => {
  const manifest = JSON.parse(await readFile("tutti.app.json", "utf8"));

  assert.deepEqual(manifest, createManifest({ version: manifest.version }));
});

test("createCliManifest returns the Tutti CLI manifest contract", () => {
  const manifest = createCliManifest();

  assert.equal(manifest.schemaVersion, "tutti.app.cli.v1");
  assert.equal(manifest.scope, "aimc");
  assert.equal(manifest.documentation.file, "COMMANDS.md");
  assert.ok(manifest.commands.length >= 20);
  assert.deepEqual(
    manifest.commands.find(
      (command) => command.path.join(" ") === "projects create",
    ),
    {
      path: ["projects", "create"],
      summary: "Create a project",
      description:
        "Create a local AI Media Canvas project. Use the returned primaryCanvas.id before saving canvas content.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name." },
          description: {
            type: "string",
            description: "Optional project description.",
          },
        },
        required: ["name"],
      },
      output: {
        defaultMode: "json",
        json: true,
      },
      handler: {
        kind: "http",
        method: "POST",
        path: "/tutti/cli/projects/create",
        timeoutMs: 30000,
      },
    },
  );
});

test("createCliManifest keeps command metadata discoverable for agents", () => {
  const manifest = createCliManifest();

  for (const command of manifest.commands) {
    assert.match(command.handler.path, /^\/tutti\/cli\//);
    assert.equal(command.handler.path, `/tutti/cli/${command.path.join("/")}`);
    assert.ok(command.summary.length > 0);
    assert.ok(command.description.length > command.summary.length);

    const required = command.inputSchema.required ?? [];
    for (const propertyName of required) {
      assert.ok(
        command.inputSchema.properties[propertyName]?.description,
        `${command.path.join(" ")} must describe required input ${propertyName}`,
      );
    }
  }
});

test("renderCommandsGuide documents CLI commands", () => {
  const guide = renderCommandsGuide();

  assert.match(guide, /AI Media Canvas CLI Commands/);
  assert.match(guide, /`aimc projects create --name <required> --description`/);
  assert.match(guide, /\/tutti\/cli\/agent\/run/);
});

test("renderBootstrap maps Tutti runtime env into AI Media Canvas env", () => {
  const bootstrap = renderBootstrap({ version: "1.2.3" });

  assert.match(bootstrap, /^#!\/bin\/sh\n/);
  assert.match(
    bootstrap,
    /package_dir="\$\{TUTTI_APP_PACKAGE_DIR:-\$script_dir\}"/,
  );
  assert.match(bootstrap, /export HOST="\$\{TUTTI_APP_HOST:-127\.0\.0\.1\}"/);
  assert.match(
    bootstrap,
    /export AIMC_SERVER_PORT="\$\{TUTTI_APP_PORT:-3001\}"/,
  );
  assert.match(bootstrap, /export AIMC_APP_VERSION="1\.2\.3"/);
  assert.match(bootstrap, /export AIMC_WEB_DIST="\$package_dir\/dist"/);
  assert.match(
    bootstrap,
    /export AIMC_DATA_ROOT="\$\{TUTTI_APP_DATA_DIR:-\$package_dir\/\.data\}"/,
  );
  assert.match(bootstrap, /export AIMC_SKILLS_ROOT="\$package_dir\/skills"/);
  assert.match(
    bootstrap,
    /export AIMC_TOOLS_MCP_PATH="\$package_dir\/server\/tools-mcp\.js"/,
  );
  assert.match(
    bootstrap,
    /export AIMC_AGENT_FILES_ROOT="\$\{TUTTI_WORKSPACE_ROOT:-\$AIMC_DATA_ROOT\}"/,
  );
  assert.match(
    bootstrap,
    /base_url="\$\{TUTTI_APP_BASE_URL:-http:\/\/\$HOST:\$AIMC_SERVER_PORT\}"/,
  );
  assert.match(bootstrap, /node_bin="\$\{TUTTI_APP_NODE:-node\}"/);
  assert.match(
    bootstrap,
    /runtime_dir="\$\{TUTTI_APP_RUNTIME_DIR:-\$AIMC_DATA_ROOT\/\.runtime\}"/,
  );
  assert.doesNotMatch(bootstrap, new RegExp("NEXT" + "OP"));
  assert.match(
    bootstrap,
    /run_child "\$package_dir\/server\/worker.js" "\$worker_status_file" &/,
  );
  assert.match(bootstrap, /worker_pid=\$!/);
  assert.match(
    bootstrap,
    /run_child "\$package_dir\/server\/server.js" "\$server_status_file" &/,
  );
  assert.match(bootstrap, /server_pid=\$!/);
  assert.match(bootstrap, /monitor_children\(\)/);
  assert.match(bootstrap, /kill -0 "\$worker_pid"/);
  assert.match(bootstrap, /kill -0 "\$server_pid"/);
});

test("renderAgentsGuide is non-empty and documents package layout", () => {
  const guide = renderAgentsGuide();

  assert.match(guide, /AI Media Canvas/);
  assert.match(guide, /tutti\.app\.json/);
  assert.match(guide, /bootstrap\.sh/);
  assert.match(guide, /icon\.png/);
  assert.match(guide, /TUTTI_APP_DATA_DIR/);
});

test("Tutti icon asset is a generated PNG with a contrast-safe tile", async () => {
  const iconPath = path.resolve(
    "apps/web/public/brand/aimc-tutti-app-icon.png",
  );
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

test("validatePackageRoot requires the files Tutti imports", async () => {
  const packageRoot = await makeTempPackageRoot();

  await assert.rejects(
    validatePackageRoot(packageRoot),
    /Missing required package file: tutti\.app\.json/,
  );

  await writeFile(
    path.join(packageRoot, "tutti.app.json"),
    `${JSON.stringify(createManifest({ version: "1.2.3" }))}\n`,
  );
  await writeFile(
    path.join(packageRoot, "tutti.cli.json"),
    `${JSON.stringify(createCliManifest())}\n`,
  );
  await writeFile(path.join(packageRoot, "COMMANDS.md"), renderCommandsGuide());
  await writeFile(path.join(packageRoot, "AGENTS.md"), "Package guide\n");
  await writeFile(path.join(packageRoot, "bootstrap.sh"), renderBootstrap());
  await mkdir(path.join(packageRoot, "server"));
  await writeFile(path.join(packageRoot, "server", "server.js"), "ok\n");
  await writeFile(path.join(packageRoot, "server", "worker.js"), "ok\n");
  await writeFile(path.join(packageRoot, "server", "tools-mcp.js"), "ok\n");
  await chmod(path.join(packageRoot, "bootstrap.sh"), 0o755);

  await assert.rejects(
    validatePackageRoot(packageRoot),
    /Missing manifest localization file: locales\/zh-CN\/manifest\.json/,
  );

  await mkdir(path.join(packageRoot, "locales", "zh-CN"), { recursive: true });
  await writeFile(
    path.join(packageRoot, "locales", "zh-CN", "manifest.json"),
    JSON.stringify({
      name: "AI 媒体画布",
      description: "本地优先的 AI 图像与视频生成画布。",
      tags: ["生成式 AI", "本地优先", "媒体画布"],
    }),
  );

  await validatePackageRoot(packageRoot);
});

test("normalizePackageTimestamps makes package mtimes deterministic", async () => {
  const packageRoot = await makeTempPackageRoot();
  const nestedDir = path.join(packageRoot, "server");
  const nestedFile = path.join(nestedDir, "server.js");
  const mtime = new Date("2024-01-02T03:04:05.000Z");

  await mkdir(nestedDir);
  await writeFile(path.join(packageRoot, "tutti.app.json"), "{}\n");
  await writeFile(nestedFile, "ok\n");

  await normalizePackageTimestamps(packageRoot, mtime);

  assert.equal((await stat(packageRoot)).mtimeMs, mtime.getTime());
  assert.equal((await stat(nestedDir)).mtimeMs, mtime.getTime());
  assert.equal((await stat(nestedFile)).mtimeMs, mtime.getTime());
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
