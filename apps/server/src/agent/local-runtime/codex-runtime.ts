import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { type ChatMessage, type StreamEvent, type ToolArtifact } from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import { sanitizeErrorForClient } from "../../utils/error-sanitizer.js";
import type { WorkspaceSkillEntry } from "../workspace-skills.js";

type CodexToolGatewaySession = {
  revoke: () => void;
  token: string;
};

type StreamCodexRunOptions = {
  attachmentsSummaryPrompt: string;
  conversationId: string;
  gatewayBaseUrl: string;
  gatewaySession: CodexToolGatewaySession;
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>;
  model: string;
  now?: () => string;
  runId: string;
  runtimeEnv: ServerEnv;
  sessionId: string;
  signal?: AbortSignal;
  workspaceSkills: WorkspaceSkillEntry[];
};

type CodexItem = {
  aggregated_output?: string;
  arguments?: Record<string, unknown>;
  command?: string;
  error?: { data?: Record<string, unknown>; message?: string } | null;
  exit_code?: number | null;
  id?: string;
  message?: string;
  result?: {
    content?: Array<{ text?: string; type?: string }>;
    structured_content?: Record<string, unknown> | null;
  } | null;
  status?: string;
  text?: string;
  tool?: string;
  type?: string;
};

const INTERNAL_SKILL_READ_RE = /\/skills\/.+\/SKILL\.md/;

function normalizeToolName(name: string) {
  if (name === "image_generate") return "generate_image";
  if (name === "video_generate") return "generate_video";
  return name;
}

function normalizeCodexModel(model: string) {
  if (model === "codex:gpt-5") return "codex:gpt-5.4";
  if (model === "codex:gpt-5-mini") return "codex:gpt-5.4-mini";
  return model;
}

function extractMessageText(value: ChatMessage["content"]): string {
  return typeof value === "string" ? value : "";
}

async function loadConversationHistory(
  sessionId: string,
  currentPrompt: string,
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>,
) {
  if (!loadSessionMessages) return [] as ChatMessage[];

  const messages = await loadSessionMessages(sessionId);
  if (messages.length === 0) return messages;

  const normalizedCurrent = currentPrompt.trim().replace(/\s+/g, " ");
  const lastMessage = messages.at(-1);
  const shouldDropLastUser =
    lastMessage?.role === "user" &&
    extractMessageText(lastMessage.content).trim().replace(/\s+/g, " ") ===
      normalizedCurrent;

  return shouldDropLastUser ? messages.slice(0, -1) : messages;
}

function buildHistoryTranscript(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `${speaker}:\n${extractMessageText(message.content)}`;
    })
    .join("\n\n");
}

function buildCodexPrompt(options: {
  currentPrompt: string;
  historyTranscript: string;
  workspaceSkills: WorkspaceSkillEntry[];
}) {
  const skillSection =
    options.workspaceSkills.length > 0
      ? `Workspace skills are materialized under ./workspace-skills.\nUse them only when relevant, and read the referenced SKILL.md before following a skill.\n${options.workspaceSkills
          .map((skill) => `- ${skill.name}: ./workspace-skills/${skill.name}/SKILL.md`)
          .join("\n")}\n`
      : "";

  const historySection = options.historyTranscript
    ? `Conversation history:\n${options.historyTranscript}\n\n`
    : "";

  return [
    "You are the local Codex runtime for AI Media Canvas.",
    "Prefer the existing MCP tools instead of faking results.",
    "If the user wants a finished visual asset, call generate_image.",
    "Use inspect_canvas before precise canvas edits, and use manipulate_canvas for deterministic canvas updates.",
    "Do not claim an image or canvas update happened unless the tool actually succeeded.",
    skillSection.trim(),
    historySection.trim(),
    "Current request:",
    options.currentPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function materializeWorkspaceSkills(
  runDir: string,
  workspaceSkills: WorkspaceSkillEntry[],
) {
  if (workspaceSkills.length === 0) return;

  for (const skill of workspaceSkills) {
      const skillDir = join(runDir, "workspace-skills", skill.name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), skill.content, "utf8");
      for (const file of skill.files) {
        const filePath = join(skillDir, file.path);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, "utf8");
      }
    }
}

