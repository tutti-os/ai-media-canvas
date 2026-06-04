import type { LocalAgentProviderPlugin } from "../../core/provider-plugin.js";
import type { AgentEvent } from "../../core/events.js";
import type { RawAgentStream } from "../../core/transport.js";
import { materializeSkills } from "../../skills/materialize.js";
import { cleanupPaths } from "../../skills/cleanup.js";
import { composePromptWithSkills } from "../../skills/prompt-injection.js";
import { runJsonlTransport } from "../../transports/jsonl/jsonl-transport.js";
import { detectClaude } from "./detect.js";
import { buildClaudeLaunchPlan } from "./launch-plan.js";
import { parseClaudeStreamEvent } from "./parser.js";

async function* parseClaudeRawEvents(stream: RawAgentStream): AsyncGenerator<AgentEvent> {
  for await (const item of stream) {
    if (item && typeof item === "object" && "type" in item) {
      const candidate = item as AgentEvent;
      if (
        candidate.type === "done" ||
        candidate.type === "error" ||
        candidate.type === "status" ||
        candidate.type === "text_delta" ||
        candidate.type === "thinking_delta" ||
        candidate.type === "tool_call" ||
        candidate.type === "tool_result"
      ) {
        yield candidate;
        continue;
      }
    }
    yield* parseClaudeStreamEvent(item as Record<string, unknown>);
  }
}

export function createClaudeProvider(): LocalAgentProviderPlugin<
  "local-agent",
  "claude"
> {
  const cleanupByRunId = new Map<string, string[]>();

  async function prepareLaunchPlan(
    params: Parameters<LocalAgentProviderPlugin<"local-agent", "claude">["buildLaunchPlan"]>[0],
  ) {
    const materialized = await materializeSkills(
      params.cwd,
      params.skillManifest ?? [],
    );
    const prompt = composePromptWithSkills({
      prompt: params.prompt,
      ...(params.history ? { history: params.history } : {}),
      skills: materialized,
    });
    const cleanupTargets = materialized
      .map((skill) => skill.materializedPath)
      .filter((path): path is string => Boolean(path));
    if (cleanupTargets.length > 0) {
      cleanupByRunId.set(params.runId, cleanupTargets);
    }
    return buildClaudeLaunchPlan({
      ...params,
      prompt,
    });
  }

  async function cleanupRun(runId: string) {
    const cleanupTargets = cleanupByRunId.get(runId) ?? [];
    cleanupByRunId.delete(runId);
    await cleanupPaths(cleanupTargets);
  }

  const plugin: LocalAgentProviderPlugin<"local-agent", "claude"> = {
    id: "claude",
    displayName: "Claude Code",
    kind: "local-agent",
    async detect() {
      return detectClaude();
    },
    capabilities() {
      return {
        cancel: true,
        nativeResume: false,
        streaming: true,
        toolGateway: false,
        maxConcurrentRuns: 1,
      };
    },
    async buildLaunchPlan(params) {
      return {
        ...buildClaudeLaunchPlan(params),
        ...(params.model ? { model: params.model } : {}),
        runId: params.runId,
        transport: "jsonl",
      };
    },
    createAdapter() {
      let adapterRunId: string | undefined;
      return {
        buildLaunchPlan: async (params) => {
          adapterRunId = params.runId;
          return {
            ...(await prepareLaunchPlan(params)),
            ...(params.model ? { model: params.model } : {}),
            runId: params.runId,
            transport: "jsonl",
          };
        },
        capabilities: () => plugin.capabilities(),
        parseEvents: async function* (stream) {
          try {
            yield* parseClaudeRawEvents(stream);
          } finally {
            if (adapterRunId) {
              await cleanupRun(adapterRunId);
            }
          }
        },
      };
    },
    async *run(params) {
      const plan = {
        ...(await prepareLaunchPlan(params)),
        ...(params.model ? { model: params.model } : {}),
        runId: params.runId,
        transport: "jsonl" as const,
      };
      try {
        yield* runJsonlTransport(plan, parseClaudeStreamEvent, params.signal);
      } finally {
        await cleanupRun(params.runId);
      }
    },
  };

  return plugin;
}

export const claudeProvider = createClaudeProvider();
