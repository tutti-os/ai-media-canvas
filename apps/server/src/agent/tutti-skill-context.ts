import {
  type DetectContext,
  createDefaultLocalAgentRuntime,
} from "@tutti-os/agent-acp-kit";
import {
  type TuttiAgentSkillContext,
  loadTuttiAgentCatalog,
  loadTuttiAgentSkillContext,
  redactTuttiCliChildProcessText,
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
  detectContext?: DetectContext;
  runId: string;
  signal?: AbortSignal;
}): Promise<TuttiAgentSkillContext> {
  input.signal?.throwIfAborted();
  try {
    return await loadTuttiAgentSkillContext({
      agentTargetId: input.agentTargetId,
      agentSessionId: input.runId,
      cwd: process.env.TUTTI_WORKSPACE_ROOT?.trim() || input.cwd,
      ...(input.detectContext ? { detectContext: input.detectContext } : {}),
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
  detectContext?: DetectContext;
  runId: string;
  signal?: AbortSignal;
}): Promise<{
  agentTargetId: string | null;
  context: TuttiAgentSkillContext;
}> {
  input.signal?.throwIfAborted();
  try {
    const catalog = await loadTuttiAgentCatalog({
      runtime: localAgentRuntime,
      ...(input.detectContext ? { detectContext: input.detectContext } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const availableAgents = catalog.agents.filter(
      (agent) =>
        agent.runtimeSupported && agent.availability.status === "available",
    );
    const selected =
      availableAgents.find(
        (agent) => agent.agentTargetId === catalog.defaultAgentTargetId,
      ) ?? availableAgents[0];
    if (!selected) {
      return { agentTargetId: null, context: emptyTuttiSkillContext() };
    }
    return {
      agentTargetId: selected.agentTargetId,
      context: await loadTuttiAgentSkillContextForRun({
        ...input,
        agentTargetId: selected.agentTargetId,
      }),
    };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    warnTuttiSkillContextFailure(error, input.detectContext);
    return { agentTargetId: null, context: emptyTuttiSkillContext() };
  }
}

function emptyTuttiSkillContext(): TuttiAgentSkillContext {
  return { source: "standalone", skillManifest: [], skills: [] };
}

function warnTuttiSkillContextFailure(
  error: unknown,
  detectContext?: DetectContext,
) {
  console.warn(
    `[aimc] Unable to load Tutti agent skill bundle: ${redactTuttiCliChildProcessText(
      errorMessage(error),
      detectContext?.redactionSecrets ?? [],
    )}`,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
