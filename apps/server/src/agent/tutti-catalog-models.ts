import type { ModelInfo } from "@aimc/shared";

import { localAgentModelId } from "./local-agent-models.js";
import type { TuttiAgentProviderCatalogEntry } from "./tutti/index.js";

export function buildLocalAgentModelsFromCatalog(
  providers: readonly TuttiAgentProviderCatalogEntry[],
): ModelInfo[] {
  const models: ModelInfo[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    if (!provider.available) continue;
    for (const model of provider.models) {
      const id = localAgentModelId(provider.provider, model.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        name: model.label || model.id,
        provider: provider.provider,
        source: "local-agent",
        ...(model.description ? { description: model.description } : {}),
      });
    }
  }

  return models;
}
