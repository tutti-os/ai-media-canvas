import type { FastifyInstance } from "fastify";

import { getAvailableImageModels } from "../generation/providers/registry.js";

export async function registerImageModelRoutes(app: FastifyInstance) {
  app.get("/api/image-models", async (_request, reply) => {
    const models = getAvailableImageModels().map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      iconUrl: model.iconUrl,
      provider: model.provider,
      accessible: true,
    }));

    return reply.code(200).send({ models });
  });
}
