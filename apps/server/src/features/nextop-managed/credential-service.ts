import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type {
  AgentModelSource,
  NextopManagedConnectChallenge,
  NextopManagedConnection,
  NextopManagedGrantRequest,
  NextopManagedModel,
  NextopManagedProviderId,
} from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import type { LocalStore } from "../../local/store.js";

const PROVIDER_CREDENTIAL_TTL_MS = 5 * 60 * 60 * 1000;
const PROVIDER_CREDENTIAL_REFRESH_WINDOW_MS = 10 * 60 * 1000;
const CONNECT_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type NextopManagedProviderCredential = {
  provider: NextopManagedProviderId;
  apiKey: string;
  baseUrl?: string;
  models?: NextopManagedModel[];
};

export type NextopManagedExchangeResult = {
  expiresAt?: string;
  grantRef: string;
  providers: NextopManagedProviderId[];
  models?: NextopManagedModel[];
};

export type NextopManagedModelCatalogResult = {
  expiresAt?: string;
  models: NextopManagedModel[];
};

export type NextopManagedProviderCredentialResult = {
  credential: NextopManagedProviderCredential;
  expiresAt?: string;
  models?: NextopManagedModel[];
};

export type NextopManagedExchangeClient = (input: {
  contextToken: string;
  env: ServerEnv;
  grantCode: string;
  nonce: string;
  state: string;
}) => Promise<NextopManagedExchangeResult>;

export type NextopManagedModelCatalogClient = (input: {
  env: ServerEnv;
  grantRef: string;
}) => Promise<NextopManagedModelCatalogResult>;

export type NextopManagedProviderCredentialClient = (input: {
  capability: string;
  env: ServerEnv;
  grantRef: string;
  model: string;
  provider: NextopManagedProviderId;
}) => Promise<NextopManagedProviderCredentialResult>;

export type NextopManagedRevokeClient = (input: {
  env: ServerEnv;
  grantRef: string;
}) => Promise<void>;

type CachedCredential = {
  credential: NextopManagedProviderCredential;
  expiresAtMs: number;
};

