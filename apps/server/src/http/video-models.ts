import type { FastifyInstance } from "fastify";

import type { ServerEnv } from "../config/env.js";
import {
  LOCAL_WORKSPACE_ID,
  refreshGenerationProviders,
  type SettingsService,
} from "../features/settings/settings-service.js";
import { getAvailableVideoModels } from "../generation/providers/registry.js";

export async function registerVideoModelRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  settingsService?: SettingsService,
) {
  app.get("/api/video-models", async (_request, reply) => {
    const effectiveEnv = settingsService
      ? await settingsService.getEffectiveServerEnv(LOCAL_WORKSPACE_ID)
      : env;
    refreshGenerationProviders(effectiveEnv);
    const models = getAvailableVideoModels().map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      iconUrl: model.iconUrl,
      provider: model.provider,
      accessible: true,
      capabilities: model.capabilities,
      limits: model.limits,
    }));

    return reply.code(200).send({ models });
  });
}
