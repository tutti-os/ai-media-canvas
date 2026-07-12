import { randomBytes } from "node:crypto";

import type {
  AgentModelSource,
  TuttiManagedConnectChallenge,
  TuttiManagedConnection,
  TuttiManagedGrantRequest,
  TuttiManagedModel,
  TuttiManagedProviderId,
} from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import type { LocalStore } from "../../local/store.js";
import { invokeTuttiManagedModelCli } from "./tutti-cli-client.js";

const PROVIDER_CREDENTIAL_TTL_MS = 5 * 60 * 60 * 1000;
const PROVIDER_CREDENTIAL_REFRESH_WINDOW_MS = 10 * 60 * 1000;
const CONNECT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MANAGED_MODEL_ID_PREFIX = "tutti";

export type TuttiManagedProviderCredential = {
  provider: TuttiManagedProviderId;
  apiKey: string;
  baseUrl?: string;
  models?: TuttiManagedModel[];
};

export type TuttiManagedExchangeResult = {
  expiresAt?: string;
  grantRef: string;
  providers: TuttiManagedProviderId[];
  models?: TuttiManagedModel[];
};

export type TuttiManagedModelCatalogResult = {
  expiresAt?: string;
  models: TuttiManagedModel[];
};

export type TuttiManagedProviderCredentialResult = {
  credential: TuttiManagedProviderCredential;
  expiresAt?: string;
  models?: TuttiManagedModel[];
};

export type TuttiManagedExchangeClient = (input: {
  contextToken: string;
  env: ServerEnv;
  grantCode: string;
  nonce: string;
  state: string;
}) => Promise<TuttiManagedExchangeResult>;

export type TuttiManagedModelCatalogClient = (input: {
  env: ServerEnv;
  grantRef: string;
}) => Promise<TuttiManagedModelCatalogResult>;

export type TuttiManagedProviderCredentialClient = (input: {
  capability: string;
  env: ServerEnv;
  grantRef: string;
  model: string;
  provider: TuttiManagedProviderId;
}) => Promise<TuttiManagedProviderCredentialResult>;

export type TuttiManagedRevokeClient = (input: {
  env: ServerEnv;
  grantRef: string;
}) => Promise<void>;

type CachedCredential = {
  credential: TuttiManagedProviderCredential;
  expiresAtMs: number;
};

type StoredChallenge = {
  expiresAtMs: number;
  nonce: string;
};

type StoreAccess = Pick<
  LocalStore,
  | "clearTuttiManagedConnection"
  | "getTuttiManagedConnection"
  | "updateTuttiManagedConnection"
>;

export type TuttiManagedCredentialService = ReturnType<
  typeof createTuttiManagedCredentialService
>;

