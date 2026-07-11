import type { AgentRuntimeProvider } from "@aimc/shared";
import type { DetectContext } from "@tutti-os/agent-acp-kit";
import {
  type TuttiAgentSkillContext,
  loadTuttiAgentSkillContext,
  redactTuttiCliChildProcessText,
} from "@tutti-os/agent-acp-kit/tutti";

export function formatTuttiSkillGuidance(systemPrompt: string | undefined) {
  const trimmed = systemPrompt?.trim();
  return trimmed
    ? `Additional Tutti CLI skill guidance:\n${trimmed}`
    : undefined;
}

export function shouldUseTuttiSkillContext(prompt: string) {
  return prompt.includes("mention://");
}

export async function loadTuttiAgentSkillContextForRun(input: {
  cwd: string;
  detectContext?: DetectContext;
  provider: AgentRuntimeProvider;
  runId: string;
  signal?: AbortSignal;
}): Promise<TuttiAgentSkillContext> {
  input.signal?.throwIfAborted();
  try {
    return await loadTuttiAgentSkillContext({
      agentSessionId: input.runId,
      cwd: process.env.TUTTI_WORKSPACE_ROOT?.trim() || input.cwd,
      ...(input.detectContext ? { detectContext: input.detectContext } : {}),
      provider: input.provider,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw error;
    }
    console.warn(
      `[aimc] Unable to load Tutti agent skill bundle: ${redactTuttiCliChildProcessText(
        errorMessage(error),
        input.detectContext?.redactionSecrets ?? [],
      )}`,
    );
    return { source: "standalone", skillManifest: [], skills: [] };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
