import type { FastifyInstance } from "fastify";

import { modelListResponseSchema, type ModelInfo } from "@aimc/shared";

import type { ServerEnv } from "../config/env.js";

const OPENAI_MODELS: ModelInfo[] = [
  { id: "openai:gpt-4.1", name: "OpenAI GPT-4.1", provider: "openai" },
  { id: "openai:gpt-4o", name: "OpenAI GPT-4o", provider: "openai" },
  { id: "openai:gpt-4o-mini", name: "OpenAI GPT-4o Mini", provider: "openai" },
];

const GOOGLE_MODELS: ModelInfo[] = [
  { id: "google:gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  { id: "google:gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "google:gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google" },
];

export async function registerModelRoutes(
  app: FastifyInstance,
  env: ServerEnv,
) {
  app.get("/api/models", async (_request, reply) => {
    const models: ModelInfo[] = [];
    if (env.openAIApiKey) models.push(...OPENAI_MODELS);
    if (env.googleApiKey || env.googleVertexProject) models.push(...GOOGLE_MODELS);
    return reply.code(200).send(modelListResponseSchema.parse({ models }));
  });
}
