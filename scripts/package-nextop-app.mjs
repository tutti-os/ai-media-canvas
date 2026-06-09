import { spawn } from "node:child_process";
import {
  access,
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const buildRoot = path.join(rootDir, "build", "nextop-app");
const packageRoot = path.join(buildRoot, "package");

const REQUIRED_PACKAGE_FILES = [
  "nextop.app.json",
  "AGENTS.md",
  "bootstrap.sh",
  "server/server.js",
  "server/worker.js",
  "server/tools-mcp.js",
];

const MANIFEST_LOCALIZATIONS = {
  "zh-CN": {
    file: "locales/zh-CN/manifest.json",
    metadata: {
      name: "AI 媒体画布",
      description: "本地优先的 AI 图像与视频生成画布。",
      tags: ["生成式 AI", "本地优先", "媒体画布"],
    },
  },
};

export function createManifest({ version }) {
  return {
    schemaVersion: "nextop.app.manifest.v1",
    appId: "ai-media-canvas",
    version,
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
    localizationInfo: {
      defaultLocale: "en",
      additionalLocales: Object.entries(MANIFEST_LOCALIZATIONS).map(
        ([locale, { file }]) => ({
          locale,
          file,
        }),
      ),
    },
    launch: {
      mode: "workspace-open",
    },
    author: {
      name: "Nextop",
    },
    tags: ["generated", "local-first", "media-canvas"],
  };
}

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="\${NEXTOP_APP_PACKAGE_DIR:-$script_dir}"

export HOST="\${NEXTOP_APP_HOST:-127.0.0.1}"
export AIMC_SERVER_PORT="\${NEXTOP_APP_PORT:-3001}"
export AIMC_APP_VERSION="${version}"
export AIMC_WEB_DIST="$package_dir/dist"
export AIMC_DATA_ROOT="\${NEXTOP_APP_DATA_DIR:-$package_dir/.data}"
export AIMC_SKILLS_ROOT="$package_dir/skills"
export AIMC_TOOLS_MCP_PATH="$package_dir/server/tools-mcp.js"
export AIMC_AGENT_FILES_ROOT="\${NEXTOP_WORKSPACE_ROOT:-$AIMC_DATA_ROOT}"

base_url="\${NEXTOP_APP_BASE_URL:-http://$HOST:$AIMC_SERVER_PORT}"
export AIMC_WEB_ORIGIN="$base_url"
export AIMC_SERVER_BASE_URL="$base_url"

node_bin="\${NEXTOP_APP_NODE:-node}"
runtime_dir="\${NEXTOP_APP_RUNTIME_DIR:-$AIMC_DATA_ROOT/.runtime}"
mkdir -p "$AIMC_DATA_ROOT" "$runtime_dir"
worker_status_file="$runtime_dir/worker.exit"
server_status_file="$runtime_dir/server.exit"
rm -f "$worker_status_file" "$server_status_file"

run_child() {
  target=$1
  status_file=$2
  "$node_bin" "$target" &
  child_pid=$!
  trap 'kill "$child_pid" 2>/dev/null || true; wait "$child_pid" 2>/dev/null || true; exit 143' INT TERM
  wait "$child_pid"
  child_status=$?
  printf "%s\\n" "$child_status" > "$status_file"
  exit "$child_status"
}

monitor_children() {
  while :; do
    if [ -f "$worker_status_file" ]; then
      child_status=$(cat "$worker_status_file")
      return "$child_status"
    fi
    if [ -f "$server_status_file" ]; then
      child_status=$(cat "$server_status_file")
      return "$child_status"
    fi
    if ! kill -0 "$worker_pid" 2>/dev/null; then
      wait "$worker_pid" 2>/dev/null
      return $?
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      wait "$server_pid" 2>/dev/null
      return $?
    fi
    sleep 1
  done
}

run_child "$package_dir/server/worker.js" "$worker_status_file" &
worker_pid=$!
run_child "$package_dir/server/server.js" "$server_status_file" &
server_pid=$!

cleanup() {
  status=$?
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  kill "$worker_pid" 2>/dev/null || true
  wait "$worker_pid" 2>/dev/null || true
  exit "$status"
}

trap cleanup INT TERM EXIT

monitor_children
`;
}

export function renderAgentsGuide() {
  return `# AI Media Canvas Nextop Package

This package runs AI Media Canvas as a Nextop workspace app.

## Package Layout

- \`nextop.app.json\`: Nextop manifest.
- \`bootstrap.sh\`: executable runtime entrypoint.
- \`dist/\`: static frontend files from \`apps/web/out\`.
- \`server/server.js\`: bundled Fastify server.
- \`server/worker.js\`: bundled background worker for queued generation jobs.
- \`skills/\`: packaged local skills used by the app runtime.
- \`icon.png\`: App Center icon with its own contrast-safe background.

## Runtime

Nextop executes \`bootstrap.sh\` with no arguments. The bootstrap script binds
the server to \`NEXTOP_APP_HOST:NEXTOP_APP_PORT\`, serves \`dist/\`, and stores
durable SQLite data and local assets under \`NEXTOP_APP_DATA_DIR\`.
When those variables are absent during local direct startup, it falls back to
\`127.0.0.1:3001\`, \`./.data\`, and the system \`node\` command.

Treat \`NEXTOP_APP_PACKAGE_DIR\` as read-only. Use \`NEXTOP_APP_DATA_DIR\` for
durable data, \`NEXTOP_APP_RUNTIME_DIR\` for scratch files, and
\`NEXTOP_APP_LOG_DIR\` for additional logs if future changes add them.
`;
}

