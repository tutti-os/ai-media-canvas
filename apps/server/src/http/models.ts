import type { FastifyInstance, FastifyReply } from "fastify";

import {
  type LocalAgentProviderInfo,
  type ModelInfo,
  type WorkspaceSettings,
  modelListResponseSchema,
} from "@aimc/shared";
import {
  type AgentDiscoveryRuntime,
  detectAgentTargets,
} from "../agent/agent-targets.js";

import {
  type LocalAgentModelDetectContext,
  type LocalAgentModelDiscovery,
  buildLocalAgentModels,
  buildLocalAgentProviderInfo,
  createDefaultLocalAgentModelDiscovery,
} from "../agent/local-agent-models.js";
import {
  type ModelDiscoverySingleFlight,
  createModelDiscoverySingleFlight,
} from "../agent/model-discovery-single-flight.js";
import type { ServerEnv } from "../config/env.js";
import {
  LOCAL_WORKSPACE_ID,
  type SettingsService,
} from "../features/settings/settings-service.js";
import type { TuttiManagedCredentialService } from "../features/tutti-managed/credential-service.js";

const OPENAI_MODELS: ModelInfo[] = [
  { id: "openai:gpt-5.5", name: "OpenAI GPT-5.5", provider: "openai" },
  {
    id: "openai:gpt-5.4",
    name: "OpenAI GPT-5.4",
    provider: "openai",
  },
  {
    id: "openai:gpt-5.4-mini",
    name: "OpenAI GPT-5.4 Mini",
    provider: "openai",
  },
  {
    id: "openai:gpt-5.4-nano",
    name: "OpenAI GPT-5.4 Nano",
    provider: "openai",
  },
];

const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: "anthropic:claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
  },
  {
    id: "anthropic:claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
  },
  {
    id: "anthropic:claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
  },
];

const GOOGLE_MODELS: ModelInfo[] = [
  { id: "google:gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  {
    id: "google:gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
  },
  {
    id: "google:gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
  },
];

function resolveLocalAgentModelDiscovery(options: {
  localAgentDiscoveryRuntime?: AgentDiscoveryRuntime;
  localAgentModelDiscovery?: LocalAgentModelDiscovery;
}): LocalAgentModelDiscovery {
  if (options.localAgentModelDiscovery) return options.localAgentModelDiscovery;
  const discoveryRuntime = options.localAgentDiscoveryRuntime;
  if (discoveryRuntime) {
    return {
      detect: (context?: LocalAgentModelDetectContext) =>
        discoveryRuntime.detect(context),
    };
  }
  return createDefaultLocalAgentModelDiscovery();
}

const AGNES_MODELS: ModelInfo[] = [
  { id: "agnes:agnes-2.0-flash", name: "Agnes 2.0 Flash", provider: "agnes" },
  { id: "agnes:agnes-1.5-flash", name: "Agnes 1.5 Flash", provider: "agnes" },
];

