import type { FastifyInstance } from "fastify";

import {
  modelListResponseSchema,
  type AgentRuntimeProvider,
  type ModelInfo,
  type WorkspaceSettings,
} from "@aimc/shared";
import {
  type AgentDetection,
  type LocalAgentRuntime,
  createDefaultLocalAgentProviderPlugins,
  createLocalAgentRuntime,
} from "@nextop-os/agent-acp-kit";

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

const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: "anthropic:claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
  },
  {
    id: "anthropic:claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
  },
  {
    id: "anthropic:claude-opus-4-1",
    name: "Claude Opus 4.1",
    provider: "anthropic",
  },
];

const GOOGLE_MODELS: ModelInfo[] = [
  { id: "google:gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  { id: "google:gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "google:gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google" },
];

const AGNES_MODELS: ModelInfo[] = [
  { id: "agnes:agnes-2.0-flash", name: "Agnes 2.0 Flash", provider: "agnes" },
];

type LocalAgentModelDiscovery = Pick<
  LocalAgentRuntime<"local-agent", AgentRuntimeProvider>,
  "detect"
>;

function buildConfiguredModels(
  provider: keyof WorkspaceSettings["providerModels"],
  values: string[],
): ModelInfo[] {
  return values.map((value) => {
    const normalizedId = value.includes(":") ? value : `${provider}:${value}`;
    const name = normalizedId.replace(`${provider}:`, "");

    return {
      id: normalizedId,
      name,
      provider,
    };
  });
}

const OPENAI_COMPATIBLE_EXCLUDED_MODEL_PATTERNS = [
  /(^|[-_])audio($|[-_])/i,
  /(^|[-_])realtime($|[-_])/i,
  /(^|[-_])image($|[-_])/i,
  /(^|[-_])embedding(s)?($|[-_])/i,
  /(^|[-_])moderation($|[-_])/i,
  /(^|[-_])transcribe(r|rs|d)?($|[-_])/i,
  /(^|[-_])transcription(s)?($|[-_])/i,
  /(^|[-_])tts($|[-_])/i,
  /(^|[-_])speech($|[-_])/i,
] as const;

const OPENAI_COMPATIBLE_SNAPSHOT_SUFFIX = /-\d{4}-\d{2}-\d{2}$/;

function buildOpenAICompatibleModelsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (!pathname || pathname === "/") {
    url.pathname = "/v1/models";
    return url.toString();
  }

  if (!pathname.endsWith("/models")) {
    url.pathname = `${pathname}/models`;
  }

  return url.toString();
}

