import { execFile } from "node:child_process";

import type { AgentRuntimeProvider } from "@aimc/shared";
import type { SkillMaterializationRecord } from "@tutti-os/agent-acp-kit";

export type TuttiRecommendedSystemPrompt = {
  content: string;
  format?: string;
};

export type TuttiAgentSkillContext = {
  recommendedSystemPrompt?: TuttiRecommendedSystemPrompt;
  skillManifest: SkillMaterializationRecord[];
};

const DEFAULT_TUTTI_SKILL_BUNDLE_TIMEOUT_MS = 10_000;
const DEFAULT_TUTTI_SKILL_BUNDLE_MAX_BUFFER = 1024 * 1024;

export function formatTuttiSkillGuidance(systemPrompt: string | undefined) {
  const trimmed = systemPrompt?.trim();
  return trimmed
    ? `Additional Tutti CLI skill guidance:\n${trimmed}`
    : undefined;
}

export function shouldUseTuttiSkillContext(prompt: string) {
  return prompt.includes("mention://");
}

export function tuttiCliEnv(tuttiCliPath: string) {
  return { TUTTI_CLI: tuttiCliPath };
}

function tuttiWorkspaceCwd(fallback: string) {
  return process.env.TUTTI_WORKSPACE_ROOT?.trim() || fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function loadTuttiAgentSkillContextForRun(input: {
  cwd: string;
  provider: AgentRuntimeProvider;
  runId: string;
  tuttiCliPath?: string;
}): Promise<TuttiAgentSkillContext> {
  if (!input.tuttiCliPath) {
    return { skillManifest: [] };
  }

  try {
    const payload = await runTuttiCliCommand({
      args: createTuttiAgentSkillBundleArgs({
        agentSessionId: input.runId,
        provider: input.provider,
      }),
      command: input.tuttiCliPath,
      cwd: tuttiWorkspaceCwd(input.cwd),
      env: process.env,
      maxBuffer: DEFAULT_TUTTI_SKILL_BUNDLE_MAX_BUFFER,
      timeoutMs: DEFAULT_TUTTI_SKILL_BUNDLE_TIMEOUT_MS,
    });
    const context = parseTuttiAgentSkillBundle(payload);
    if (context.provider && context.provider !== input.provider) {
      throw new Error(
        `Tutti skill bundle provider mismatch: expected ${input.provider}, got ${context.provider}`,
      );
    }
    if (context.agentSessionId && context.agentSessionId !== input.runId) {
      throw new Error(
        `Tutti skill bundle session mismatch: expected ${input.runId}, got ${context.agentSessionId}`,
      );
    }
    return {
      skillManifest: context.skills,
      ...(context.recommendedSystemPrompt
        ? { recommendedSystemPrompt: context.recommendedSystemPrompt }
        : {}),
    };
  } catch (error) {
    console.warn(
      `[aimc] Unable to load Tutti agent skill bundle: ${errorMessage(error)}`,
    );
    return { skillManifest: [] };
  }
}

function createTuttiAgentSkillBundleArgs(input: {
  agentSessionId: string;
  provider: AgentRuntimeProvider;
}) {
  return [
    "agent",
    "tutti-cli-skill-bundle",
    "--provider",
    input.provider,
    "--agent-session-id",
    input.agentSessionId,
    "--json",
  ];
}

async function runTuttiCliCommand(input: {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  maxBuffer: number;
  timeoutMs: number;
}) {
  return await new Promise<string>((resolve, reject) => {
    execFile(
      input.command,
      input.args,
      {
        cwd: input.cwd,
        encoding: "utf8",
        env: input.env,
        maxBuffer: input.maxBuffer,
        timeout: input.timeoutMs,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = (stderr || stdout).trim() || error.message;
          reject(new Error(message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function parseTuttiAgentSkillBundle(value: string): {
  agentSessionId?: string;
  provider?: string;
  recommendedSystemPrompt?: TuttiRecommendedSystemPrompt;
  skills: SkillMaterializationRecord[];
} {
  const payload = parseJsonRecord(value, "Tutti skill bundle response");
  if (!Array.isArray(payload.skills)) {
    throw new Error(
      "Tutti skill bundle response does not contain a skills array",
    );
  }
  const recommendedSystemPrompt = parseRecommendedSystemPrompt(
    payload.recommendedSystemPrompt,
  );
  return {
    ...(typeof payload.provider === "string"
      ? { provider: payload.provider }
      : {}),
    ...(typeof payload.agentSessionId === "string"
      ? { agentSessionId: payload.agentSessionId }
      : {}),
    ...(recommendedSystemPrompt ? { recommendedSystemPrompt } : {}),
    skills: payload.skills.map((item, index) => {
      if (!isSkillMaterializationRecord(item)) {
        throw new Error(
          `Tutti skill bundle contains an invalid skill record at index ${index}`,
        );
      }
      return item;
    }),
  };
}

function parseJsonRecord(
  value: string,
  label: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "{}");
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${label} is not an object`);
  }
  return parsed;
}

function parseRecommendedSystemPrompt(
  value: unknown,
): TuttiRecommendedSystemPrompt | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) {
    throw new Error(
      "Tutti skill bundle recommendedSystemPrompt is not an object",
    );
  }
  if (typeof value.content !== "string") {
    throw new Error(
      "Tutti skill bundle recommendedSystemPrompt.content is not a string",
    );
  }
  return {
    content: value.content,
    ...(typeof value.format === "string" ? { format: value.format } : {}),
  };
}

function isSkillMaterializationRecord(
  value: unknown,
): value is SkillMaterializationRecord {
  if (!isRecord(value)) return false;
  if (typeof value.skillId !== "string" || !value.skillId) return false;
  if (typeof value.slug !== "string" || !value.slug) return false;
  if (
    value.deliveryMode !== "materialized-files" &&
    value.deliveryMode !== "prompt-injection" &&
    value.deliveryMode !== "project-instructions"
  ) {
    return false;
  }
  if (value.content !== undefined && typeof value.content !== "string") {
    return false;
  }
  if (
    value.materializedPath !== undefined &&
    typeof value.materializedPath !== "string"
  ) {
    return false;
  }
  if (value.files !== undefined) {
    return Array.isArray(value.files) && value.files.every(isSkillFile);
  }
  return true;
}

function isSkillFile(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.content === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
