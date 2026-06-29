import type { WorkspaceSettings } from "@aimc/shared";

export type MediaProviderSettings = Pick<
  WorkspaceSettings,
  | "agnesApiKey"
  | "kieApiKey"
  | "replicateApiToken"
  | "googleApiKey"
  | "googleVertexProject"
  | "googleVertexLocation"
  | "openAIApiKey"
  | "openAIApiBase"
  | "volcesApiKey"
>;

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function hasVertexConfig(settings: MediaProviderSettings) {
  return (
    hasValue(settings.googleVertexProject) &&
    hasValue(settings.googleVertexLocation)
  );
}

function hasOfficialOpenAIImageProvider(settings: MediaProviderSettings) {
  if (!hasValue(settings.openAIApiKey)) return false;
  if (!hasValue(settings.openAIApiBase)) return true;

  try {
    const url = new URL(settings.openAIApiBase);
    const pathname = url.pathname.replace(/\/+$/, "");
    return (
      url.hostname === "api.openai.com" && (!pathname || pathname === "/v1")
    );
  } catch {
    return false;
  }
}

export function hasConfiguredImageProvider(settings: MediaProviderSettings) {
  return (
    hasValue(settings.agnesApiKey) ||
    hasValue(settings.kieApiKey) ||
    hasValue(settings.replicateApiToken) ||
    hasValue(settings.googleApiKey) ||
    hasVertexConfig(settings) ||
    hasOfficialOpenAIImageProvider(settings) ||
    hasValue(settings.volcesApiKey)
  );
}

export function hasConfiguredVideoProvider(settings: MediaProviderSettings) {
  return (
    hasValue(settings.agnesApiKey) ||
    hasValue(settings.kieApiKey) ||
    hasValue(settings.replicateApiToken) ||
    hasValue(settings.googleApiKey) ||
    hasVertexConfig(settings)
  );
}

export function isMediaProviderConfigured(
  provider: string,
  mediaType: "image" | "video",
  settings: MediaProviderSettings,
) {
  switch (provider) {
    case "agnes":
    case "agnes-image":
    case "agnes-video":
      return hasValue(settings.agnesApiKey);
    case "kie":
    case "kie-image":
    case "kie-video":
      return hasValue(settings.kieApiKey);
    case "replicate":
      return hasValue(settings.replicateApiToken);
    case "google":
      return hasValue(settings.googleApiKey);
    case "google-vertex":
      return hasVertexConfig(settings);
    case "openai":
      return mediaType === "image" && hasOfficialOpenAIImageProvider(settings);
    case "codex-imagegen":
      return mediaType === "image";
    case "volces":
      return mediaType === "image" && hasValue(settings.volcesApiKey);
    default:
      return false;
  }
}
