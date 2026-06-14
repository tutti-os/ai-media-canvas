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

export const SUPPORTED_LOCAL_CLI_PROVIDERS = ["codex", "claude"];

export const LOCAL_CLI_PROVIDER_LABELS: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  cursor: "Cursor Agent",
  devin: "Devin for Terminal",
  gemini: "Gemini CLI",
  hermes: "Hermes",
  kilo: "Kilo",
  kimi: "Kimi CLI",
  kiro: "Kiro CLI",
  opencode: "OpenCode",
  qoder: "Qoder CLI",
  qwen: "Qwen Code",
  vibe: "Mistral Vibe CLI",
};

export const LOCAL_CLI_PROVIDER_FALLBACK_MARKS: Record<string, string> = {
  claude: "C",
  codex: ">_",
  devin: "D",
  hermes: "H",
  kiro: "K",
};

export function isApiProvider(provider: string) {
  return API_PROVIDER_IDS.has(provider);
}

export function isLocalCliProvider(provider: string) {
  return !isApiProvider(provider);
}

export function isSupportedLocalCliProvider(provider: string) {
  return SUPPORTED_LOCAL_CLI_PROVIDERS.includes(provider);
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
  return (
    LOCAL_CLI_PROVIDER_LABELS[provider] ??
    `${provider.charAt(0).toUpperCase()}${provider.slice(1)} CLI`
  );
}

export function getLocalCliProviderFallbackMark(provider: string) {
  return (
    LOCAL_CLI_PROVIDER_FALLBACK_MARKS[provider] ??
    provider.slice(0, 2).toUpperCase()
  );
}