export function createWebBuildEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    AIMC_SERVER_BASE_URL: "",
    NEXT_PUBLIC_AIMC_SERVER_BASE_URL: "",
  };
}

export async function assertNoSymlinks(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    const entryStat = await lstat(entryPath);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Package contains symlink: ${path.relative(root, entryPath)}`);
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(entryPath);
    }
  }
}

export async function validatePackageRoot(root) {
  for (const relativePath of REQUIRED_PACKAGE_FILES) {
    const absolutePath = path.join(root, relativePath);
    try {
      await access(absolutePath);
    } catch {
      throw new Error(`Missing required package file: ${relativePath}`);
    }
  }

  const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
  if (agents.trim().length === 0) {
    throw new Error("AGENTS.md must be non-empty.");
  }

  const bootstrapStat = await stat(path.join(root, "bootstrap.sh"));
  if ((bootstrapStat.mode & 0o111) === 0) {
    throw new Error("bootstrap.sh must be executable.");
  }

  const manifest = JSON.parse(
    await readFile(path.join(root, "nextop.app.json"), "utf8"),
  );
  if (manifest.runtime && "kind" in manifest.runtime) {
    throw new Error("nextop.app.json must not declare runtime.kind.");
  }

  for (const locale of manifest.localizationInfo?.additionalLocales ?? []) {
    const localeFile = locale?.file;
    if (typeof localeFile !== "string" || localeFile.length === 0) {
      throw new Error(
        "Manifest localization file must be a non-empty relative path.",
      );
    }
    try {
      await access(path.join(root, localeFile));
    } catch {
      throw new Error(`Missing manifest localization file: ${localeFile}`);
    }
  }

  await assertNoSymlinks(root);
}

async function readRootPackage() {
  return JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function writePackageFiles(version) {
  await rm(packageRoot, { force: true, recursive: true });
  await mkdir(path.join(packageRoot, "server"), { recursive: true });

  await writeFile(
    path.join(packageRoot, "nextop.app.json"),
    `${JSON.stringify(createManifest({ version }), null, 2)}\n`,
  );
  for (const { file, metadata } of Object.values(MANIFEST_LOCALIZATIONS)) {
    const localePath = path.join(packageRoot, file);
    await mkdir(path.dirname(localePath), { recursive: true });
    await writeFile(localePath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  await writeFile(path.join(packageRoot, "AGENTS.md"), renderAgentsGuide());
  await writeFile(path.join(packageRoot, "bootstrap.sh"), renderBootstrap({ version }));
  await chmod(path.join(packageRoot, "bootstrap.sh"), 0o755);

  await cp(
    path.join(rootDir, "apps", "web", "public", "brand", "aimc-nextop-app-icon.png"),
    path.join(packageRoot, "icon.png"),
  );
  await cp(path.join(rootDir, "apps", "web", "out"), path.join(packageRoot, "dist"), {
    recursive: true,
  });
  await cp(path.join(rootDir, "skills"), path.join(packageRoot, "skills"), {
    recursive: true,
  });
}

async function bundleServer() {
  await run("pnpm", [
    "exec",
    "esbuild",
    "apps/server/src/server.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    "--outfile=build/nextop-app/package/server/server.js",
    "--banner:js=import { createRequire as __aimcCreateRequire } from 'node:module'; const require = __aimcCreateRequire(import.meta.url);",
  ]);
}

async function bundleWorker() {
  await run("pnpm", [
    "exec",
    "esbuild",
    "apps/server/src/worker.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    "--outfile=build/nextop-app/package/server/worker.js",
    "--banner:js=import { createRequire as __aimcCreateRequire } from 'node:module'; const require = __aimcCreateRequire(import.meta.url);",
  ]);
}

async function bundleToolsMcpServer() {
  await run("pnpm", [
    "exec",
    "esbuild",
    "apps/server/src/agent/local-agent-host/tools-mcp.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    "--outfile=build/nextop-app/package/server/tools-mcp.js",
  ]);
}

async function createZip(version) {
  const zipPath = path.join(buildRoot, `ai-media-canvas-${version}.zip`);
  await rm(zipPath, { force: true });
  await run("zip", ["-qry", zipPath, "."], { cwd: packageRoot });
  return zipPath;
}

export async function packageNextopApp() {
  const rootPackage = await readRootPackage();
  const version = rootPackage.version ?? "0.0.0";

  await run("pnpm", ["--filter", "@aimc/shared", "build"]);
  await run("pnpm", ["--filter", "@aimc/web", "build"], {
    env: createWebBuildEnv(),
  });

  await mkdir(buildRoot, { recursive: true });
  await writePackageFiles(version);
  await bundleServer();
  await bundleWorker();
  await bundleToolsMcpServer();
  await validatePackageRoot(packageRoot);
  const zipPath = await createZip(version);
  console.log(`Created ${zipPath}`);
  return zipPath;
}

if (process.argv[1] === scriptPath) {
  packageNextopApp().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
