import type { FastifyInstance } from "fastify";

import {
  type AgentRuntimeProvider,
  type InstallableAgentProviderId,
  type ModelInfo,
  type WorkspaceSettings,
  agentProviderInstallResponseSchema,
  applicationErrorResponseSchema,
  installableAgentProviderIdSchema,
  modelListResponseSchema,
} from "@aimc/shared";
import {
  type AgentDetection,
  type LocalAgentRuntime,
  createLocalAgentRuntime,
} from "@nextop-os/agent-acp-kit";

import {
  type AgentProviderInstallResult,
  installAgentProvider,
} from "../agent/local-agent-provider-installer.js";
import {
  createAimcLocalAgentProviderPlugins,
  isAimcLocalAgentProvider,
} from "../agent/local-agent-providers.js";
import type { ServerEnv } from "../config/env.js";
import type { NextopManagedCredentialService } from "../features/nextop-managed/credential-service.js";
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

const AGNES_MODELS: ModelInfo[] = [
  { id: "agnes:agnes-2.0-flash", name: "Agnes 2.0 Flash", provider: "agnes" },
];

type LocalAgentModelDiscovery = Pick<
  LocalAgentRuntime<"local-agent", AgentRuntimeProvider>,
  "detect"
>;
type LocalAgentProviderInstaller = (
  provider: InstallableAgentProviderId,
) => Promise<AgentProviderInstallResult>;
type ModelDiscoveryLogger = {
  warn: (payload: unknown, message: string) => void;
};

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

function createDefaultLocalAgentModelDiscovery(): LocalAgentModelDiscovery {
  return createLocalAgentRuntime({
    providers: createAimcLocalAgentProviderPlugins(),
  });
}

function localAgentModelId(provider: string, modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(`${provider}:`)
    ? trimmed
    : `${provider}:${trimmed}`;
}

function buildLocalAgentModels(
  detections: Awaited<ReturnType<LocalAgentModelDiscovery["detect"]>>,
): ModelInfo[] {
  const models: ModelInfo[] = [];
  const seen = new Set<string>();

  for (const detection of detections) {
    if (!isAimcLocalAgentProvider(String(detection.provider))) continue;

    const result = detection.result as AgentDetection | null;
    if (!result || result.supported === false) continue;

    for (const model of result.models ?? []) {
      const id = localAgentModelId(String(detection.provider), model.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        name: model.label || model.id,
        ...(model.description ? { description: model.description } : {}),
        provider: String(detection.provider),
        source: "local-agent",
      });
    }
  }

  return models;
}

function localAgentProviderInstallMessage(
  result: AgentProviderInstallResult,
): string {
  const providerName = result.provider === "codex" ? "Codex" : "Claude Code";

  if (result.after.availability === "ready") {
    return `${providerName} is installed and ready.`;
  }

  if (result.after.availability === "auth_required") {
    return `${providerName} is installed. Sign in to finish setup.`;
  }

  if (result.status === "failed") {
    return `${providerName} installation failed.`;
  }

  return `${providerName} installation needs attention.`;
}

export async function registerModelRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  settingsService?: SettingsService,
  options?: {
    localAgentModelDiscovery?: LocalAgentModelDiscovery;
    localAgentProviderInstaller?: LocalAgentProviderInstaller;
    nextopManagedCredentials?: NextopManagedCredentialService;
  },
) {
  const localAgentModelDiscovery =
    options?.localAgentModelDiscovery ??
    createDefaultLocalAgentModelDiscovery();
  const localAgentProviderInstaller =
    options?.localAgentProviderInstaller ?? installAgentProvider;

  app.get("/api/models", async (_request, reply) => {
    const models = await listAgentModels({
      env,
      localAgentModelDiscovery,
      logger: app.log,
      ...(options?.nextopManagedCredentials
        ? { nextopManagedCredentials: options.nextopManagedCredentials }
        : {}),
      ...(settingsService ? { settingsService } : {}),
    });
    return reply.code(200).send(modelListResponseSchema.parse({ models }));
  });

  app.post(
    "/api/local-agent/providers/:provider/install",
    async (request, reply) => {
      if (env.trustedLocalAgentMode === false) {
        return reply.code(403).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "application_error",
              message: "Local agent installation is disabled.",
            },
          }),
        );
      }

      const paramsResult = installableAgentProviderIdSchema.safeParse(
        (request.params as { provider?: unknown }).provider,
      );
      if (!paramsResult.success) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "application_error",
              message: "Unsupported local agent provider.",
            },
          }),
        );
      }

      try {
        const result = await localAgentProviderInstaller(paramsResult.data);
        return reply.code(200).send(
          agentProviderInstallResponseSchema.parse({
            provider: result.provider,
            status: result.status,
            availability: result.after.availability,
            reason: result.after.reason,
            message: localAgentProviderInstallMessage(result),
          }),
        );
      } catch (error) {
        app.log.error(
          { err: error },
          "Failed to install local agent provider.",
        );
        return reply.code(500).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "application_error",
              message: "Unable to install local agent provider.",
            },
          }),
        );
      }
    },
  );
}

export async function listAgentModels(options: {
  env: ServerEnv;
  localAgentModelDiscovery?: LocalAgentModelDiscovery;
  logger?: ModelDiscoveryLogger;
  nextopManagedCredentials?: NextopManagedCredentialService;
  settingsService?: SettingsService;
}) {
  const localAgentModelDiscovery =
    options.localAgentModelDiscovery ?? createDefaultLocalAgentModelDiscovery();
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
    try {
      models.push(
        ...buildLocalAgentModels(await localAgentModelDiscovery.detect()),
      );
    } catch (error) {
      options.logger?.warn(
        { err: error },
        "Failed to load local-agent models; omitting local providers.",
      );
    }
  }
  if (options.nextopManagedCredentials) {
    models.push(...(await options.nextopManagedCredentials.listModels()));
  }
  return models;
}
