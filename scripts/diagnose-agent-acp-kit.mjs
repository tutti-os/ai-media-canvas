#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_PROMPT =
  "请只回复一句中文：诊断完成。不要调用工具，不要读取文件。";

function parseArgs(argv) {
  const args = {
    aimcSkills: false,
    cleanCodexConfig: false,
    cleanup: true,
    db: "local-data/ai-media-canvas.db",
    model: "default",
    prompt: DEFAULT_PROMPT,
    timeoutMs: 180_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--aimc-skills") args.aimcSkills = true;
    else if (arg === "--clean-codex-config") args.cleanCodexConfig = true;
    else if (arg === "--remove-instructions") args.removeInstructions = true;
    else if (arg === "--no-cleanup") args.cleanup = false;
    else if (arg === "--db" && next) {
      args.db = next;
      i += 1;
    } else if (arg === "--model" && next) {
      args.model = next;
      i += 1;
    } else if (arg === "--prompt" && next) {
      args.prompt = next;
      i += 1;
    } else if (arg === "--timeout-ms" && next) {
      args.timeoutMs = Number(next);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/diagnose-agent-acp-kit.mjs [options]

Options:
  --prompt <text>       Prompt sent to Codex. Defaults to a no-tool one-liner.
  --model <model>       Codex model. Defaults to "default".
  --aimc-skills         Load enabled skills from local SQLite and pass them as materialized-files.
  --clean-codex-config  Remove inherited mcp_servers/plugins from the temporary CODEX_HOME config before spawn.
  --remove-instructions Remove inherited CODEX_HOME/instructions.md before spawn.
  --db <path>           SQLite DB path for --aimc-skills. Defaults to local-data/ai-media-canvas.db.
  --timeout-ms <ms>     Kill Codex after this many ms. Defaults to 180000.
  --no-cleanup          Keep the temporary run directory for inspection.
`);
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function logLap(label, start, extra = {}) {
  const elapsedMs = nowMs() - start;
  console.log(
    JSON.stringify({
      elapsedMs,
      label,
      ...extra,
    }),
  );
}

function loadEnabledSkills(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const skills = db
      .prepare(
        `
          SELECT id, slug, skill_content
          FROM skills
          WHERE enabled = 1
          ORDER BY slug
        `,
      )
      .all();
    const files = db
      .prepare(
        `
          SELECT skill_id, file_path, content
          FROM skill_files
          ORDER BY skill_id, file_path
        `,
      )
      .all();
    const filesBySkillId = new Map();
    for (const file of files) {
      const existing = filesBySkillId.get(file.skill_id) ?? [];
      existing.push({
        path: file.file_path,
        content: file.content,
      });
      filesBySkillId.set(file.skill_id, existing);
    }

    return skills.map((skill) => ({
      skillId: skill.id,
      slug: skill.slug,
      content: skill.skill_content,
      files: filesBySkillId.get(skill.id) ?? [],
      materializedPath: `workspace-skills/${skill.slug}`,
      deliveryMode: "materialized-files",
    }));
  } finally {
    db.close();
  }
}

function summarizeSkills(skills) {
  return skills.map((skill) => ({
    slug: skill.slug,
    contentChars: skill.content?.length ?? 0,
    fileChars: (skill.files ?? []).reduce(
      (sum, file) => sum + file.content.length,
      0,
    ),
    fileCount: skill.files?.length ?? 0,
    deliveryMode: skill.deliveryMode,
  }));
}

function summarizePlan(plan) {
  return {
    command: plan.command,
    args: plan.args,
    cwd: plan.cwd,
    envKeys: Object.keys(plan.env ?? {}).sort(),
    hasCodexHome: Boolean(plan.env?.CODEX_HOME),
    promptChars: plan.prompt?.length ?? 0,
    promptInput: plan.promptInput,
    timeoutMs: plan.timeoutMs,
    transport: plan.transport,
  };
}

function getTomlTableName(line) {
  return line
    .trim()
    .match(/^\[([^\]]+)\]\s*(?:#.*)?$/)?.[1]
    ?.trim();
}

function stripInheritedCodexConfig(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let skipTable = false;

  for (const line of lines) {
    const tableName = getTomlTableName(line);
    if (tableName) {
      skipTable =
        tableName === "mcp_servers" ||
        tableName.startsWith("mcp_servers.") ||
        tableName === "plugins" ||
        tableName.startsWith("plugins.");
      if (!skipTable) out.push(line);
      continue;
    }

    if (skipTable) continue;
    if (/^\s*notify\s*=/.test(line)) continue;
    out.push(line);
  }

  return `${out.join("\n").trim()}\n`;
}

async function cleanCodexConfigIfRequested(plan, start) {
  const codexHome = plan.env?.CODEX_HOME;
  if (!codexHome) return;
  const configPath = join(codexHome, "config.toml");
  const before = await readFile(configPath, "utf8");
  const after = stripInheritedCodexConfig(before);
  await writeFile(configPath, after, "utf8");
  logLap("codex_config.cleaned", start, {
    configPath,
    beforeChars: before.length,
    afterChars: after.length,
    removedChars: before.length - after.length,
  });
}

async function removeInstructionsIfRequested(plan, start) {
  const codexHome = plan.env?.CODEX_HOME;
  if (!codexHome) return;
  const instructionsPath = join(codexHome, "instructions.md");
  try {
    const before = await readFile(instructionsPath, "utf8");
    await unlink(instructionsPath);
    logLap("codex_instructions.removed", start, {
      instructionsPath,
      beforeChars: before.length,
    });
  } catch (error) {
    logLap("codex_instructions.remove_skipped", start, {
      instructionsPath,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runRawPlan(plan, timeoutMs, start) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...(plan.env ?? {}),
    };
    const child = spawn(plan.command, plan.args ?? [], {
      cwd: plan.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderrTail = "";
    let stdoutLineCount = 0;
    let firstStdoutMs;
    let firstJsonEventMs;
    let firstAssistantTextMs;
    let firstToolCallMs;
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.once("spawn", () => {
      logLap("process.spawned", start, { pid: child.pid });
      if (plan.promptInput === "stdin" && plan.prompt) {
        child.stdin.write(plan.prompt);
      }
      child.stdin.end();
      logLap("stdin.closed", start, { promptChars: plan.prompt?.length ?? 0 });
    });

    child.stdout.on("data", (chunk) => {
      if (firstStdoutMs === undefined) {
        firstStdoutMs = nowMs() - start;
        logLap("stdout.first_chunk", start, { bytes: chunk.length });
      }
      stdoutBuffer += chunk.toString("utf8");
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (!line) continue;
        stdoutLineCount += 1;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          logLap("stdout.non_json_line", start, {
            lineNo: stdoutLineCount,
            preview: line.slice(0, 160),
          });
          continue;
        }

        if (firstJsonEventMs === undefined) {
          firstJsonEventMs = nowMs() - start;
          logLap("json.first_event", start, {
            lineNo: stdoutLineCount,
            type: parsed.type,
          });
        }

        const item = parsed.item;
        const itemType = item?.type;
        const toolName = item?.tool ?? item?.name;
        const textPreview =
          typeof item?.text === "string"
            ? item.text.slice(0, 120)
            : typeof parsed.text === "string"
              ? parsed.text.slice(0, 120)
              : undefined;

        if (
          firstAssistantTextMs === undefined &&
          (itemType === "agent_message" || parsed.type === "message") &&
          textPreview
        ) {
          firstAssistantTextMs = nowMs() - start;
          logLap("assistant.first_text", start, {
            lineNo: stdoutLineCount,
            itemType,
            textPreview,
          });
        }

        if (
          firstToolCallMs === undefined &&
          (itemType === "tool_call" ||
            itemType === "command_execution" ||
            itemType === "mcp_tool_call")
        ) {
          firstToolCallMs = nowMs() - start;
          logLap("tool.first_call", start, {
            lineNo: stdoutLineCount,
            itemType,
            status: item?.status,
            toolName,
            commandPreview:
              typeof item?.command === "string"
                ? item.command.slice(0, 160)
                : undefined,
          });
        }

        if (
          parsed.type === "item.started" ||
          parsed.type === "item.completed" ||
          parsed.type === "turn.completed" ||
          parsed.type === "turn.failed" ||
          parsed.type === "error"
        ) {
          logLap("json.event", start, {
            lineNo: stdoutLineCount,
            type: parsed.type,
            itemType,
            status: item?.status,
            toolName,
            textPreview,
          });
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
    });

    child.once("close", (code, signal) => {
      clearTimeout(timer);
      logLap("process.closed", start, {
        code,
        signal,
        killedByTimeout,
        stdoutLineCount,
        firstStdoutMs,
        firstJsonEventMs,
        firstAssistantTextMs,
        firstToolCallMs,
        stderrTail: stderrTail.trim().slice(-1000),
      });
      resolve({ code, signal, killedByTimeout });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const start = nowMs();
  const cwd = await mkdtemp(join(tmpdir(), "aimc-agent-acp-kit-diagnose-"));
  const packageEntryPath = resolve(
    "apps/server/node_modules/@tutti-os/agent-acp-kit/dist/index.js",
  );
  const { createCodexProvider } = await import(
    pathToFileURL(packageEntryPath).href
  );
  const provider = createCodexProvider();
  const skillManifest = args.aimcSkills
    ? loadEnabledSkills(resolve(args.db))
    : [];

  console.log(
    JSON.stringify({
      label: "diagnose.start",
      cwd,
      model: args.model,
      promptChars: args.prompt.length,
      skillCount: skillManifest.length,
      skills: summarizeSkills(skillManifest),
      packageEntry: fileURLToPath(pathToFileURL(packageEntryPath)),
    }),
  );

  try {
    const buildStart = nowMs();
    const plan = await provider.buildLaunchPlan({
      runId: `diagnose-${Date.now()}`,
      provider: "codex",
      runtimeKind: "local-agent",
      runtimeProvider: "codex",
      cwd,
      prompt: args.prompt,
      model: args.model,
      skillManifest,
      timeoutMs: args.timeoutMs,
    });
    logLap("buildLaunchPlan.done", start, {
      buildLaunchPlanMs: nowMs() - buildStart,
      plan: summarizePlan(plan),
    });

    if (args.cleanCodexConfig) {
      await cleanCodexConfigIfRequested(plan, start);
    }
    if (args.removeInstructions) {
      await removeInstructionsIfRequested(plan, start);
    }

    await runRawPlan(plan, args.timeoutMs, start);
  } finally {
    if (args.cleanup) {
      await rm(cwd, { recursive: true, force: true });
      logLap("cleanup.done", start);
    } else {
      logLap("cleanup.skipped", start, { cwd });
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      label: "diagnose.error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exitCode = 1;
});
