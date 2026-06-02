import type { FastifyInstance } from "fastify";

import { modelListResponseSchema, type ModelInfo } from "@aimc/shared";

import type { ServerEnv } from "../config/env.js";
import {
  LOCAL_WORKSPACE_ID,
  type SettingsService,
} from "../features/settings/settings-service.js";

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

const AGNES_MODELS: ModelInfo[] = [
  { id: "agnes:agnes-2.0-flash", name: "Agnes 2.0 Flash", provider: "agnes" },
];

export async function registerModelRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  settingsService?: SettingsService,
) {
  app.get("/api/models", async (_request, reply) => {
    const effectiveEnv = settingsService
      ? await settingsService.getEffectiveServerEnv(LOCAL_WORKSPACE_ID)
      : env;
    const models: ModelInfo[] = [];
    if (effectiveEnv.openAIApiKey) models.push(...OPENAI_MODELS);
    if (effectiveEnv.agnesApiKey) models.push(...AGNES_MODELS);
    if (
      effectiveEnv.googleApiKey ||
      (effectiveEnv.googleVertexProject && effectiveEnv.googleVertexLocation)
    ) {
      models.push(...GOOGLE_MODELS);
    }
    return reply.code(200).send(modelListResponseSchema.parse({ models }));
  });
}
