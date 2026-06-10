import type {
  AgentModelSource,
  NextopManagedConnection,
  NextopManagedGrantRequest,
  NextopManagedModel,
  NextopManagedProviderId,
} from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import type { LocalStore } from "../../local/store.js";

const PROVIDER_CREDENTIAL_TTL_MS = 5 * 60 * 60 * 1000;
const PROVIDER_CREDENTIAL_REFRESH_WINDOW_MS = 10 * 60 * 1000;

export type NextopManagedProviderCredential = {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  models?: NextopManagedModel[];
};

export type NextopManagedExchangeResult = {
  expiresAt?: string;
  providers: NextopManagedProviderCredential[];
  models?: NextopManagedModel[];
};

export type NextopManagedExchangeClient = (input: {
  env: ServerEnv;
  grantCode?: string;
  grantRef: string;
}) => Promise<NextopManagedExchangeResult>;

export type NextopManagedRevokeClient = (input: {
  env: ServerEnv;
  grantRef: string;
}) => Promise<void>;

type CachedCredential = {
  expiresAtMs: number;
  providers: NextopManagedProviderCredential[];
};

type StoreAccess = Pick<
  LocalStore,
  | "clearNextopManagedConnection"
  | "getNextopManagedConnection"
  | "updateNextopManagedConnection"
>;

export type NextopManagedCredentialService = ReturnType<
  typeof createNextopManagedCredentialService
>;

export function createNextopManagedCredentialService(options: {
  env: ServerEnv;
  exchangeClient?: NextopManagedExchangeClient;
  revokeClient?: NextopManagedRevokeClient;
  store: StoreAccess;
  now?: () => number;
}) {
  const cache = new Map<string, CachedCredential>();
  const now = options.now ?? (() => Date.now());
  const exchangeClient =
    options.exchangeClient ?? createDefaultNextopManagedExchangeClient();
  const revokeClient =
    options.revokeClient ?? createDefaultNextopManagedRevokeClient();

  function getConnection() {
    return options.store.getNextopManagedConnection();
  }

  async function clearConnection() {
    const connection = getConnection();
    if (connection.grantRef) {
      cache.delete(connection.grantRef);
      await revokeClient({
        env: options.env,
        grantRef: connection.grantRef,
      }).catch(() => undefined);
    }
    options.store.clearNextopManagedConnection();
    return options.store.getNextopManagedConnection();
  }

  async function connect(input: NextopManagedGrantRequest) {
    const exchange = await exchangeClient({
      env: options.env,
      grantCode: input.grantCode,
      grantRef: input.grantRef,
    });
    const expiresAt = normalizeCredentialExpiry(exchange.expiresAt, now());
    cache.set(input.grantRef, {
      expiresAtMs: Date.parse(expiresAt),
      providers: normalizeCredentials(exchange.providers),
    });

    const models = normalizeModels(
      exchange.models?.length
        ? exchange.models
        : input.models?.length
          ? input.models
          : exchange.providers.flatMap((provider) => provider.models ?? []),
    );
    const providers = normalizeProviderIds(
      input.providers?.length
        ? input.providers
        : exchange.providers.map((provider) => provider.provider),
    );

    return options.store.updateNextopManagedConnection({
      connected: true,
      grantRef: input.grantRef,
      expiresAt,
      providers,
      models,
    });
  }

  function listModels() {
    const connection = getConnection();
    if (!connection.connected) return [];
    return connection.models.map((model) => ({
      ...model,
      source: "nextop-managed" as const,
    }));
  }

  function isManagedModel(
    modelId: string | null | undefined,
    source?: AgentModelSource,
  ) {
    if (!modelId) return false;
    if (source === "api-provider" || source === "local-agent") return false;
    const connection = getConnection();
    return (
      connection.connected &&
      connection.models.some((model) => model.id === modelId)
    );
  }

  async function resolveEnvForModel(
    baseEnv: ServerEnv,
    modelId: string,
    source?: AgentModelSource,
  ) {
    if (!isManagedModel(modelId, source)) return baseEnv;
    const connection = getConnection();
    if (!connection.connected || !connection.grantRef) return baseEnv;
    const credentials = await getFreshCredential(connection);
    const provider = providerFromModelId(modelId);
    const credential = credentials.providers.find(
      (candidate) => candidate.provider === provider,
    );
    if (!credential) {
      throw new Error(
        `Nextop Managed credential is unavailable for provider: ${provider}`,
      );
    }
    return applyProviderCredential(baseEnv, credential, modelId);
  }

  async function getFreshCredential(connection: NextopManagedConnection) {
    if (!connection.grantRef) {
      throw new Error("Nextop Managed connection is missing grantRef.");
    }
    const cached = cache.get(connection.grantRef);
    if (
      cached &&
      cached.expiresAtMs - now() > PROVIDER_CREDENTIAL_REFRESH_WINDOW_MS
    ) {
      return cached;
    }

    const exchange = await exchangeClient({
      env: options.env,
      grantRef: connection.grantRef,
    });
    const expiresAt = normalizeCredentialExpiry(exchange.expiresAt, now());
    const refreshed = {
      expiresAtMs: Date.parse(expiresAt),
      providers: normalizeCredentials(exchange.providers),
    };
    cache.set(connection.grantRef, refreshed);
    options.store.updateNextopManagedConnection({
      ...connection,
      expiresAt,
      ...(exchange.models?.length
        ? { models: normalizeModels(exchange.models) }
        : {}),
    });
    return refreshed;
  }

  return {
    clearConnection,
    connect,
    getConnection,
    isManagedModel,
    listModels,
    resolveEnvForModel,
  };
}