function normalizeOpenAICompatibleModels(payload: unknown): ModelInfo[] {
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] } | null)?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { models?: unknown[] } | null)?.models)
        ? (payload as { models: unknown[] }).models
        : [];

  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  const discoveredIds = new Set<string>();

  for (const entry of rawModels) {
    const rawId =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : null;
    if (!rawId) continue;
    const modelId = rawId.startsWith("openai:")
      ? rawId.slice("openai:".length)
      : rawId;
    if (!modelId || seen.has(modelId)) continue;
    discoveredIds.add(modelId);
  }

  for (const entry of rawModels) {
    const rawId =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : null;
    if (!rawId) continue;
    const modelId = rawId.startsWith("openai:")
      ? rawId.slice("openai:".length)
      : rawId;
    if (!modelId || seen.has(modelId)) continue;
    if (
      OPENAI_COMPATIBLE_EXCLUDED_MODEL_PATTERNS.some((pattern) =>
        pattern.test(modelId),
      )
    ) {
      continue;
    }
    const snapshotBaseId = modelId.replace(OPENAI_COMPATIBLE_SNAPSHOT_SUFFIX, "");
    if (snapshotBaseId !== modelId && discoveredIds.has(snapshotBaseId)) {
      continue;
    }
    seen.add(modelId);
    models.push({
      id: `openai:${modelId}`,
      name: modelId,
      provider: "openai",
    });
  }

  return models;
}

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelInfo[]> {
  const response = await fetch(buildOpenAICompatibleModelsUrl(baseUrl), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible model list failed: ${response.status}`);
  }

  return normalizeOpenAICompatibleModels(await response.json());
}

function createDefaultLocalAgentModelDiscovery(): LocalAgentModelDiscovery {
  return createLocalAgentRuntime({
    providers: createDefaultLocalAgentProviderPlugins(),
  });
}

function localAgentModelId(provider: string, modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(`${provider}:`) ? trimmed : `${provider}:${trimmed}`;
}

function buildLocalAgentModels(
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
        provider: String(detection.provider),
      });
    }
  }

  return models;
}

export async function registerModelRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  settingsService?: SettingsService,
  options?: {
    localAgentModelDiscovery?: LocalAgentModelDiscovery;
  },
) {
  const localAgentModelDiscovery =
    options?.localAgentModelDiscovery ?? createDefaultLocalAgentModelDiscovery();

  app.get("/api/models", async (_request, reply) => {
    const workspaceSettings = settingsService
      ? await settingsService.getWorkspaceSettings(null, LOCAL_WORKSPACE_ID)
      : undefined;
    const effectiveEnv = settingsService
      ? await settingsService.getEffectiveServerEnv(LOCAL_WORKSPACE_ID)
      : env;
    const models: ModelInfo[] = [];
    if (effectiveEnv.openAIApiKey) {
      let openAIModels =
        workspaceSettings?.providerModels.openai.length
          ? buildConfiguredModels("openai", workspaceSettings.providerModels.openai)
          : OPENAI_MODELS;

      if (
        !workspaceSettings?.providerModels.openai.length &&
        effectiveEnv.openAIApiBase
      ) {
        try {
          const dynamicModels = await fetchOpenAICompatibleModels(
            effectiveEnv.openAIApiBase,
            effectiveEnv.openAIApiKey,
          );
          if (dynamicModels.length > 0) {
            openAIModels = dynamicModels;
          }
        } catch (error) {
          app.log.warn(
            { err: error },
            "Failed to load OpenAI-compatible models; using fallback list.",
          );
        }
      }

      models.push(...openAIModels);
    }
    if (effectiveEnv.anthropicApiKey) {
      models.push(
        ...(
          workspaceSettings?.providerModels.anthropic.length
            ? buildConfiguredModels(
                "anthropic",
                workspaceSettings.providerModels.anthropic,
              )
            : ANTHROPIC_MODELS
        ),
      );
    }
    if (effectiveEnv.agnesApiKey) {
      models.push(
        ...(
          workspaceSettings?.providerModels.agnes.length
            ? buildConfiguredModels("agnes", workspaceSettings.providerModels.agnes)
            : AGNES_MODELS
        ),
      );
    }
    if (
      effectiveEnv.googleApiKey ||
      (effectiveEnv.googleVertexProject && effectiveEnv.googleVertexLocation)
    ) {
      models.push(
        ...(
          workspaceSettings?.providerModels.google.length
            ? buildConfiguredModels("google", workspaceSettings.providerModels.google)
            : GOOGLE_MODELS
        ),
      );
    }
    if (
      effectiveEnv.googleVertexProject &&
      effectiveEnv.googleVertexLocation &&
      workspaceSettings?.providerModels.vertex.length
    ) {
      models.push(
        ...buildConfiguredModels("vertex", workspaceSettings.providerModels.vertex),
      );
    }
    if (effectiveEnv.trustedLocalAgentMode !== false) {
      try {
        models.push(
          ...buildLocalAgentModels(await localAgentModelDiscovery.detect()),
        );
      } catch (error) {
        app.log.warn(
          { err: error },
          "Failed to load local-agent models; omitting local providers.",
        );
      }
    }
    return reply.code(200).send(modelListResponseSchema.parse({ models }));
  });
}
