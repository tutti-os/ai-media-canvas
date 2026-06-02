import { readFileSync } from "node:fs";

export const DEFAULT_SERVER_PORT = 3001;
export const DEFAULT_WEB_ORIGIN = "http://localhost:3000";

export type ServerEnv = {
  googleApiKey?: string;
  googleApplicationCredentials?: string;
  googleVertexLocation?: string;
  googleVertexProject?: string;
  googleVertexVideoLocation?: string;
  openAIApiBase?: string;
  openAIApiKey?: string;
  port: number;
  replicateApiToken?: string;
  version: string;
  volcesApiKey?: string;
  volcesBaseUrl?: string;
  webDistDir?: string;
  webOrigin: string;
  workerId?: string;
  workerMaxBatchSize?: number;
  workerPollIntervalMs?: number;
};

export function loadServerEnv(
  overrides: Partial<ServerEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const webDistDir =
    overrides.webDistDir ?? normalizeOptionalString(source.AIMC_WEB_DIST);
  const openAIApiBase =
    overrides.openAIApiBase ??
    normalizeOptionalString(source.AIMC_OPENAI_API_BASE ?? source.OPENAI_API_BASE);
  const openAIApiKey =
    overrides.openAIApiKey ??
    normalizeOptionalString(source.AIMC_OPENAI_API_KEY ?? source.OPENAI_API_KEY);
  const googleApiKey =
    overrides.googleApiKey ??
    normalizeOptionalString(source.AIMC_GOOGLE_API_KEY ?? source.GOOGLE_API_KEY);
  const googleApplicationCredentials =
    overrides.googleApplicationCredentials ??
    normalizeOptionalString(
      source.AIMC_GOOGLE_APPLICATION_CREDENTIALS ??
        source.GOOGLE_APPLICATION_CREDENTIALS,
    );
  const googleVertexProject =
    overrides.googleVertexProject ??
    normalizeOptionalString(
      source.AIMC_GOOGLE_VERTEX_PROJECT ?? source.GOOGLE_VERTEX_PROJECT,
    );
  const googleVertexLocation =
    overrides.googleVertexLocation ??
    normalizeOptionalString(
      source.AIMC_GOOGLE_VERTEX_LOCATION ?? source.GOOGLE_VERTEX_LOCATION,
    );
  const googleVertexVideoLocation =
    overrides.googleVertexVideoLocation ??
    normalizeOptionalString(
      source.AIMC_GOOGLE_VERTEX_VIDEO_LOCATION ??
        source.GOOGLE_VERTEX_VIDEO_LOCATION,
    );
  const replicateApiToken =
    overrides.replicateApiToken ??
    normalizeOptionalString(
      source.AIMC_REPLICATE_API_TOKEN ?? source.REPLICATE_API_TOKEN,
    );
  const volcesApiKey =
    overrides.volcesApiKey ??
    normalizeOptionalString(source.AIMC_VOLCES_API_KEY ?? source.VOLCES_API_KEY);
  const volcesBaseUrl =
    overrides.volcesBaseUrl ??
    normalizeOptionalString(source.AIMC_VOLCES_BASE_URL ?? source.VOLCES_BASE_URL);
  const workerId =
    overrides.workerId ??
    normalizeOptionalString(source.AIMC_WORKER_ID ?? source.WORKER_ID);
  const workerPollIntervalMs =
    overrides.workerPollIntervalMs ??
    parseOptionalInt(
      source.AIMC_WORKER_POLL_INTERVAL_MS ?? source.WORKER_POLL_INTERVAL_MS,
    );
  const workerMaxBatchSize =
    overrides.workerMaxBatchSize ??
    parseOptionalInt(
      source.AIMC_WORKER_MAX_BATCH_SIZE ?? source.WORKER_MAX_BATCH_SIZE,
    );

  return {
    port: overrides.port ?? parsePort(source.AIMC_SERVER_PORT ?? source.PORT),
    version: overrides.version ?? readServerVersion(),
    webOrigin:
      overrides.webOrigin ?? source.AIMC_WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
    ...(webDistDir ? { webDistDir } : {}),
    ...(openAIApiBase ? { openAIApiBase } : {}),
    ...(openAIApiKey ? { openAIApiKey } : {}),
    ...(googleApiKey ? { googleApiKey } : {}),
    ...(googleApplicationCredentials ? { googleApplicationCredentials } : {}),
    ...(googleVertexProject ? { googleVertexProject } : {}),
    ...(googleVertexLocation ? { googleVertexLocation } : {}),
    ...(googleVertexVideoLocation ? { googleVertexVideoLocation } : {}),
    ...(replicateApiToken ? { replicateApiToken } : {}),
    ...(volcesApiKey ? { volcesApiKey } : {}),
    ...(volcesBaseUrl ? { volcesBaseUrl } : {}),
    ...(workerId ? { workerId } : {}),
    ...(workerPollIntervalMs ? { workerPollIntervalMs } : {}),
    ...(workerMaxBatchSize ? { workerMaxBatchSize } : {}),
  };
}

function normalizeOptionalString(value: string | undefined) {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

function parseOptionalInt(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parsePort(rawPort: string | undefined) {
  if (!rawPort) {
    return DEFAULT_SERVER_PORT;
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid AIMC_SERVER_PORT value: ${rawPort}`);
  }

  return port;
}

function readServerVersion() {
  const packageJson = readFileSync(
    new URL("../../package.json", import.meta.url),
    "utf8",
  );

  const parsed = JSON.parse(packageJson) as { version?: string };
  return parsed.version ?? "0.0.0";
}
