import { getServerBaseUrl } from "./env";

const LOCAL_ASSET_PREFIX = "/local-assets/";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function extractLocalAssetId(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value, "http://localhost");
    const isRelative = value.startsWith("/");
    const isLoopback = LOOPBACK_HOSTS.has(parsed.hostname);
    if (!isRelative && !isLoopback) return null;
    if (!parsed.pathname.startsWith(LOCAL_ASSET_PREFIX)) return null;
    const assetId = parsed.pathname
      .slice(LOCAL_ASSET_PREFIX.length)
      .split("/")[0];
    return assetId || null;
  } catch {
    return null;
  }
}

export function toPersistentLocalAssetUrl(assetId: string) {
  return `${LOCAL_ASSET_PREFIX}${assetId}`;
}

export function normalizeLocalAssetStorageUrl(
  url: string | null | undefined,
  assetId?: string | null,
) {
  const normalizedAssetId = assetId ?? extractLocalAssetId(url);
  if (!normalizedAssetId) return url ?? undefined;
  return toPersistentLocalAssetUrl(normalizedAssetId);
}

export function toRuntimeAssetUrl(url: string, assetId?: string | null) {
  const normalizedAssetId = assetId ?? extractLocalAssetId(url);
  if (!normalizedAssetId) return url;
  return new URL(
    toPersistentLocalAssetUrl(normalizedAssetId),
    getServerBaseUrl(),
  ).toString();
}