async function materializeCodexHome(options: {
  gatewayBaseUrl: string;
  gatewayToken: string;
  model: string;
}) {
  const codexHome = await mkdtemp(join(tmpdir(), "aimc-codex-home-"));
  const authPath = join(process.env.HOME ?? "~", ".codex", "auth.json");
  const configPath = join(codexHome, "config.toml");
  const serverRoot = resolve(import.meta.dirname, "../../..");
  const mcpServerPath = resolve(import.meta.dirname, "./aimc-tools-mcp.ts");

  try {
    await copyFile(authPath, join(codexHome, "auth.json"));
  } catch (error) {
    throw new Error(
      `Codex auth is unavailable for local-agent runs: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const configLines = [
    `model = "${options.model.replaceAll('"', '\\"')}"`,
    "",
    "[mcp_servers.aimc]",
    'type = "stdio"',
    'command = "pnpm"',
    `args = ["--dir", "${serverRoot.replaceAll('"', '\\"')}", "exec", "tsx", "${mcpServerPath.replaceAll('"', '\\"')}"]`,
    "",
    "[mcp_servers.aimc.env]",
    `AIMC_TOOL_GATEWAY_URL = "${options.gatewayBaseUrl.replaceAll('"', '\\"')}"`,
    `AIMC_TOOL_TOKEN = "${options.gatewayToken.replaceAll('"', '\\"')}"`,
  ];

  await writeFile(configPath, `${configLines.join("\n")}\n`, "utf8");
  return codexHome;
}

function extractToolPayload(item: CodexItem): Record<string, unknown> | undefined {
  const structured = item.result?.structured_content;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    return structured;
  }

  const firstText = item.result?.content?.find(
    (entry) => entry.type === "text" && typeof entry.text === "string",
  )?.text;
  if (!firstText) return undefined;

  try {
    const parsed = JSON.parse(firstText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {
      raw: firstText,
    };
  }

  return undefined;
}

function createRunFailedEvent(
  runId: string,
  now: () => string,
  error: unknown,
): StreamEvent {
  return {
    type: "run.failed",
    runId,
    error: {
      code: "run_failed",
      message: sanitizeErrorForClient(error),
    },
    timestamp: now(),
  };
}

export async function* streamCodexLocalRun(
  options: StreamCodexRunOptions,
): AsyncGenerator<StreamEvent> {
  const now = options.now ?? (() => new Date().toISOString());
  const normalizedModel = normalizeCodexModel(options.model);
  const modelName = normalizedModel.includes(":")
    ? normalizedModel.slice(normalizedModel.indexOf(":") + 1)
    : options.model;

  const runDir = await mkdtemp(join(tmpdir(), "aimc-codex-run-"));
  const codexHome = await materializeCodexHome({
    gatewayBaseUrl: options.gatewayBaseUrl,
    gatewayToken: options.gatewaySession.token,
    model: modelName,
  });

  await materializeWorkspaceSkills(runDir, options.workspaceSkills);

  const historyMessages = await loadConversationHistory(
    options.sessionId,
    options.attachmentsSummaryPrompt,
    options.loadSessionMessages,
  );
  const prompt = buildCodexPrompt({
    currentPrompt: options.attachmentsSummaryPrompt,
    historyTranscript: buildHistoryTranscript(historyMessages),
    workspaceSkills: options.workspaceSkills,
  });

  const child = spawn(
    "codex",
    [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--disable",
      "plugins",
      "--ignore-rules",
      "--dangerously-bypass-approvals-and-sandbox",
      "--model",
      modelName,
      "-C",
      runDir,
    ],
    {
      cwd: runDir,
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stdin.write(prompt);
  child.stdin.end();

  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdout || !stderr) {
    throw new Error("Codex process did not expose stdio streams.");
  }

  stdout.setEncoding("utf8");
  stderr.setEncoding("utf8");

  let stderrTail = "";
  let buffer = "";
  let done = false;
  let emittedTerminal = false;
  const queue: StreamEvent[] = [
    {
      type: "run.started",
      runId: options.runId,
      sessionId: options.sessionId,
      conversationId: options.conversationId,
      timestamp: now(),
    },
  ];

  const emit = (event: StreamEvent) => {
    if (
      event.type === "run.failed" ||
      event.type === "run.completed" ||
      event.type === "run.canceled"
    ) {
      emittedTerminal = true;
    }
    queue.push(event);
  };

  const handleCodexItem = (item: CodexItem) => {
    if (!item.id) return;

    if (item.type === "command_execution") {
      const command = item.command ?? "";
      if (INTERNAL_SKILL_READ_RE.test(command)) {
        return;
      }

      if (item.status === "in_progress") {
        emit({
          type: "tool.started",
          runId: options.runId,
          toolCallId: item.id,
          toolName: "Bash",
          input: { command },
          timestamp: now(),
        });
        return;
      }

      emit({
        type:
          typeof item.exit_code === "number" && item.exit_code !== 0
            ? "tool.failed"
            : "tool.completed",
        runId: options.runId,
        toolCallId: item.id,
        toolName: "Bash",
        ...(typeof item.aggregated_output === "string"
          ? {
              output: { output: item.aggregated_output },
              outputSummary:
                item.aggregated_output.length > 160
                  ? `${item.aggregated_output.slice(0, 157)}...`
                  : item.aggregated_output,
            }
          : {}),
        ...(typeof item.exit_code === "number" && item.exit_code !== 0
          ? {
              error: {
                code: "tool_failed",
                message: item.aggregated_output || "Command execution failed.",
              },
            }
          : {}),
        timestamp: now(),
      } as StreamEvent);
      return;
    }

    if (item.type !== "mcp_tool_call") {
      return;
    }

    const toolName = normalizeToolName(item.tool ?? "unknown_tool");
    if (item.status === "in_progress") {
      emit({
        type: "tool.started",
        runId: options.runId,
        toolCallId: item.id,
        toolName,
        ...(item.arguments ? { input: item.arguments } : {}),
        timestamp: now(),
      });
      return;
    }

    const payload = extractToolPayload(item);
    if (item.status === "failed" || item.error) {
      const output = payload
        ? typeof payload.output === "object" && payload.output && !Array.isArray(payload.output)
          ? (payload.output as Record<string, unknown>)
          : payload
        : undefined;
      emit({
        type: "tool.failed",
        runId: options.runId,
        toolCallId: item.id,
        toolName,
        ...(output ? { output } : {}),
        ...(typeof payload?.outputSummary === "string"
          ? { outputSummary: payload.outputSummary }
          : {}),
        ...(Array.isArray(payload?.artifacts)
          ? { artifacts: payload.artifacts as ToolArtifact[] }
          : {}),
        error: {
          code: "tool_failed",
          message:
            item.error?.message ??
            (typeof payload?.outputSummary === "string"
              ? payload.outputSummary
              : "Tool execution failed."),
        },
        timestamp: now(),
      });
      return;
    }

    emit({
      type: "tool.completed",
      runId: options.runId,
      toolCallId: item.id,
      toolName,
      ...(payload && typeof payload.output === "object" && payload.output
        ? { output: payload.output as Record<string, unknown> }
        : payload
          ? { output: payload }
          : {}),
      ...(typeof payload?.outputSummary === "string"
        ? { outputSummary: payload.outputSummary }
        : {}),
      ...(Array.isArray(payload?.artifacts)
        ? { artifacts: payload.artifacts as ToolArtifact[] }
        : {}),
      timestamp: now(),
    });

    if (toolName === "manipulate_canvas") {
      emit({
        type: "canvas.sync",
        runId: options.runId,
        timestamp: now(),
      });
    }
  };

  const flushLine = (line: string) => {
    let parsed: { item?: CodexItem; message?: string; type?: string };
    try {
      parsed = JSON.parse(line) as { item?: CodexItem; message?: string; type?: string };
    } catch {
      return;
    }

    if (parsed.type === "item.started" || parsed.type === "item.completed") {
      if (parsed.item) {
        if (
          parsed.item.type === "agent_message" &&
          typeof parsed.item.text === "string" &&
          parsed.item.text.length > 0
        ) {
          emit({
            type: "message.delta",
            runId: options.runId,
            messageId: `message_${options.runId}`,
            delta: parsed.item.text,
            timestamp: now(),
          });
          return;
        }
        if (parsed.type === "item.completed" && parsed.item.type === "error") {
          return;
        }
        handleCodexItem(parsed.item);
      }
      return;
    }

    if (parsed.type === "turn.failed" || parsed.type === "error") {
      emit(
        createRunFailedEvent(
          options.runId,
          now,
          parsed.message ?? "Codex turn failed.",
        ),
      );
    }
  };

  stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) flushLine(line);
      newline = buffer.indexOf("\n");
    }
  });

  stderr.on("data", (chunk: string) => {
    stderrTail = `${stderrTail}${chunk}`.slice(-4000);
  });

  const closePromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveClose) => {
      child.on("close", (code, signal) => {
        done = true;
        if (buffer.trim()) {
          flushLine(buffer.trim());
          buffer = "";
        }
        resolveClose({ code, signal });
      });
    },
  );

  const abortHandler = () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  };
  options.signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    while (!done || queue.length > 0) {
      while (queue.length > 0) {
        yield queue.shift()!;
      }

      if (done) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      if (options.signal?.aborted && !emittedTerminal) {
        emit({
          type: "run.canceled",
          runId: options.runId,
          timestamp: now(),
        });
      }
    }

    const { code, signal } = await closePromise;
    while (queue.length > 0) {
      yield queue.shift()!;
    }

    if (emittedTerminal) {
      return;
    }

    if (options.signal?.aborted || signal === "SIGTERM") {
      yield {
        type: "run.canceled",
        runId: options.runId,
        timestamp: now(),
      };
      return;
    }

    if (code && code !== 0) {
      yield createRunFailedEvent(
        options.runId,
        now,
        stderrTail || `Codex exited with code ${code}.`,
      );
      return;
    }

    yield {
      type: "run.completed",
      runId: options.runId,
      timestamp: now(),
    };
  } finally {
    options.signal?.removeEventListener("abort", abortHandler);
    options.gatewaySession.revoke();
    await Promise.allSettled([
      rm(runDir, { recursive: true, force: true }),
      rm(codexHome, { recursive: true, force: true }),
    ]);
  }
}
