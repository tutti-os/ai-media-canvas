import type { AgnesClientConfig } from "agnes-ai-cli";

export type AgnesMediaOptions = Pick<
  AgnesClientConfig,
  "mediaProvider" | "temporaryMediaProviderOrder"
>;

export const DEFAULT_AGNES_TEMPORARY_MEDIA_PROVIDER_ORDER = [
  "uguu",
  "litterbox",
  "tmpfiles",
  "x0",
] as const satisfies NonNullable<
  AgnesClientConfig["temporaryMediaProviderOrder"]
>;

export function resolveAgnesMediaOptions(
  options: AgnesMediaOptions = {},
): AgnesMediaOptions {
  return {
    temporaryMediaProviderOrder:
      options.temporaryMediaProviderOrder ??
      DEFAULT_AGNES_TEMPORARY_MEDIA_PROVIDER_ORDER,
    ...(options.mediaProvider ? { mediaProvider: options.mediaProvider } : {}),
  };
}
