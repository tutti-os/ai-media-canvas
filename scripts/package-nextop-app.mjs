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
  "nextop.cli.json",
  "COMMANDS.md",
  "AGENTS.md",
  "bootstrap.sh",
  "server/server.js",
  "server/worker.js",
  "server/tools-mcp.js",
];

const CLI_SCOPE = "aimc";
const CLI_COMMANDS = [
  {
    path: ["status"],
    summary: "Show app status",
    description:
      "Return AI Media Canvas server health, app version, and local runtime metadata.",
  },
  {
    path: ["projects", "list"],
    summary: "List projects",
    description: "List local AI Media Canvas projects.",
  },
  {
    path: ["projects", "get"],
    summary: "Get a project",
    description: "Return one local AI Media Canvas project by project-id.",
    properties: {
      "project-id": { type: "string", description: "Project id to load." },
    },
    required: ["project-id"],
  },
  {
    path: ["projects", "create"],
    summary: "Create a project",
    description:
      "Create a local AI Media Canvas project. Use the returned primaryCanvas.id before saving canvas content.",
    properties: {
      name: { type: "string", description: "Project name." },
      description: {
        type: "string",
        description: "Optional project description.",
      },
    },
    required: ["name"],
  },
  {
    path: ["canvases", "get"],
    summary: "Get a canvas",
    description: "Return canvas content by canvas-id.",
    properties: {
      "canvas-id": { type: "string", description: "Canvas id to load." },
    },
    required: ["canvas-id"],
  },
  {
    path: ["canvases", "save"],
    summary: "Save a canvas",
    description:
      "Save canvas content by canvas-id. Pass content-json as a JSON string matching the canvas content object.",
    properties: {
      "canvas-id": { type: "string", description: "Canvas id to save." },
      "content-json": {
        type: "string",
        description: "Canvas content JSON string.",
      },
    },
    required: ["canvas-id", "content-json"],
  },
  {
    path: ["sessions", "list"],
    summary: "List chat sessions",
    description: "List chat sessions for a canvas-id.",
    properties: {
      "canvas-id": {
        type: "string",
        description: "Canvas id whose sessions should be listed.",
      },
    },
    required: ["canvas-id"],
  },
  {
    path: ["sessions", "create"],
    summary: "Create a chat session",
    description:
      "Create a chat session for a canvas-id. Use the returned session.id for messages and agent runs.",
    properties: {
      "canvas-id": {
        type: "string",
        description: "Canvas id for the new session.",
      },
      title: { type: "string", description: "Optional session title." },
    },
    required: ["canvas-id"],
  },
  {
    path: ["messages", "list"],
    summary: "List chat messages",
    description: "List messages in a chat session by session-id.",
    properties: {
      "session-id": { type: "string", description: "Chat session id." },
    },
    required: ["session-id"],
  },
  {
    path: ["messages", "create"],
    summary: "Create a chat message",
    description:
      "Append a text-only user or assistant message to a chat session.",
    properties: {
      "session-id": { type: "string", description: "Chat session id." },
      role: { type: "string", description: "Message role: user or assistant." },
      content: { type: "string", description: "Message text content." },
    },
    required: ["session-id", "role", "content"],
  },
  {
    path: ["agent", "run"],
    summary: "Start an agent run",
    description:
      "Start an AI Media Canvas agent run for a session and conversation. Poll agent events with agent events using the returned runId.",
    properties: {
      "session-id": { type: "string", description: "Chat session id." },
      "conversation-id": {
        type: "string",
        description:
          "Conversation or canvas id used for streamed canvas events.",
      },
      prompt: { type: "string", description: "User prompt for the agent." },
      "canvas-id": {
        type: "string",
        description: "Optional canvas id for canvas event replay.",
      },
      model: { type: "string", description: "Optional agent model id." },
      "runtime-kind": {
        type: "string",
        description: "Optional runtime kind, for example local-agent.",
      },
      "runtime-provider": {
        type: "string",
        description: "Optional local agent provider id.",
      },
    },
    required: ["session-id", "conversation-id", "prompt"],
    timeoutMs: 60000,
  },
  {
    path: ["agent", "events"],
    summary: "Poll agent events",
    description:
      "Poll persisted events for an agent run. Use cursor from the previous response nextCursor to continue.",
    properties: {
      "run-id": { type: "string", description: "Agent run id." },
      cursor: {
        type: "integer",
        description: "Optional event cursor, defaults to 0.",
      },
    },
    required: ["run-id"],
  },
  {
    path: ["agent", "cancel"],
    summary: "Cancel an agent run",
    description: "Cancel an active agent run by run-id.",
    properties: {
      "run-id": { type: "string", description: "Agent run id." },
    },
    required: ["run-id"],
  },
  {
    path: ["generation", "image"],
    summary: "Queue image generation",
    description:
      "Queue an image generation job. Use jobs get or jobs list to monitor status.",
    properties: {
      prompt: { type: "string", description: "Image prompt." },
      model: { type: "string", description: "Optional image model id." },
      "project-id": { type: "string", description: "Optional project id." },
      "canvas-id": { type: "string", description: "Optional canvas id." },
      "session-id": { type: "string", description: "Optional session id." },
      "aspect-ratio": { type: "string", description: "Optional aspect ratio." },
      quality: {
        type: "string",
        description: "Optional quality: standard, hd, or ultra.",
      },
      size: { type: "string", description: "Optional image size." },
      seed: { type: "integer", description: "Optional integer seed." },
      "input-images": {
        type: "string",
        description: "Optional comma-separated input image URLs.",
      },
    },
    required: ["prompt"],
    timeoutMs: 60000,
  },
  {
    path: ["generation", "video"],
    summary: "Queue video generation",
    description:
      "Queue a video generation job. Use jobs get or jobs list to monitor status.",
    properties: {
      prompt: { type: "string", description: "Video prompt." },
      model: { type: "string", description: "Optional video model id." },
      "project-id": { type: "string", description: "Optional project id." },
      "canvas-id": { type: "string", description: "Optional canvas id." },
      "session-id": { type: "string", description: "Optional session id." },
      duration: {
        type: "integer",
        description: "Optional duration in seconds.",
      },
      resolution: { type: "string", description: "Optional resolution." },
      "aspect-ratio": { type: "string", description: "Optional aspect ratio." },
      "input-images": {
        type: "string",
        description: "Optional comma-separated input image URLs.",
      },
      "input-video": {
        type: "string",
        description: "Optional input video URL.",
      },
      "negative-prompt": {
        type: "string",
        description: "Optional negative prompt.",
      },
      seed: { type: "integer", description: "Optional integer seed." },
      "enable-audio": {
        type: "boolean",
        description: "Optional audio generation flag.",
      },
    },
    required: ["prompt"],
    timeoutMs: 60000,
  },
  {
    path: ["jobs", "list"],
    summary: "List jobs",
    description:
      "List background generation jobs. Filter with status or job-type when needed.",
    properties: {
      status: { type: "string", description: "Optional job status filter." },
      "job-type": {
        type: "string",
        description: "Optional job type: image_generation or video_generation.",
      },
    },
  },
  {
    path: ["jobs", "get"],
    summary: "Get a job",
    description: "Return one background job by job-id.",
    properties: {
      "job-id": { type: "string", description: "Job id to load." },
    },
    required: ["job-id"],
  },
  {
    path: ["jobs", "cancel"],
    summary: "Cancel a job",
    description: "Cancel one queued or running background job by job-id.",
    properties: {
      "job-id": { type: "string", description: "Job id to cancel." },
    },
    required: ["job-id"],
  },
  {
    path: ["models", "list"],
    summary: "List agent models",
    description:
      "List configured assistant and local-agent models available to agent runs.",
  },
  {
    path: ["models", "image"],
    summary: "List image models",
    description: "List image generation models available to generation image.",
  },
  {
    path: ["models", "video"],
    summary: "List video models",
    description: "List video generation models available to generation video.",
  },
  {
    path: ["skills", "list"],
    summary: "List skills",
    description: "List installed AI Media Canvas skills.",
  },
  {
    path: ["skills", "get"],
    summary: "Get a skill",
    description: "Return skill detail by skill-id.",
    properties: {
      "skill-id": { type: "string", description: "Skill id to load." },
    },
    required: ["skill-id"],
  },
  {
    path: ["skills", "enable"],
    summary: "Enable or disable a skill",
    description: "Enable or disable an installed skill by skill-id.",
    properties: {
      "skill-id": { type: "string", description: "Skill id to update." },
      enabled: {
        type: "boolean",
        description: "Whether the skill should be enabled.",
      },
    },
    required: ["skill-id", "enabled"],
  },
  {
    path: ["skills", "install"],
    summary: "Install a bundled skill",
    description: "Install a bundled catalog skill by skill-id.",
    properties: {
      "skill-id": {
        type: "string",
        description: "Catalog skill id to install.",
      },
    },
    required: ["skill-id"],
  },
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
    cli: {
      manifest: "nextop.cli.json",
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

export function createCliManifest() {
  return {
    schemaVersion: "nextop.app.cli.v1",
    scope: CLI_SCOPE,
    description:
      "Control AI Media Canvas projects, canvases, generation jobs, agent runs, and skills.",
    documentation: {
      file: "COMMANDS.md",
    },
    commands: CLI_COMMANDS.map((command) => createCliCommand(command)),
  };
}

function createCliCommand(command) {
  return {
    path: command.path,
    summary: command.summary,
    description: command.description,
    inputSchema: {
      type: "object",
      properties: command.properties ?? {},
      ...(command.required?.length ? { required: command.required } : {}),
    },
    output: {
      defaultMode: "json",
      json: true,
    },
    handler: {
      kind: "http",
      method: "POST",
      path: `/nextop/cli/${command.path.join("/")}`,
      timeoutMs: command.timeoutMs ?? 30000,
    },
  };
}

export function renderCommandsGuide() {
  const manifest = createCliManifest();
  const rows = manifest.commands
    .map((command) => {
      const required = command.inputSchema.required ?? [];
      const flags = Object.keys(command.inputSchema.properties)
        .map((key) => `--${key}${required.includes(key) ? " <required>" : ""}`)
        .join(" ");
      const usage = [manifest.scope, ...command.path, flags]
        .filter(Boolean)
        .join(" ");
      return `### \`${usage}\`\n\n${command.description}\n\nHandler: \`${command.handler.path}\`\n`;
    })
    .join("\n");

  return `# AI Media Canvas CLI Commands\n\nScope: \`${manifest.scope}\`\n\nThese commands expose AI Media Canvas to the Nextop app CLI. Command outputs are JSON \`CliCommandOutput\` envelopes.\n\n${rows}`;
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
      throw new Error(
        `Package contains symlink: ${path.relative(root, entryPath)}`,
      );
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
  if (manifest.cli?.manifest !== "nextop.cli.json") {
    throw new Error(
      "nextop.app.json must declare cli.manifest as nextop.cli.json.",
    );
  }

  const cliManifest = JSON.parse(
    await readFile(path.join(root, "nextop.cli.json"), "utf8"),
  );
  validateCliManifest(cliManifest);
  const docsFile = cliManifest.documentation?.file;
  if (typeof docsFile !== "string" || docsFile !== "COMMANDS.md") {
    throw new Error(
      "nextop.cli.json must declare documentation.file as COMMANDS.md.",
    );
  }
  const commandsGuide = await readFile(path.join(root, docsFile), "utf8");
  if (commandsGuide.trim().length === 0) {
    throw new Error("COMMANDS.md must be non-empty.");
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

function validateCliManifest(manifest) {
  if (manifest.schemaVersion !== "nextop.app.cli.v1") {
    throw new Error(
      "nextop.cli.json must use schemaVersion nextop.app.cli.v1.",
    );
  }
  if (!isCliPathSegment(manifest.scope)) {
    throw new Error(
      "nextop.cli.json scope must be lowercase letters, numbers, or hyphen.",
    );
  }
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) {
    throw new Error("nextop.cli.json must declare commands.");
  }

  const seenCommands = new Set();
  for (const command of manifest.commands) {
    if (!Array.isArray(command.path) || command.path.length === 0) {
      throw new Error("CLI command path must be a non-empty array.");
    }
    for (const segment of command.path) {
      if (!isCliPathSegment(segment)) {
        throw new Error(`Invalid CLI command path segment: ${segment}`);
      }
      if (segment === manifest.scope) {
        throw new Error("CLI command path must not repeat the scope.");
      }
    }

    const commandKey = command.path.join(" ");
    if (seenCommands.has(commandKey)) {
      throw new Error(`Duplicate CLI command: ${commandKey}`);
    }
    seenCommands.add(commandKey);

    if (!command.summary || !command.description) {
      throw new Error(
        `CLI command ${commandKey} must describe itself for agents.`,
      );
    }
    if (
      command.handler?.kind !== "http" ||
      command.handler?.method !== "POST"
    ) {
      throw new Error(
        `CLI command ${commandKey} must use an HTTP POST handler.`,
      );
    }
    const expectedHandlerPath = `/nextop/cli/${command.path.join("/")}`;
    if (command.handler?.path !== expectedHandlerPath) {
      throw new Error(
        `CLI command ${commandKey} handler.path must be ${expectedHandlerPath}.`,
      );
    }
    validateCliInputSchema(commandKey, command.inputSchema);
  }
}

function validateCliInputSchema(commandKey, schema) {
  if (schema?.type !== "object" || typeof schema.properties !== "object") {
    throw new Error(
      `CLI command ${commandKey} inputSchema must be an object schema.`,
    );
  }
  const required = schema.required ?? [];
  if (!Array.isArray(required)) {
    throw new Error(
      `CLI command ${commandKey} inputSchema.required must be an array.`,
    );
  }
  for (const [propertyName, property] of Object.entries(schema.properties)) {
    if (!isCliPathSegment(propertyName)) {
      throw new Error(
        `CLI command ${commandKey} has invalid input name: ${propertyName}`,
      );
    }
    if (!["string", "boolean", "integer"].includes(property?.type)) {
      throw new Error(
        `CLI command ${commandKey} input ${propertyName} must be string, boolean, or integer.`,
      );
    }
    if (required.includes(propertyName) && !property.description) {
      throw new Error(
        `CLI command ${commandKey} required input ${propertyName} must have a description.`,
      );
    }
  }
  for (const requiredName of required) {
    if (!(requiredName in schema.properties)) {
      throw new Error(
        `CLI command ${commandKey} requires unknown input ${requiredName}.`,
      );
    }
  }
}

function isCliPathSegment(value) {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value);
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
      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code}`),
      );
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
  await writeFile(
    path.join(packageRoot, "nextop.cli.json"),
    `${JSON.stringify(createCliManifest(), null, 2)}\n`,
  );
  for (const { file, metadata } of Object.values(MANIFEST_LOCALIZATIONS)) {
    const localePath = path.join(packageRoot, file);
    await mkdir(path.dirname(localePath), { recursive: true });
    await writeFile(localePath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  await writeFile(path.join(packageRoot, "COMMANDS.md"), renderCommandsGuide());
  await writeFile(path.join(packageRoot, "AGENTS.md"), renderAgentsGuide());
  await writeFile(
    path.join(packageRoot, "bootstrap.sh"),
    renderBootstrap({ version }),
  );
  await chmod(path.join(packageRoot, "bootstrap.sh"), 0o755);

  await cp(
    path.join(
      rootDir,
      "apps",
      "web",
      "public",
      "brand",
      "aimc-nextop-app-icon.png",
    ),
    path.join(packageRoot, "icon.png"),
  );
  await cp(
    path.join(rootDir, "apps", "web", "out"),
    path.join(packageRoot, "dist"),
    {
      recursive: true,
    },
  );
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
