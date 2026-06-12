import type { AgentRuntimeProvider } from "@aimc/shared";
import type { LocalAgentRuntime } from "@nextop-os/agent-acp-kit";

export type LocalAgentModelDiscovery = Pick<
  LocalAgentRuntime<"local-agent", AgentRuntimeProvider>,
  "detect"
>;

export async function resolveLocalAgentDefaultModel(
  modelId: string,
  _localAgentModelDiscovery?: Partial<LocalAgentModelDiscovery>,
) {
  return modelId;
}
