import type { LocalAgentProviderInfo, ModelInfo } from "@aimc/shared";
import type { TuttiResolvedAgentProviderCatalogEntry } from "@tutti-os/agent-acp-kit/tutti";

import { buildLocalAgentCatalogModel } from "./local-agent-models.js";

export function buildLocalAgentModelsFromCatalog(
  providers: readonly TuttiResolvedAgentProviderCatalogEntry[],
): ModelInfo[] {
  const models: ModelInfo[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    if (!provider.available) continue;
    for (const model of provider.models) {
      const catalogModel = buildLocalAgentCatalogModel(
        provider.provider,
        model,
      );
      if (!catalogModel || seen.has(catalogModel.id)) continue;
      seen.add(catalogModel.id);
      models.push(catalogModel);
    }
  }

  return models;
}

export function buildLocalAgentProviderInfoFromCatalog(
  providers: readonly TuttiResolvedAgentProviderCatalogEntry[],
): LocalAgentProviderInfo[] {
  return providers.map((provider) => ({
    provider: provider.provider,
    displayName: provider.displayName,
    available: provider.available,
    authState: provider.authState,
    ...(provider.reason ? { reason: provider.reason } : {}),
    ...(provider.defaultModelId
      ? { defaultModelId: provider.defaultModelId }
      : {}),
    models: provider.models.flatMap((model) => {
      const catalogModel = buildLocalAgentCatalogModel(
        provider.provider,
        model,
      );
      return catalogModel ? [catalogModel] : [];
    }),
  }));
}