type StoredChallenge = {
  expiresAtMs: number;
  nonce: string;
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
  modelCatalogClient?: NextopManagedModelCatalogClient;
  providerCredentialClient?: NextopManagedProviderCredentialClient;
  revokeClient?: NextopManagedRevokeClient;
  store: StoreAccess;
  now?: () => number;
}) {
  const cache = new Map<string, CachedCredential>();
  const challenges = new Map<string, StoredChallenge>();
  const now = options.now ?? (() => Date.now());
  const exchangeClient =
    options.exchangeClient ?? createDefaultNextopManagedExchangeClient();
  const modelCatalogClient =
    options.modelCatalogClient ?? createDefaultNextopManagedModelCatalogClient();
  const providerCredentialClient =
    options.providerCredentialClient ??
    createDefaultNextopManagedProviderCredentialClient();
  const revokeClient =
    options.revokeClient ?? createDefaultNextopManagedRevokeClient();

  function getConnection() {
    if (!isNextopManagedRuntimeConfigured(options.env)) {
      return {
        connected: false,
        providers: [],
        models: [],
      };
    }
    return options.store.getNextopManagedConnection();
  }

  function createConnectChallenge(): NextopManagedConnectChallenge {
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
    const connection = options.store.getNextopManagedConnection();
    if (connection.grantRef && isNextopManagedRuntimeConfigured(options.env)) {
      clearGrantCache(connection.grantRef);
      await revokeClient({
        env: options.env,
        grantRef: connection.grantRef,
      }).catch(() => undefined);
    }
    options.store.clearNextopManagedConnection();
    return options.store.getNextopManagedConnection();
  }

  async function connect(input: NextopManagedGrantRequest) {
    consumeConnectChallenge(input.state, input.nonce);
    verifyContextToken(options.env, input.contextToken);
    const exchange = await exchangeClient({
      contextToken: input.contextToken,
      env: options.env,
      grantCode: input.grantCode,
      nonce: input.nonce,
      state: input.state,
    });
    const expiresAt = normalizeCredentialExpiry(exchange.expiresAt, now());
    const models = normalizeModels(
      exchange.models?.length ? exchange.models : input.models ?? [],
    );
    const providers = normalizeProviderIds(
      input.providers?.length ? input.providers : exchange.providers,
    );

    return options.store.updateNextopManagedConnection({
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
      options.store.updateNextopManagedConnection({
        ...connection,
        expiresAt: catalog.expiresAt
          ? normalizeCredentialExpiry(catalog.expiresAt, now())
          : connection.expiresAt,
        models,
      });
      return models.map((model) => ({
        ...model,
        source: "nextop-managed" as const,
      }));
    } catch {
      return connection.models.map((model) => ({
        ...model,
        source: "nextop-managed" as const,
      }));
    }
  }

  function isManagedModel(
    modelId: string | null | undefined,
    source?: AgentModelSource,
  ) {
    if (!modelId) return false;
    const connection = getConnection();
    if (modelId.startsWith("nextop:")) {
      return (
        connection.connected &&
        connection.models.some((model) => model.id === modelId)
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
    return applyProviderCredential(baseEnv, credential, modelRef.runtimeModelId);
  }

  async function getFreshCredential(
    connection: NextopManagedConnection,
    provider: NextopManagedProviderId,
    model: string,
    capability: string,
  ) {
    if (!connection.grantRef) {
      throw new Error("Nextop Managed connection is missing grantRef.");
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
    options.store.updateNextopManagedConnection({
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
      throw new Error("Invalid Nextop Managed connect challenge.");
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

function createDefaultNextopManagedExchangeClient(): NextopManagedExchangeClient {
  return async ({ contextToken, env, grantCode, nonce, state }) => {
    const { token, url } = createNextopManagedGrantCollectionUrl(env);
    url.pathname = `${url.pathname}/exchange`;
    const response = await fetch(url, {
      body: JSON.stringify({
        contextToken,
        grantCode,
        ...(env.nextopAppInstallationId
          ? { installationId: env.nextopAppInstallationId }
          : {}),
        nonce,
        state,
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

function createDefaultNextopManagedModelCatalogClient(): NextopManagedModelCatalogClient {
  return async ({ env, grantRef }) => {
    const { token, url } = createNextopManagedGrantUrl(env, grantRef);
    url.pathname = `${url.pathname}/models`;
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Nextop Managed models failed: ${response.status}`);
    }

    return normalizeModelCatalogPayload(await response.json());
  };
}

function createDefaultNextopManagedProviderCredentialClient(): NextopManagedProviderCredentialClient {
  return async ({ capability, env, grantRef, model, provider }) => {
    const { token, url } = createNextopManagedGrantUrl(env, grantRef);
    url.pathname = `${url.pathname}/credentials`;
    const response = await fetch(url, {
      body: JSON.stringify({
        capability,
        model,
        provider,
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Nextop Managed credential failed: ${response.status}`);
    }

    return normalizeCredentialPayload(await response.json());
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

function createNextopManagedGrantCollectionUrl(env: ServerEnv) {
  if (!isNextopManagedRuntimeConfigured(env)) {
    throw new Error("Nextop Managed runtime environment is not configured.");
  }

  return {
    token: env.nextopAppServerToken,
    url: new URL(
      `/v1/workspaces/${encodeURIComponent(
        env.nextopWorkspaceId,
      )}/apps/${encodeURIComponent(env.nextopAppId)}/managed-model-grants`,
      env.nextopApiBaseUrl,
    ),
  };
}

function isNextopManagedRuntimeConfigured(env: ServerEnv): env is ServerEnv &
  Required<
    Pick<
      ServerEnv,
      | "nextopApiBaseUrl"
      | "nextopAppId"
      | "nextopAppServerToken"
      | "nextopWorkspaceId"
    >
  > {
  return Boolean(
    env.nextopApiBaseUrl &&
      env.nextopWorkspaceId &&
      env.nextopAppId &&
      env.nextopAppServerToken,
  );
}

function createNextopManagedGrantUrl(env: ServerEnv, grantRef: string) {
  const { token, url } = createNextopManagedGrantCollectionUrl(env);
  url.pathname = `${url.pathname}/${encodeURIComponent(grantRef)}`;
  return { token, url };
}

function normalizeExchangePayload(payload: unknown): NextopManagedExchangeResult {
  const result = normalizeResultRecord(payload);
  const grantRef = String(result.grantRef ?? result.grant_ref ?? "").trim();
  if (!grantRef) {
    throw new Error("Nextop Managed exchange response is missing grantRef.");
  }
  const expiresAt = readExpiresAt(result);
  return {
    ...(expiresAt ? { expiresAt } : {}),
    grantRef,
    models: Array.isArray(result.models)
      ? normalizeModels(result.models as NextopManagedModel[])
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
): NextopManagedModelCatalogResult {
  const result = normalizeResultRecord(payload);
  const expiresAt = readExpiresAt(result);
  return {
    ...(expiresAt ? { expiresAt } : {}),
    models: Array.isArray(result.models)
      ? normalizeModels(result.models as NextopManagedModel[])
      : [],
  };
}

function normalizeCredentialPayload(
  payload: unknown,
): NextopManagedProviderCredentialResult {
  const result = normalizeResultRecord(payload);
  const rawCredential =
    result.credential && typeof result.credential === "object"
      ? (result.credential as Record<string, unknown>)
      : result;
  const expiresAt = readExpiresAt(result);
  const models = Array.isArray(result.models)
    ? normalizeModels(result.models as NextopManagedModel[])
    : undefined;
  return {
    credential: normalizeCredential({
      provider: String(rawCredential.provider ?? "") as NextopManagedProviderId,
      apiKey: String(rawCredential.apiKey ?? rawCredential.api_key ?? ""),
      ...(typeof rawCredential.baseUrl === "string"
        ? { baseUrl: rawCredential.baseUrl }
        : typeof rawCredential.base_url === "string"
          ? { baseUrl: rawCredential.base_url }
          : {}),
      ...(Array.isArray(rawCredential.models)
        ? { models: normalizeModels(rawCredential.models as NextopManagedModel[]) }
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
    const modelPart = stripProviderPrefix(provider, stripNextopPrefix(rawId));
    const id = `nextop:${provider}:${modelPart}`;
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
  credential: NextopManagedProviderCredential,
): NextopManagedProviderCredential {
  const [provider] = normalizeProviderIds([credential.provider]);
  if (!provider || !credential.apiKey.trim()) {
    throw new Error("Invalid Nextop Managed provider credential.");
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
  if (parts.length < 3 || parts[0] !== "nextop") {
    throw new Error(`Invalid Nextop Managed model id: ${modelId}`);
  }
  const [provider] = normalizeProviderIds([parts[1] ?? ""]);
  if (!provider) {
    throw new Error(`Unsupported Nextop Managed provider: ${parts[1] ?? ""}`);
  }
  const model = parts.slice(2).join(":").trim();
  if (!model) {
    throw new Error(`Invalid Nextop Managed model id: ${modelId}`);
  }
  return {
    model,
    provider,
    runtimeModelId: `${provider}:${model}`,
  };
}

function stripNextopPrefix(value: string) {
  return value.startsWith("nextop:") ? value.slice("nextop:".length) : value;
}

function stripProviderPrefix(provider: string, value: string) {
  const prefix = `${provider}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function applyProviderCredential(
  env: ServerEnv,
  credential: NextopManagedProviderCredential,
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
  provider: NextopManagedProviderId;
}) {
  return [
    input.grantRef,
    input.provider,
    input.model,
    input.capability,
  ].join("\u0000");
}

function verifyContextToken(env: ServerEnv, token: string) {
  if (!env.nextopAppServerToken) {
    throw new Error("Nextop Managed app server token is not configured.");
  }
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid Nextop context token.");
  }
  const expectedSignature = createHmac("sha256", env.nextopAppServerToken)
    .update(encodedPayload)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expectedSignature)) {
    throw new Error("Invalid Nextop context token signature.");
  }
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error("Nextop context token is expired.");
  }
  if (payload.appId !== env.nextopAppId || payload.aud !== env.nextopAppId) {
    throw new Error("Nextop context token app mismatch.");
  }
  if (payload.workspaceId !== env.nextopWorkspaceId) {
    throw new Error("Nextop context token workspace mismatch.");
  }
  if (
    env.nextopAppInstallationId &&
    payload.installationId !== env.nextopAppInstallationId
  ) {
    throw new Error("Nextop context token installation mismatch.");
  }
  if (env.nextopApiBaseUrl && typeof payload.iss === "string") {
    const expectedIssuer = new URL(env.nextopApiBaseUrl).origin;
    if (payload.iss !== expectedIssuer) {
      throw new Error("Nextop context token issuer mismatch.");
    }
  }
}

function timingSafeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}
