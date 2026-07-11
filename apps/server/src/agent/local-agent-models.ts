import type { AgentRuntimeProvider, ModelInfo } from "@aimc/shared";
import {
  type AgentDetection,
  type DetectContext,
  type LocalAgentRuntime,
  createDefaultLocalAgentRuntime,
} from "@tutti-os/agent-acp-kit";

type LocalAgentRuntimeDetect = LocalAgentRuntime<
  "local-agent",
  AgentRuntimeProvider
>["detect"];

export type LocalAgentModelDetectContext = DetectContext & {
  refresh?: boolean;
};

export type LocalAgentModelDiscovery = {
  detect: (
    context?: LocalAgentModelDetectContext,
  ) => ReturnType<LocalAgentRuntimeDetect>;
};

export function createDefaultLocalAgentModelDiscovery(): LocalAgentModelDiscovery {
  const runtime = createDefaultLocalAgentRuntime() as LocalAgentRuntime<
    "local-agent",
    AgentRuntimeProvider
  >;

  return {
    detect(context) {
      return runtime.detect(context);
    },
  };
}

export function localAgentModelId(provider: string, modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(`${provider}:`)
    ? trimmed
    : `${provider}:${trimmed}`;
}

export function buildLocalAgentModels(
  detections: Awaited<ReturnType<LocalAgentModelDiscovery["detect"]>>,
): ModelInfo[] {
  const models: ModelInfo[] = [];
  const seen = new Set<string>();

  for (const detection of detections) {
    const result = detection.result as AgentDetection | null;
    if (!result || result.supported === false) continue;

    for (const model of result.models ?? []) {
      const id = localAgentModelId(String(detection.provider), model.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        name: model.label || model.id,
        ...(model.description ? { description: model.description } : {}),
        provider: String(detection.provider),
        source: "local-agent",
      });
    }
  }

  return models;
}

export async function resolveCodexImagegenAgentModel(
  configuredModel: string | undefined,
  localAgentModelDiscovery?: Partial<LocalAgentModelDiscovery>,
) {
  const normalizedConfiguredModel = configuredModel?.trim();
  if (normalizedConfiguredModel) {
    return normalizedConfiguredModel.startsWith("codex:")
      ? normalizedConfiguredModel.slice("codex:".length)
      : normalizedConfiguredModel;
  }

  const discovery =
    localAgentModelDiscovery ?? createDefaultLocalAgentModelDiscovery();
  const detectedModels = buildLocalAgentModels(
    (await discovery.detect?.()) ?? [],
  );
  const codexModel = detectedModels.find(
    (model) => model.provider === "codex" && model.id !== "codex:default",
  );
  return codexModel?.id.startsWith("codex:")
    ? codexModel.id.slice("codex:".length)
    : codexModel?.id;
}

export async function resolveLocalAgentDefaultModel(
  modelId: string,
  _localAgentModelDiscovery?: Partial<LocalAgentModelDiscovery>,
) {
  return modelId;
}