export function createTuttiManagedCredentialService(options: {
  env: ServerEnv;
  exchangeClient?: TuttiManagedExchangeClient;
  modelCatalogClient?: TuttiManagedModelCatalogClient;
  providerCredentialClient?: TuttiManagedProviderCredentialClient;
  revokeClient?: TuttiManagedRevokeClient;
  store: StoreAccess;
  now?: () => number;
}) {
  const cache = new Map<string, CachedCredential>();
  const challenges = new Map<string, StoredChallenge>();
  const now = options.now ?? (() => Date.now());
  const exchangeClient =
    options.exchangeClient ?? createDefaultTuttiManagedExchangeClient();
  const modelCatalogClient =
    options.modelCatalogClient ?? createDefaultTuttiManagedModelCatalogClient();
  const providerCredentialClient =
    options.providerCredentialClient ??
    createDefaultTuttiManagedProviderCredentialClient();
  const revokeClient =
    options.revokeClient ?? createDefaultTuttiManagedRevokeClient();

  function getConnection() {
    if (!isTuttiManagedRuntimeConfigured(options.env)) {
      return {
        connected: false,
        providers: [],
        models: [],
      };
    }
    return options.store.getTuttiManagedConnection();
  }

  function createConnectChallenge(): TuttiManagedConnectChallenge {
    pruneChallenges();
    const state = randomToken();
    const nonce = randomToken();
    const expiresAtMs = now() + CONNECT_CHALLENGE_TTL_MS;
    challenges.set(state, { expiresAtMs, nonce });
    return {
      expiresAt: new Date(expiresAtMs).toISOString(),
      nonce,
      state,
    };
  }

  async function clearConnection() {
    const connection = options.store.getTuttiManagedConnection();
    if (connection.grantRef && isTuttiManagedRuntimeConfigured(options.env)) {
      clearGrantCache(connection.grantRef);
      await revokeClient({
        env: options.env,
        grantRef: connection.grantRef,
      }).catch(() => undefined);
    }
    options.store.clearTuttiManagedConnection();
    return options.store.getTuttiManagedConnection();
  }

  async function connect(input: TuttiManagedGrantRequest) {
    consumeConnectChallenge(input.state, input.nonce);
    const exchange = await exchangeClient({
      contextToken: input.contextToken,
      env: options.env,
      grantCode: input.grantCode,
      nonce: input.nonce,
      state: input.state,
    });
    const expiresAt = normalizeCredentialExpiry(exchange.expiresAt, now());
    const models = normalizeModels(
      exchange.models?.length ? exchange.models : (input.models ?? []),
    );
    const providers = normalizeProviderIds(
      input.providers?.length ? input.providers : exchange.providers,
    );

    return options.store.updateTuttiManagedConnection({
      connected: true,
      grantRef: exchange.grantRef,
      expiresAt,
      providers,
      models,
    });
  }

  async function listModels() {
    const connection = getConnection();
    if (!connection.connected || !connection.grantRef) return [];
    try {
      const catalog = await modelCatalogClient({
        env: options.env,
        grantRef: connection.grantRef,
      });
      const models = normalizeModels(catalog.models);
      options.store.updateTuttiManagedConnection({
        ...connection,
        expiresAt: catalog.expiresAt
          ? normalizeCredentialExpiry(catalog.expiresAt, now())
          : connection.expiresAt,
        models,
      });
      return models.map((model) => ({
        ...model,
        source: "tutti-managed" as const,
      }));
    } catch {
      return connection.models.map((model) => ({
        ...model,
        source: "tutti-managed" as const,
      }));
    }
  }

  function isManagedModel(
    modelId: string | null | undefined,
    source?: AgentModelSource,
  ) {
    if (!modelId) return false;
    const connection = getConnection();
    const normalizedModelId = normalizeManagedModelId(modelId);
    if (normalizedModelId) {
      return (
        connection.connected &&
        connection.models.some((model) => model.id === normalizedModelId)
      );
    }
    if (source === "api-provider" || source === "local-agent") return false;
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
    const modelRef = parseManagedModelRef(modelId);
    const credential = await getFreshCredential(
      connection,
      modelRef.provider,
      modelRef.model,
      "agent",
    );
    return applyProviderCredential(
      baseEnv,
      credential,
      modelRef.runtimeModelId,
    );
  }

  async function getFreshCredential(
    connection: TuttiManagedConnection,
    provider: TuttiManagedProviderId,
    model: string,
    capability: string,
  ) {
    if (!connection.grantRef) {
      throw new Error("Tutti Managed connection is missing grantRef.");
    }
    const cacheKey = credentialCacheKey({
      capability,
      grantRef: connection.grantRef,
      model,
      provider,
    });
    const cached = cache.get(cacheKey);
    if (
      cached &&
      cached.expiresAtMs - now() > PROVIDER_CREDENTIAL_REFRESH_WINDOW_MS
    ) {
      return cached.credential;
    }

    const result = await providerCredentialClient({
      capability,
      env: options.env,
      grantRef: connection.grantRef,
      model,
      provider,
    });
    const expiresAt = normalizeCredentialExpiry(result.expiresAt, now());
    const credential = normalizeCredential(result.credential);
    cache.set(cacheKey, {
      credential,
      expiresAtMs: Date.parse(expiresAt),
    });
    options.store.updateTuttiManagedConnection({
      ...connection,
      expiresAt,
      ...(result.models?.length
        ? { models: normalizeModels(result.models) }
        : {}),
    });
    return credential;
  }

  return {
    clearConnection,
    connect,
    createConnectChallenge,
    getConnection,
    isManagedModel,
    listModels,
    resolveEnvForModel,
  };

  function clearGrantCache(grantRef: string) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${grantRef}\u0000`)) {
        cache.delete(key);
      }
    }
  }

  function consumeConnectChallenge(state: string, nonce: string) {
    pruneChallenges();
    const challenge = challenges.get(state);
    challenges.delete(state);
    if (
      !challenge ||
      challenge.nonce !== nonce ||
      challenge.expiresAtMs <= now()
    ) {
      throw new Error("Invalid Tutti Managed connect challenge.");
    }
  }

  function pruneChallenges() {
    const current = now();
    for (const [state, challenge] of challenges.entries()) {
      if (challenge.expiresAtMs <= current) {
        challenges.delete(state);
      }
    }
  }
}

function createDefaultTuttiManagedExchangeClient(): TuttiManagedExchangeClient {
  return async ({ contextToken, env, grantCode, nonce, state }) => {
    return normalizeExchangePayload(
      await invokeTuttiManagedModelCli(
        env,
        ["managed-model", "grant", "exchange"],
        { contextToken, grantCode, nonce, state },
      ),
    );
  };
}

function createDefaultTuttiManagedModelCatalogClient(): TuttiManagedModelCatalogClient {
  return async ({ env, grantRef }) => {
    return normalizeModelCatalogPayload(
      await invokeTuttiManagedModelCli(env, ["managed-model", "models"], {
        grantRef,
      }),
    );
  };
}

function createDefaultTuttiManagedProviderCredentialClient(): TuttiManagedProviderCredentialClient {
  return async ({ capability, env, grantRef, model, provider }) => {
    return normalizeCredentialPayload(
      await invokeTuttiManagedModelCli(env, ["managed-model", "credential"], {
        capability,
        grantRef,
        model,
        provider,
      }),
    );
  };
}

function createDefaultTuttiManagedRevokeClient(): TuttiManagedRevokeClient {
  return async ({ env, grantRef }) => {
    await invokeTuttiManagedModelCli(env, ["managed-model", "revoke"], {
      grantRef,
    });
  };
}

function isTuttiManagedRuntimeConfigured(
  env: ServerEnv,
): env is ServerEnv &
  Required<
    Pick<ServerEnv, "tuttiCliPath" | "tuttiAppId" | "tuttiWorkspaceId">
  > {
  return Boolean(env.tuttiCliPath && env.tuttiWorkspaceId && env.tuttiAppId);
}

function normalizeExchangePayload(
  payload: unknown,
): TuttiManagedExchangeResult {
  const result = normalizeResultRecord(payload);
  const grantRef = String(result.grantRef ?? result.grant_ref ?? "").trim();
  if (!grantRef) {
    throw new Error("Tutti Managed exchange response is missing grantRef.");
  }
  const expiresAt = readExpiresAt(result);
  return {
    ...(expiresAt ? { expiresAt } : {}),
    grantRef,
    models: Array.isArray(result.models)
      ? normalizeModels(result.models as TuttiManagedModel[])
      : [],
    providers: normalizeProviderIds(
      Array.isArray(result.providers)
        ? result.providers.map((provider) => String(provider))
        : [],
    ),
  };
}

function normalizeModelCatalogPayload(
  payload: unknown,
): TuttiManagedModelCatalogResult {
  const result = normalizeResultRecord(payload);
  const expiresAt = readExpiresAt(result);
  return {
    ...(expiresAt ? { expiresAt } : {}),
    models: Array.isArray(result.models)
      ? normalizeModels(result.models as TuttiManagedModel[])
      : [],
  };
}

function normalizeCredentialPayload(
  payload: unknown,
): TuttiManagedProviderCredentialResult {
  const result = normalizeResultRecord(payload);
  const rawCredential =
    result.credential && typeof result.credential === "object"
      ? (result.credential as Record<string, unknown>)
      : result;
  const expiresAt = readExpiresAt(result);
  const models = Array.isArray(result.models)
    ? normalizeModels(result.models as TuttiManagedModel[])
    : undefined;
  return {
    credential: normalizeCredential({
      provider: String(rawCredential.provider ?? "") as TuttiManagedProviderId,
      apiKey: String(rawCredential.apiKey ?? rawCredential.api_key ?? ""),
      ...(typeof rawCredential.baseUrl === "string"
        ? { baseUrl: rawCredential.baseUrl }
        : typeof rawCredential.base_url === "string"
          ? { baseUrl: rawCredential.base_url }
          : {}),
      ...(Array.isArray(rawCredential.models)
        ? {
            models: normalizeModels(
              rawCredential.models as TuttiManagedModel[],
            ),
          }
        : {}),
    }),
    ...(expiresAt ? { expiresAt } : {}),
    ...(models ? { models } : {}),
  };
}

function normalizeResultRecord(payload: unknown) {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  return record.result && typeof record.result === "object"
    ? (record.result as Record<string, unknown>)
    : record;
}

function readExpiresAt(record: Record<string, unknown>) {
  return typeof record.expiresAt === "string"
    ? record.expiresAt
    : typeof record.expires_at === "string"
      ? record.expires_at
      : undefined;
}

function normalizeCredentialExpiry(
  expiresAt: string | undefined,
  nowMs: number,
) {
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
): TuttiManagedProviderId[] {
  const supported = new Set(["agnes", "openai", "anthropic"]);
  const seen = new Set<string>();
  const normalized: TuttiManagedProviderId[] = [];
  for (const provider of providers) {
    const value = provider === "openai-compatible" ? "openai" : provider.trim();
    if (!supported.has(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value as TuttiManagedProviderId);
  }
  return normalized;
}

function normalizeModels(models: readonly TuttiManagedModel[]) {
  const seen = new Set<string>();
  const normalized: TuttiManagedModel[] = [];
  for (const model of models) {
    const [provider] = normalizeProviderIds([model.provider]);
    if (!provider) continue;
    const rawId = model.id.trim();
    if (!rawId) continue;
    const modelPart = stripProviderPrefix(provider, stripManagedPrefix(rawId));
    const id = `${MANAGED_MODEL_ID_PREFIX}:${provider}:${modelPart}`;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name: model.name?.trim() || modelPart,
      provider,
    });
  }
  return normalized;
}

function normalizeCredential(
  credential: TuttiManagedProviderCredential,
): TuttiManagedProviderCredential {
  const [provider] = normalizeProviderIds([credential.provider]);
  if (!provider || !credential.apiKey.trim()) {
    throw new Error("Invalid Tutti Managed provider credential.");
  }
  return {
    provider,
    apiKey: credential.apiKey.trim(),
    ...(credential.baseUrl?.trim()
      ? { baseUrl: credential.baseUrl.trim() }
      : {}),
    ...(credential.models?.length
      ? { models: normalizeModels(credential.models) }
      : {}),
  };
}

function parseManagedModelRef(modelId: string) {
  const parts = modelId.split(":");
  if (parts.length < 3 || !isManagedModelPrefix(parts[0] ?? "")) {
    throw new Error(`Invalid Tutti Managed model id: ${modelId}`);
  }
  const [provider] = normalizeProviderIds([parts[1] ?? ""]);
  if (!provider) {
    throw new Error(`Unsupported Tutti Managed provider: ${parts[1] ?? ""}`);
  }
  const model = parts.slice(2).join(":").trim();
  if (!model) {
    throw new Error(`Invalid Tutti Managed model id: ${modelId}`);
  }
  return {
    model,
    provider,
    runtimeModelId: `${provider}:${model}`,
  };
}

export function isManagedModelId(modelId: string | null | undefined) {
  const prefix = modelId?.split(":", 1)[0] ?? "";
  return isManagedModelPrefix(prefix);
}

function normalizeManagedModelId(modelId: string) {
  if (!isManagedModelId(modelId)) return null;
  const modelRef = parseManagedModelRef(modelId);
  return `${MANAGED_MODEL_ID_PREFIX}:${modelRef.provider}:${modelRef.model}`;
}

function isManagedModelPrefix(prefix: string) {
  return prefix === MANAGED_MODEL_ID_PREFIX;
}

function stripManagedPrefix(value: string) {
  const prefix = value.split(":", 1)[0] ?? "";
  return isManagedModelPrefix(prefix)
    ? value.slice(`${prefix}:`.length)
    : value;
}

function stripProviderPrefix(provider: string, value: string) {
  const prefix = `${provider}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function applyProviderCredential(
  env: ServerEnv,
  credential: TuttiManagedProviderCredential,
  runtimeModelId: string,
): ServerEnv {
  if (credential.provider === "agnes") {
    return {
      ...env,
      agentModel: runtimeModelId,
      agnesApiKey: credential.apiKey,
      ...(credential.baseUrl ? { agnesBaseUrl: credential.baseUrl } : {}),
    };
  }
  if (credential.provider === "anthropic") {
    return {
      ...env,
      agentModel: runtimeModelId,
      anthropicApiKey: credential.apiKey,
      ...(credential.baseUrl ? { anthropicBaseUrl: credential.baseUrl } : {}),
    };
  }
  return {
    ...env,
    agentModel: runtimeModelId,
    openAIApiKey: credential.apiKey,
    ...(credential.baseUrl ? { openAIApiBase: credential.baseUrl } : {}),
  };
}

function credentialCacheKey(input: {
  capability: string;
  grantRef: string;
  model: string;
  provider: TuttiManagedProviderId;
}) {
  return [input.grantRef, input.provider, input.model, input.capability].join(
    "\u0000",
  );
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}
