import type {
  LocalAgentProviderInfo,
  ModelListResponse,
} from "@aimc/shared";

export type AgentModelSourceTab =
  | "local-agent"
  | "tutti-managed"
  | "api-provider";

const API_PROVIDER_IDS = new Set([
  "agnes",
  "openai",
  "anthropic",
  "google",
  "vertex",
]);
const MANAGED_MODEL_PREFIXES = ["tutti"];

export function isApiProvider(provider: string) {
  return API_PROVIDER_IDS.has(provider);
}

export function isLocalCliProvider(provider: string) {
  return !isApiProvider(provider);
}

export function isSupportedLocalCliProvider(provider: string) {
  return isLocalCliProvider(provider);
}

export function getAgentModelSourceTab(modelId: string | null | undefined) {
  const provider = modelId?.split(":")[0] ?? "";
  if (MANAGED_MODEL_PREFIXES.includes(provider)) {
    return "tutti-managed";
  }
  return provider && isApiProvider(provider) ? "api-provider" : "local-agent";
}

export function getModelSourceTab(model: {
  provider: string;
  source?: AgentModelSourceTab | undefined;
}) {
  if (model.source) return model.source;
  return isApiProvider(model.provider) ? "api-provider" : "local-agent";
}

export function formatLocalCliProviderLabel(provider: string) {
  return provider
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getLocalCliProviderFallbackMark(provider: string) {
  return provider
    .split(/[-_.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function localAgentProvidersFromModelResponse(
  response: ModelListResponse,
): LocalAgentProviderInfo[] {
  const current = (response as Partial<ModelListResponse>).localAgentProviders;
  return Array.isArray(current) ? current : [];
}
