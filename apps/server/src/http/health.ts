import type { FastifyInstance } from "fastify";

import { healthResponseSchema } from "@aimc/shared";

import type { ServerEnv } from "../config/env.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  env: ServerEnv,
) {
  app.get("/api/health", async (_request, reply) => {
    const payload = healthResponseSchema.parse({
      ok: true,
      service: "ai-media-canvas-server",
      version: env.version,
    });

    return reply.code(200).send(payload);
  });
}
