import { createDefaultLocalAgentRuntime } from "@tutti-os/agent-acp-kit";
import {
  type TuttiAgentSkillContext,
  loadTuttiAgentSkillContext,
} from "@tutti-os/agent-acp-kit/tutti";

const localAgentRuntime = createDefaultLocalAgentRuntime();

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
  agentTargetId: string;
  cwd: string;
  runId: string;
  signal?: AbortSignal;
}): Promise<TuttiAgentSkillContext> {
  input.signal?.throwIfAborted();
  try {
    return await loadTuttiAgentSkillContext({
      agentTargetId: input.agentTargetId,
      agentSessionId: input.runId,
      cwd: input.cwd,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw error;
    }
    warnTuttiSkillContextFailure(error);
    return emptyTuttiSkillContext();
  }
}

/**
 * Server-deepagent is not itself a local Agent Target. For mention guidance it
 * discovers the current catalog and scopes the bundle to the available default
 * exact target, rather than pretending to be a fixed provider.
 */
export async function loadDefaultTuttiAgentSkillContextForRun(input: {
  cwd: string;
  runId: string;
  signal?: AbortSignal;
  runtime?: Pick<typeof localAgentRuntime, "detect">;
}): Promise<{
  agentTargetId: string | null;
  context: TuttiAgentSkillContext;
}> {
  input.signal?.throwIfAborted();
  if (!process.env.TUTTI_CLI?.trim() && !input.runtime) {
    return { agentTargetId: null, context: emptyTuttiSkillContext() };
  }
  try {
    const detections = await (input.runtime ?? localAgentRuntime).detect({
      cwd: input.cwd,
    });
    const availableAgents = detections.filter(
      (agent) => agent.supported && Boolean(agent.agentTargetId),
    );
    const selected =
      availableAgents.find((agent) => agent.isDefault) ?? availableAgents[0];
    const selectedAgentTargetId = selected?.agentTargetId;
    if (!selectedAgentTargetId) {
      return { agentTargetId: null, context: emptyTuttiSkillContext() };
    }
    return {
      agentTargetId: selectedAgentTargetId,
      context: await loadTuttiAgentSkillContextForRun({
        agentTargetId: selectedAgentTargetId,
        cwd: input.cwd,
        runId: input.runId,
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    warnTuttiSkillContextFailure(error);
    return { agentTargetId: null, context: emptyTuttiSkillContext() };
  }
}

function emptyTuttiSkillContext(): TuttiAgentSkillContext {
  return { source: "standalone", skillManifest: [], skills: [] };
}

function warnTuttiSkillContextFailure(error: unknown) {
  console.warn(
    `[aimc] Unable to load Tutti agent skill bundle: ${errorMessage(error)}`,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
