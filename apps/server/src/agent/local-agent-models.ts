import type {
  AgentRuntimeProvider,
  LocalAgentProviderInfo,
  ModelInfo,
} from "@aimc/shared";
import {
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

type CreateLocalAgentRuntime = () => LocalAgentRuntime<
  "local-agent",
  AgentRuntimeProvider
>;

export function createDefaultLocalAgentModelDiscovery(
  createRuntime: CreateLocalAgentRuntime = () =>
    createDefaultLocalAgentRuntime() as LocalAgentRuntime<
      "local-agent",
      AgentRuntimeProvider
    >,
): LocalAgentModelDiscovery {
  let runtime = createRuntime();

  return {
    detect(context) {
      if (context?.refresh) {
        runtime = createRuntime();
      }
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

export function buildLocalAgentCatalogModel(
  provider: string,
  model: {
    id: string;
    label?: string | undefined;
    description?: string | undefined;
  },
): ModelInfo | null {
  const id = localAgentModelId(provider, model.id);
  if (!id) return null;

  return {
    id,
    name: model.label || model.id,
    provider,
    source: "local-agent",
    ...(model.description ? { description: model.description } : {}),
  };
}

export function buildLocalAgentModels(
  detections: Awaited<ReturnType<LocalAgentModelDiscovery["detect"]>>,
): ModelInfo[] {
  const models: ModelInfo[] = [];
  const seen = new Set<string>();

  for (const detection of detections) {
    if (!detection.supported) continue;

    for (const model of detection.models) {
      const catalogModel = buildLocalAgentCatalogModel(
        String(detection.provider),
        model,
      );
      if (!catalogModel || seen.has(catalogModel.id)) continue;
      seen.add(catalogModel.id);
      models.push(catalogModel);
    }
  }

  return models;
}

export function buildLocalAgentProviderInfo(
  detections: Awaited<ReturnType<LocalAgentModelDiscovery["detect"]>>,
): LocalAgentProviderInfo[] {
  return detections.map((detection) => {
    const defaultModelId = detection.defaultModelId
      ? localAgentModelId(detection.provider, detection.defaultModelId)
      : null;
    return {
      provider: detection.provider,
      displayName: detection.displayName,
      supported: detection.supported,
      authState: detection.authState,
      ...(detection.reason ? { reason: detection.reason } : {}),
      ...(defaultModelId ? { defaultModelId } : {}),
      models: detection.models.flatMap((model) => {
        const catalogModel = buildLocalAgentCatalogModel(
          detection.provider,
          model,
        );
        return catalogModel ? [catalogModel] : [];
      }),
    };
  });
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
