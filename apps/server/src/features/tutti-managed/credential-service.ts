import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

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

const PROVIDER_CREDENTIAL_TTL_MS = 5 * 60 * 1000;
const PROVIDER_CREDENTIAL_REFRESH_WINDOW_MS = 30 * 1000;
const CONNECT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MANAGED_MODEL_ID_PREFIX = "tutti";
const MANAGED_RESPONSE_MAX_BYTES = 512 * 1024 + 4 * 1024;

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

type InFlightCredential = {
  epoch: number;
  promise: Promise<TuttiManagedProviderCredential>;
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
  const inFlightCredentials = new Map<string, InFlightCredential>();
  let connectAttemptEpoch = 0;
  let connectionEpoch = 0;
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
    supersedeConnectAttempts();
    invalidateCredentialState();
    options.store.clearTuttiManagedConnection();
    if (
      connection.grantRef &&
      isTuttiManagedBaseRuntimeConfigured(options.env)
    ) {
      await revokeClient({
        env: options.env,
        grantRef: connection.grantRef,
      }).catch(() => undefined);
    }
    return options.store.getTuttiManagedConnection();
  }

  async function connect(input: TuttiManagedGrantRequest) {
    requireTuttiManagedRuntimeConfigured(options.env);
    consumeConnectChallenge(input.state, input.nonce);
    verifyContextToken(options.env, input.contextToken);
    const connectEpoch = supersedeConnectAttempts();
    const exchange = await exchangeClient({
      contextToken: input.contextToken,
      env: options.env,
      grantCode: input.grantCode,
      nonce: input.nonce,
      state: input.state,
    });
    if (connectEpoch !== connectAttemptEpoch) {
      throw new Error("Tutti Managed connection request became stale.");
    }
    const expiresAt = normalizeCredentialExpiry(exchange.expiresAt, now());
    const models = normalizeModels(
      exchange.models?.length ? exchange.models : (input.models ?? []),
    );
    const providers = normalizeProviderIds(
      input.providers?.length ? input.providers : exchange.providers,
    );

    invalidateCredentialState();
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
    const requestEpoch = connectionEpoch;
    try {
      const catalog = await modelCatalogClient({
        env: options.env,
        grantRef: connection.grantRef,
      });
      const models = normalizeModels(catalog.models);
      const currentConnection = requireCurrentConnection(
        requestEpoch,
        connection.grantRef,
      );
      options.store.updateTuttiManagedConnection({
        ...currentConnection,
        expiresAt: catalog.expiresAt
          ? normalizeCredentialExpiry(catalog.expiresAt, now())
          : currentConnection.expiresAt,
        models,
      });
      return models.map((model) => ({
        ...model,
        source: "tutti-managed" as const,
      }));
    } catch {
      const currentConnection = getConnection();
      const models =
        currentConnection.connected &&
        currentConnection.grantRef === connection.grantRef
          ? currentConnection.models
          : [];
      return models.map((model) => ({
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
    pruneCredentialCache();
    const requestEpoch = connectionEpoch;
    const grantRef = connection.grantRef;
    const cacheKey = credentialCacheKey({
      capability,
      grantRef,
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

    const existing = inFlightCredentials.get(cacheKey);
    if (existing?.epoch === requestEpoch) {
      return existing.promise;
    }

    const promise = (async () => {
      const result = await providerCredentialClient({
        capability,
        env: options.env,
        grantRef,
        model,
        provider,
      });
      const expiresAt = normalizeCredentialExpiry(result.expiresAt, now());
      const credential = normalizeCredential(result.credential);
      const currentConnection = requireCurrentConnection(
        requestEpoch,
        grantRef,
      );
      cache.set(cacheKey, {
        credential,
        expiresAtMs: Date.parse(expiresAt),
      });
      options.store.updateTuttiManagedConnection({
        ...currentConnection,
        expiresAt,
        ...(result.models?.length
          ? { models: normalizeModels(result.models) }
          : {}),
      });
      return credential;
    })();
    const inFlight = { epoch: requestEpoch, promise };
    inFlightCredentials.set(cacheKey, inFlight);
    try {
      return await promise;
    } finally {
      if (inFlightCredentials.get(cacheKey) === inFlight) {
        inFlightCredentials.delete(cacheKey);
      }
    }
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

  function invalidateCredentialState() {
    connectionEpoch += 1;
    cache.clear();
    inFlightCredentials.clear();
    return connectionEpoch;
  }

  function supersedeConnectAttempts() {
    connectAttemptEpoch += 1;
    return connectAttemptEpoch;
  }

  function pruneCredentialCache() {
    const current = now();
    for (const [key, cached] of cache.entries()) {
      if (cached.expiresAtMs <= current) {
        cache.delete(key);
      }
    }
  }

  function requireCurrentConnection(epoch: number, grantRef: string) {
    const currentConnection = getConnection();
    if (
      epoch !== connectionEpoch ||
      !currentConnection.connected ||
      currentConnection.grantRef !== grantRef
    ) {
      throw new Error("Tutti Managed credential request became stale.");
    }
    return currentConnection;
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
    requireTuttiManagedRuntimeConfigured(env);
    const { token, url } = createTuttiManagedGrantCollectionUrl(env);
    url.pathname = `${url.pathname}/exchange`;
    const body = JSON.stringify({
      contextToken,
      grantCode,
      installationId: env.tuttiAppInstallationId,
      nonce,
      state,
    });
    const payload = await fetchManagedGrantJson(
      url,
      {
        body,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
      "Tutti Managed exchange failed",
    );

    return normalizeExchangePayload(payload);
  };
}

function createDefaultTuttiManagedModelCatalogClient(): TuttiManagedModelCatalogClient {
  return async ({ env, grantRef }) => {
    const { token, url } = createTuttiManagedGrantUrl(env, grantRef);
    url.pathname = `${url.pathname}/models`;
    const payload = await fetchManagedGrantJson(
      url,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        method: "GET",
      },
      "Tutti Managed models failed",
    );

    return normalizeModelCatalogPayload(payload);
  };
}

function createDefaultTuttiManagedProviderCredentialClient(): TuttiManagedProviderCredentialClient {
  return async ({ capability, env, grantRef, model, provider }) => {
    const { token, url } = createTuttiManagedGrantUrl(env, grantRef);
    url.pathname = `${url.pathname}/credentials`;
    const body = JSON.stringify({ capability, model, provider });
    const payload = await fetchManagedGrantJson(
      url,
      {
        body,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
      "Tutti Managed credential failed",
    );

    return normalizeCredentialPayload(payload);
  };
}

function createDefaultTuttiManagedRevokeClient(): TuttiManagedRevokeClient {
  return async ({ env, grantRef }) => {
    const { token, url } = createTuttiManagedGrantUrl(env, grantRef);
    await fetchManagedGrant(
      url,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        method: "DELETE",
      },
      async (response) => {
        await discardResponseBody(response);
        if (!response.ok && response.status !== 404) {
          throw new Error(`Tutti Managed revoke failed: ${response.status}`);
        }
      },
    );
  };
}

function createTuttiManagedGrantCollectionUrl(env: ServerEnv) {
  requireTuttiManagedBaseRuntimeConfigured(env);

  return {
    token: env.tuttiAppServerToken,
    url: new URL(
      `/v1/workspaces/${encodeURIComponent(
        env.tuttiWorkspaceId,
      )}/apps/${encodeURIComponent(env.tuttiAppId)}/managed-model-grants`,
      env.tuttiApiBaseUrl,
    ),
  };
}

function isTuttiManagedBaseRuntimeConfigured(
  env: ServerEnv,
): env is ServerEnv &
  Required<
    Pick<
      ServerEnv,
      | "tuttiApiBaseUrl"
      | "tuttiAppId"
      | "tuttiAppServerToken"
      | "tuttiWorkspaceId"
    >
  > {
  return Boolean(
    env.tuttiApiBaseUrl &&
      env.tuttiWorkspaceId &&
      env.tuttiAppId &&
      env.tuttiAppServerToken,
  );
}

function isTuttiManagedRuntimeConfigured(
  env: ServerEnv,
): env is ServerEnv &
  Required<
    Pick<
      ServerEnv,
      | "tuttiApiBaseUrl"
      | "tuttiAppId"
      | "tuttiAppInstallationId"
      | "tuttiAppServerToken"
      | "tuttiWorkspaceId"
    >
  > {
  return Boolean(
    env.tuttiApiBaseUrl &&
      env.tuttiWorkspaceId &&
      env.tuttiAppId &&
      env.tuttiAppInstallationId &&
      env.tuttiAppServerToken,
  );
}

function requireTuttiManagedRuntimeConfigured(
  env: ServerEnv,
): asserts env is ServerEnv &
  Required<
    Pick<
      ServerEnv,
      | "tuttiApiBaseUrl"
      | "tuttiAppId"
      | "tuttiAppInstallationId"
      | "tuttiAppServerToken"
      | "tuttiWorkspaceId"
    >
  > {
  if (!isTuttiManagedRuntimeConfigured(env)) {
    throw new Error("Tutti Managed runtime environment is not configured.");
  }
}

function requireTuttiManagedBaseRuntimeConfigured(
  env: ServerEnv,
): asserts env is ServerEnv &
  Required<
    Pick<
      ServerEnv,
      | "tuttiApiBaseUrl"
      | "tuttiAppId"
      | "tuttiAppServerToken"
      | "tuttiWorkspaceId"
    >
  > {
  if (!isTuttiManagedBaseRuntimeConfigured(env)) {
    throw new Error("Tutti Managed runtime environment is not configured.");
  }
}

async function fetchManagedGrantJson(
  url: URL,
  init: RequestInit,
  errorPrefix: string,
) {
  return fetchManagedGrant(url, init, async (response) => {
    if (!response.ok) {
      await discardResponseBody(response);
      throw new Error(`${errorPrefix}: ${response.status}`);
    }
    return readBoundedJsonResponse(response);
  });
}

async function fetchManagedGrant<T>(
  url: URL,
  init: RequestInit,
  handleResponse: (response: Response) => Promise<T>,
) {
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", randomUUID());
  const stableInit: RequestInit = { ...init, headers };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, stableInit);
      if (
        attempt === 0 &&
        (response.status === 502 || response.status === 503)
      ) {
        await discardResponseBody(response);
        continue;
      }
      return await handleResponse(response);
    } catch (error) {
      if (
        stableInit.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }
      if (attempt === 0 && error instanceof TypeError) continue;
      throw error;
    }
  }

  throw new Error("Tutti Managed request failed.");
}

async function discardResponseBody(response: Response) {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
  }
}

async function readBoundedJsonResponse(response: Response): Promise<unknown> {
  if (!response.body) {
    return JSON.parse("") as unknown;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MANAGED_RESPONSE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Tutti Managed response exceeds size limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Tutti Managed response is not valid UTF-8.");
  }
  return JSON.parse(json) as unknown;
}

function createTuttiManagedGrantUrl(env: ServerEnv, grantRef: string) {
  const { token, url } = createTuttiManagedGrantCollectionUrl(env);
  url.pathname = `${url.pathname}/${encodeURIComponent(grantRef)}`;
  return { token, url };
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
  if (expiresAt === undefined) {
    return new Date(maxExpiresAtMs).toISOString();
  }
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= nowMs) {
    throw new Error("Tutti Managed credential expiry is invalid or expired.");
  }
  return new Date(Math.min(parsed, maxExpiresAtMs)).toISOString();
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

function verifyContextToken(env: ServerEnv, token: string) {
  if (!env.tuttiAppServerToken) {
    throw new Error("Tutti Managed app server token is not configured.");
  }
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid Tutti context token.");
  }
  const expectedSignature = createHmac("sha256", env.tuttiAppServerToken)
    .update(encodedPayload)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expectedSignature)) {
    throw new Error("Invalid Tutti context token signature.");
  }
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error("Tutti context token is expired.");
  }
  if (payload.appId !== env.tuttiAppId || payload.aud !== env.tuttiAppId) {
    throw new Error("Tutti context token app mismatch.");
  }
  if (payload.workspaceId !== env.tuttiWorkspaceId) {
    throw new Error("Tutti context token workspace mismatch.");
  }
  if (
    !env.tuttiAppInstallationId ||
    payload.installationId !== env.tuttiAppInstallationId
  ) {
    throw new Error("Tutti context token installation mismatch.");
  }
  if (env.tuttiApiBaseUrl && typeof payload.iss === "string") {
    const expectedIssuer = new URL(env.tuttiApiBaseUrl).origin;
    if (payload.iss !== expectedIssuer) {
      throw new Error("Tutti context token issuer mismatch.");
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
