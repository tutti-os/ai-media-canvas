import type { AgentRuntimeProvider } from "@aimc/shared";
import {
  type TuttiAgentSkillContext,
  loadTuttiAgentSkillContext,
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
  provider: AgentRuntimeProvider;
  runId: string;
  signal?: AbortSignal;
}): Promise<TuttiAgentSkillContext> {
  return loadTuttiAgentSkillContext({
    agentSessionId: input.runId,
    cwd: input.cwd,
    provider: input.provider,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