function createDefaultNextopManagedExchangeClient(): NextopManagedExchangeClient {
  return async ({ env, grantCode, grantRef }) => {
    const { token, url } = createNextopManagedGrantUrl(env, grantRef);
    url.pathname = `${url.pathname}:exchange`;
    const response = await fetch(url, {
      body: JSON.stringify({
        ...(grantCode ? { grantCode } : {}),
        ...(env.nextopAppInstallationId
          ? { installationId: env.nextopAppInstallationId }
          : {}),
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Nextop Managed exchange failed: ${response.status}`);
    }

    return normalizeExchangePayload(await response.json());
  };
}

function createDefaultNextopManagedRevokeClient(): NextopManagedRevokeClient {
  return async ({ env, grantRef }) => {
    const { token, url } = createNextopManagedGrantUrl(env, grantRef);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Nextop Managed revoke failed: ${response.status}`);
    }
  };
}

function createNextopManagedGrantUrl(env: ServerEnv, grantRef: string) {
  const baseUrl = env.nextopApiBaseUrl;
  const workspaceId = env.nextopWorkspaceId;
  const appId = env.nextopAppId;
  const token = env.nextopAppServerToken;
  if (!baseUrl || !workspaceId || !appId || !token) {
    throw new Error("Nextop Managed runtime environment is not configured.");
  }

  return {
    token,
    url: new URL(
      `/v1/workspaces/${encodeURIComponent(
        workspaceId,
      )}/apps/${encodeURIComponent(
        appId,
      )}/managed-model-grants/${encodeURIComponent(grantRef)}`,
      baseUrl,
    ),
  };
}

function normalizeExchangePayload(payload: unknown): NextopManagedExchangeResult {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  const rawProviders = Array.isArray(result.providers)
    ? result.providers
    : Array.isArray(result.credentials)
      ? result.credentials
      : [];
  const providers = normalizeCredentials(
    rawProviders.map((entry) => {
      const item =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      return {
        provider: String(item.provider ?? ""),
        apiKey: String(item.apiKey ?? item.api_key ?? ""),
        ...(typeof item.baseUrl === "string"
          ? { baseUrl: item.baseUrl }
          : typeof item.base_url === "string"
            ? { baseUrl: item.base_url }
            : {}),
        ...(Array.isArray(item.models)
          ? { models: normalizeModels(item.models as NextopManagedModel[]) }
          : {}),
      };
    }),
  );
  const expiresAt =
    typeof result.expiresAt === "string"
      ? result.expiresAt
      : typeof result.expires_at === "string"
        ? result.expires_at
        : undefined;

  return {
    ...(expiresAt ? { expiresAt } : {}),
    providers,
    models: Array.isArray(result.models)
      ? normalizeModels(result.models as NextopManagedModel[])
      : providers.flatMap((provider) => provider.models ?? []),
  };
}

function normalizeCredentialExpiry(expiresAt: string | undefined, nowMs: number) {
  const maxExpiresAtMs = nowMs + PROVIDER_CREDENTIAL_TTL_MS;
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const expiresAtMs =
    Number.isFinite(parsed) && parsed > nowMs
      ? Math.min(parsed, maxExpiresAtMs)
      : maxExpiresAtMs;
  return new Date(expiresAtMs).toISOString();
}

function normalizeProviderIds(
  providers: readonly string[],
): NextopManagedProviderId[] {
  const supported = new Set(["agnes", "openai", "anthropic"]);
  const seen = new Set<string>();
  const normalized: NextopManagedProviderId[] = [];
  for (const provider of providers) {
    const value = provider === "openai-compatible" ? "openai" : provider.trim();
    if (!supported.has(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value as NextopManagedProviderId);
  }
  return normalized;
}

function normalizeModels(models: readonly NextopManagedModel[]) {
  const seen = new Set<string>();
  const normalized: NextopManagedModel[] = [];
  for (const model of models) {
    const [provider] = normalizeProviderIds([model.provider]);
    if (!provider) continue;
    const rawId = model.id.trim();
    if (!rawId) continue;
    const id = rawId.includes(":") ? rawId : `${provider}:${rawId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name: model.name?.trim() || id.slice(`${provider}:`.length),
      provider,
    });
  }
  return normalized;
}

function normalizeCredentials(
  credentials: readonly NextopManagedProviderCredential[],
) {
  const normalized: NextopManagedProviderCredential[] = [];
  const seen = new Set<string>();
  for (const credential of credentials) {
    const [provider] = normalizeProviderIds([credential.provider]);
    if (!provider || !credential.apiKey.trim() || seen.has(provider)) continue;
    seen.add(provider);
    normalized.push({
      provider,
      apiKey: credential.apiKey.trim(),
      ...(credential.baseUrl?.trim()
        ? { baseUrl: credential.baseUrl.trim() }
        : {}),
      ...(credential.models?.length
        ? { models: normalizeModels(credential.models) }
        : {}),
    });
  }
  return normalized;
}

function providerFromModelId(modelId: string): NextopManagedProviderId {
  const provider = modelId.split(":", 1)[0] ?? "";
  const [normalized] = normalizeProviderIds([provider]);
  if (!normalized) {
    throw new Error(`Unsupported Nextop Managed provider: ${provider}`);
  }
  return normalized;
}

function applyProviderCredential(
  env: ServerEnv,
  credential: NextopManagedProviderCredential,
  modelId: string,
): ServerEnv {
  if (credential.provider === "agnes") {
    return {
      ...env,
      agentModel: modelId,
      agnesApiKey: credential.apiKey,
      ...(credential.baseUrl ? { agnesBaseUrl: credential.baseUrl } : {}),
    };
  }
  if (credential.provider === "anthropic") {
    return {
      ...env,
      agentModel: modelId,
      anthropicApiKey: credential.apiKey,
      ...(credential.baseUrl ? { anthropicBaseUrl: credential.baseUrl } : {}),
    };
  }
  return {
    ...env,
    agentModel: modelId,
    openAIApiKey: credential.apiKey,
    ...(credential.baseUrl ? { openAIApiBase: credential.baseUrl } : {}),
  };
}
