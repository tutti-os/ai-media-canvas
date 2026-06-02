import type { FastifyInstance } from "fastify";

import { getAvailableVideoModels } from "../generation/providers/registry.js";

export async function registerVideoModelRoutes(app: FastifyInstance) {
  app.get("/api/video-models", async (_request, reply) => {
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