type ModelDiscoveryLogger = {
  warn: (payload: unknown, message: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseRefreshFlag(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(parseRefreshFlag);
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isModelRefreshRequested(input: unknown): boolean {
  return isRecord(input) && parseRefreshFlag(input.refresh);
}

function withModelSource(
  models: ModelInfo[],
  source: NonNullable<ModelInfo["source"]>,
): ModelInfo[] {
  return models.map((model) => ({ ...model, source }));
}

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
      source: "api-provider",
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
    const snapshotBaseId = modelId.replace(
      OPENAI_COMPATIBLE_SNAPSHOT_SUFFIX,
      "",
    );
    if (snapshotBaseId !== modelId && discoveredIds.has(snapshotBaseId)) {
      continue;
    }
    seen.add(modelId);
    models.push({
      id: `openai:${modelId}`,
      name: modelId,
      provider: "openai",
      source: "api-provider",
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

export async function registerModelRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  settingsService?: SettingsService,
  options?: {
    localAgentDiscoveryRuntime?: AgentDiscoveryRuntime;
    localAgentModelDiscovery?: LocalAgentModelDiscovery;
    tuttiManagedCredentials?: TuttiManagedCredentialService;
  },
) {
  const modelDiscoverySingleFlight = createModelDiscoverySingleFlight();
  // One route-scoped runtime owns Tutti-aware or standalone discovery.
  const localAgentModelDiscovery = resolveLocalAgentModelDiscovery({
    ...(options?.localAgentDiscoveryRuntime
      ? { localAgentDiscoveryRuntime: options.localAgentDiscoveryRuntime }
      : {}),
    ...(options?.localAgentModelDiscovery
      ? { localAgentModelDiscovery: options.localAgentModelDiscovery }
      : {}),
  });
  const sendModels = async (
    reply: FastifyReply,
    input: {
      refreshLocalAgentModels?: boolean;
    } = {},
  ) => {
    const result = await listAgentModelCatalog({
      env,
      logger: app.log,
      localAgentModelDiscovery,
      ...(options?.localAgentDiscoveryRuntime
        ? { localAgentDiscoveryRuntime: options.localAgentDiscoveryRuntime }
        : {}),
      ...(input.refreshLocalAgentModels
        ? { refreshLocalAgentModels: true }
        : {}),
      ...(options?.tuttiManagedCredentials
        ? { tuttiManagedCredentials: options.tuttiManagedCredentials }
        : {}),
      ...(settingsService ? { settingsService } : {}),
      modelDiscoverySingleFlight,
    });
    return reply.code(200).send(modelListResponseSchema.parse(result));
  };

  app.get("/api/models", async (request, reply) => {
    return sendModels(reply, {
      refreshLocalAgentModels: isModelRefreshRequested(request.query),
    });
  });

  app.post("/api/models", async (request, reply) => {
    return sendModels(reply, {
      refreshLocalAgentModels:
        isModelRefreshRequested(request.query) ||
        isModelRefreshRequested(request.body),
    });
  });
}

export type ListAgentModelsOptions = {
  env: ServerEnv;
  localAgentDiscoveryRuntime?: AgentDiscoveryRuntime;
  localAgentModelDiscovery?: LocalAgentModelDiscovery;
  logger?: ModelDiscoveryLogger;
  refreshLocalAgentModels?: boolean;
  modelDiscoverySingleFlight?: ModelDiscoverySingleFlight;
  tuttiManagedCredentials?: TuttiManagedCredentialService;
  settingsService?: SettingsService;
};

export async function listAgentModels(options: ListAgentModelsOptions) {
  return (await listAgentModelCatalog(options)).models;
}

export async function listAgentModelCatalog(options: ListAgentModelsOptions) {
  const workspaceSettings = options.settingsService
    ? await options.settingsService.getWorkspaceSettings(
        null,
        LOCAL_WORKSPACE_ID,
      )
    : undefined;
  const effectiveEnv = options.settingsService
    ? await options.settingsService.getEffectiveServerEnv(LOCAL_WORKSPACE_ID)
    : options.env;
  const models: ModelInfo[] = [];
  const localAgentProviders: LocalAgentProviderInfo[] = [];
  let localAgentTargets: Awaited<
    ReturnType<typeof detectAgentTargets>
  >["targets"] = [];
  let defaultAgentTargetId: string | null = null;
  if (effectiveEnv.openAIApiKey) {
    let openAIModels = workspaceSettings?.providerModels.openai.length
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
        options.logger?.warn(
          { err: error },
          "Failed to load OpenAI-compatible models; using fallback list.",
        );
      }
    }

    models.push(...withModelSource(openAIModels, "api-provider"));
  }
  if (effectiveEnv.anthropicApiKey) {
    models.push(
      ...(workspaceSettings?.providerModels.anthropic.length
        ? buildConfiguredModels(
            "anthropic",
            workspaceSettings.providerModels.anthropic,
          )
        : withModelSource(ANTHROPIC_MODELS, "api-provider")),
    );
  }
  if (effectiveEnv.agnesApiKey) {
    models.push(
      ...(workspaceSettings?.providerModels.agnes.length
        ? buildConfiguredModels("agnes", workspaceSettings.providerModels.agnes)
        : withModelSource(AGNES_MODELS, "api-provider")),
    );
  }
  if (
    effectiveEnv.googleApiKey ||
    (effectiveEnv.googleVertexProject && effectiveEnv.googleVertexLocation)
  ) {
    models.push(
      ...(workspaceSettings?.providerModels.google.length
        ? buildConfiguredModels(
            "google",
            workspaceSettings.providerModels.google,
          )
        : withModelSource(GOOGLE_MODELS, "api-provider")),
    );
  }
  if (
    effectiveEnv.googleVertexProject &&
    effectiveEnv.googleVertexLocation &&
    workspaceSettings?.providerModels.vertex.length
  ) {
    models.push(
      ...buildConfiguredModels(
        "vertex",
        workspaceSettings.providerModels.vertex,
      ),
    );
  }
  if (effectiveEnv.trustedLocalAgentMode !== false) {
    const localAgentDetectContext: LocalAgentModelDetectContext | undefined =
      options.refreshLocalAgentModels ? { refresh: true } : undefined;
    const discoveryCwd =
      effectiveEnv.agentFilesRoot ?? effectiveEnv.appDataDir ?? process.cwd();
    try {
      const runtime = resolveLocalAgentModelDiscovery(options);
      const detect = () =>
        runtime.detect({
          ...(localAgentDetectContext ?? {}),
          cwd: discoveryCwd,
        });
      const detectionsPromise = options.modelDiscoverySingleFlight
        ? options.modelDiscoverySingleFlight.run(
            {
              workspaceId:
                process.env.TSH_WORKSPACE_ID?.trim() || LOCAL_WORKSPACE_ID,
              refresh: options.refreshLocalAgentModels === true,
            },
            detect,
          )
        : detect();
      const detections = await detectionsPromise;
      const agentTargets = await detectAgentTargets({
        detections,
        ...(options.localAgentDiscoveryRuntime
          ? { runtime: options.localAgentDiscoveryRuntime }
          : {}),
      });
      const supportedDetections = detections.filter(
        (detection) =>
          detection.supported &&
          agentTargets.targets.some(
            (target) =>
              target.agentTargetId === detection.agentTargetId &&
              target.available,
          ),
      );
      models.push(...buildLocalAgentModels(supportedDetections));
      localAgentProviders.push(
        ...buildLocalAgentProviderInfo(supportedDetections),
      );
      localAgentTargets = agentTargets.targets;
      defaultAgentTargetId = agentTargets.defaultAgentTargetId;
    } catch (error) {
      options.logger?.warn(
        { err: error },
        "Failed to load local-agent models; omitting local providers.",
      );
    }
  }
  if (options.tuttiManagedCredentials) {
    models.push(...(await options.tuttiManagedCredentials.listModels()));
  }
  return {
    models,
    localAgentProviders,
    localAgentTargets,
    defaultAgentTargetId,
  };
}
