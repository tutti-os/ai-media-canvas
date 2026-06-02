"use client";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  "google-vertex": "Vertex AI",
  openai: "OpenAI",
  replicate: "Replicate",
  volces: "Volces",
};

export function formatProviderLabel(provider: string) {
  return (
    PROVIDER_LABELS[provider] ??
    provider
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
