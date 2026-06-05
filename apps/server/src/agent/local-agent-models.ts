import type { AgentRuntimeProvider } from "@aimc/shared";
import type {
  AgentDetection,
  LocalAgentRuntime,
} from "@nextop-os/agent-acp-kit";

export type LocalAgentModelDiscovery = Pick<
  LocalAgentRuntime<"local-agent", AgentRuntimeProvider>,
  "detect"
>;

function getModelProvider(modelId: string) {
  return modelId.includes(":") ? (modelId.split(":", 1)[0] ?? "") : "";
}

function localAgentModelId(provider: string, modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(`${provider}:`)
    ? trimmed
    : `${provider}:${trimmed}`;
}

export async function resolveLocalAgentDefaultModel(
  modelId: string,
  localAgentModelDiscovery?: Partial<LocalAgentModelDiscovery>,
) {
  if (!modelId.endsWith(":default") || !localAgentModelDiscovery?.detect) {
    return modelId;
  }

  const provider = getModelProvider(modelId);
  if (!provider) return modelId;

  try {
    const detections = await localAgentModelDiscovery.detect();
    const detection = detections.find(
      (entry) => String(entry.provider) === provider,
    );
    const result = detection?.result as AgentDetection | null | undefined;
    if (!result || result.supported === false) return modelId;

    const concreteModel = (result.models ?? [])
      .map((model) => localAgentModelId(provider, model.id))
      .find((id) => id && id !== modelId);
    return concreteModel ?? modelId;
  } catch {
    return modelId;
  }
}
