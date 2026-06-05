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

const REQUIRED_PACKAGE_FILES = ["nextop.app.json", "AGENTS.md", "bootstrap.sh"];

export function createManifest({ version }) {
  return {
    schemaVersion: "nextop.app.manifest.v1",
    appId: "ai-media-canvas",
    version,
    name: "AI Media Canvas",
    description: "Local-first AI canvas for image and video generation.",
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
  };
}

export function renderBootstrap({ version = "0.0.0" } = {}) {
  return `#!/bin/sh
set -eu

: "\${NEXTOP_APP_PACKAGE_DIR:?}"
: "\${NEXTOP_APP_HOST:?}"
: "\${NEXTOP_APP_PORT:?}"
: "\${NEXTOP_APP_DATA_DIR:?}"
: "\${NEXTOP_APP_BASE_URL:?}"

export HOST="$NEXTOP_APP_HOST"
export AIMC_SERVER_PORT="$NEXTOP_APP_PORT"
export AIMC_APP_VERSION="${version}"
export AIMC_WEB_DIST="$NEXTOP_APP_PACKAGE_DIR/dist"
export AIMC_DATA_ROOT="$NEXTOP_APP_DATA_DIR"
export AIMC_SKILLS_ROOT="$NEXTOP_APP_PACKAGE_DIR/skills"
export AIMC_AGENT_FILES_ROOT="\${NEXTOP_WORKSPACE_ROOT:-$NEXTOP_APP_DATA_DIR}"
export AIMC_WEB_ORIGIN="$NEXTOP_APP_BASE_URL"
export AIMC_SERVER_BASE_URL="$NEXTOP_APP_BASE_URL"

exec node "$NEXTOP_APP_PACKAGE_DIR/server/server.js"
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
- \`skills/\`: packaged local skills used by the app runtime.
- \`icon.svg\`: App Center icon with its own contrast-safe background.

## Runtime

Nextop executes \`bootstrap.sh\` with no arguments. The bootstrap script binds
the server to \`NEXTOP_APP_HOST:NEXTOP_APP_PORT\`, serves \`dist/\`, and stores
durable SQLite data and local assets under \`NEXTOP_APP_DATA_DIR\`.

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
  await writeFile(path.join(packageRoot, "AGENTS.md"), renderAgentsGuide());
  await writeFile(path.join(packageRoot, "bootstrap.sh"), renderBootstrap({ version }));
  await chmod(path.join(packageRoot, "bootstrap.sh"), 0o755);

  await cp(
    path.join(rootDir, "apps", "web", "public", "brand", "aimc-nextop-app-icon.svg"),
    path.join(packageRoot, "icon.svg"),
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
