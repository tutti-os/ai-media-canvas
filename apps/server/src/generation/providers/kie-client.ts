import { GenerationError } from "../utils.js";

const DEFAULT_KIE_API_BASE = "https://api.kie.ai";

export type KieClientOptions = {
  apiBase?: string;
};

export type KieMarketCreateTaskPayload = {
  model: string;
  input: Record<string, unknown>;
  callBackUrl?: string;
};

export type KieMarketTaskRecord = {
  taskId?: string;
  state?: string;
  resultJson?: string | null;
  failCode?: string | null;
  failMsg?: string | null;
  error?: unknown;
};

export type KieRunwayTaskRecord = {
  taskId?: string;
  state?: string;
  videoInfo?: {
    videoUrl?: string | null;
    imageUrl?: string | null;
  } | null;
  failCode?: string | null;
  failMsg?: string | null;
  error?: unknown;
};

export type KieVeoTaskRecord = {
  taskId?: string;
  successFlag?: number;
  completeTime?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  response?: {
    resultUrls?: string[];
  } | null;
};

type KieApiResponse<T> = {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
};

export class KieClient {
  private readonly apiBase: string;

  constructor(
    private readonly apiKey: string,
    options: KieClientOptions = {},
  ) {
    this.apiBase = (options.apiBase ?? DEFAULT_KIE_API_BASE).replace(
      /\/+$/,
      "",
    );
  }

  async createMarketTask(payload: KieMarketCreateTaskPayload): Promise<string> {
    const data = await this.requestJson<{ taskId?: string }>(
      "/api/v1/jobs/createTask",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return requireKieTaskId(
      data,
      "Kie Market task creation returned no taskId.",
    );
  }

  async queryMarketTask(taskId: string): Promise<KieMarketTaskRecord> {
    return this.requestJson<KieMarketTaskRecord>(
      `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    );
  }

  async createRunwayTask(payload: Record<string, unknown>): Promise<string> {
    const data = await this.requestJson<{ taskId?: string }>(
      "/api/v1/runway/generate",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return requireKieTaskId(
      data,
      "Kie Runway task creation returned no taskId.",
    );
  }

  async queryRunwayTask(taskId: string): Promise<KieRunwayTaskRecord> {
    return this.requestJson<KieRunwayTaskRecord>(
      `/api/v1/runway/record-detail?taskId=${encodeURIComponent(taskId)}`,
    );
  }

  async createVeoTask(payload: Record<string, unknown>): Promise<string> {
    const data = await this.requestJson<{ taskId?: string }>(
      "/api/v1/veo/generate",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return requireKieTaskId(data, "Kie Veo task creation returned no taskId.");
  }

  async queryVeoTask(taskId: string): Promise<KieVeoTaskRecord> {
    return this.requestJson<KieVeoTaskRecord>(
      `/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
    );
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new GenerationError(
        "kie",
        "network_error",
        getKieNetworkErrorMessage(error, path),
      );
    }
    const text = await response.text();
    const parsed = parseJson(text);

    if (!response.ok) {
      throw new GenerationError(
        "kie",
        "api_error",
        getKieErrorMessage(
          parsed,
          `Kie API request failed with HTTP ${response.status}.`,
        ),
      );
    }

    if (isKieApiResponse(parsed)) {
      if (
        parsed.code !== undefined &&
        parsed.code !== 200 &&
        parsed.msg?.toLowerCase() !== "success"
      ) {
        throw new GenerationError(
          "kie",
          "api_error",
          getKieErrorMessage(parsed, "Kie API request failed."),
        );
      }
      return parsed.data as T;
    }

    return parsed as T;
  }
}

export function getFirstKieMarketResultUrl(
  record: KieMarketTaskRecord,
): string | undefined {
  if (!record.resultJson) return undefined;
  const parsed = parseJson(record.resultJson);
  if (!isRecord(parsed)) return undefined;
  const resultUrls = parsed.resultUrls;
  if (Array.isArray(resultUrls) && typeof resultUrls[0] === "string") {
    return resultUrls[0];
  }
  const url = parsed.url ?? parsed.imageUrl ?? parsed.videoUrl;
  return typeof url === "string" ? url : undefined;
}

export function getFirstKieRunwayResultUrl(
  record: KieRunwayTaskRecord,
): string | undefined {
  return record.videoInfo?.videoUrl ?? undefined;
}

export function getFirstKieVeoResultUrl(
  record: KieVeoTaskRecord,
): string | undefined {
  const resultUrls = record.response?.resultUrls;
  return Array.isArray(resultUrls) && typeof resultUrls[0] === "string"
    ? resultUrls[0]
    : undefined;
}

function requireKieTaskId(
  data: { taskId?: string } | undefined,
  fallbackMessage: string,
): string {
  if (typeof data?.taskId === "string" && data.taskId.trim()) {
    return data.taskId;
  }
  throw new GenerationError("kie", "api_error", fallbackMessage);
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isKieApiResponse(value: unknown): value is KieApiResponse<unknown> {
  return isRecord(value) && ("code" in value || "data" in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getKieErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (!isRecord(value)) return fallback;

  const message = value.msg ?? value.message ?? value.error;
  if (typeof message === "string" && message.trim()) return message;
  if (isRecord(message) && typeof message.message === "string") {
    return message.message;
  }
  return fallback;
}

function getKieNetworkErrorMessage(error: unknown, path: string): string {
  if (!(error instanceof Error)) {
    return `Kie API request failed before receiving a response: ${String(error)}`;
  }
  const cause =
    "cause" in error ? (error as { cause?: unknown }).cause : undefined;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause !== null && "message" in cause
        ? String((cause as { message?: unknown }).message)
        : undefined;
  const causeCode =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : undefined;
  return [
    `Kie API request failed before receiving a response for ${path}: ${error.message}`,
    causeCode ? `causeCode=${causeCode}` : undefined,
    causeMessage ? `cause=${causeMessage}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}
