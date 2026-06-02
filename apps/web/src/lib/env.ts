const defaultServerBaseUrl = "http://localhost:3001";
const browserConfiguredServerBaseUrl =
  process.env.NEXT_PUBLIC_AIMC_SERVER_BASE_URL?.trim() ||
  process.env.AIMC_SERVER_BASE_URL?.trim() ||
  "";

function getConfiguredServerBaseUrl(source: NodeJS.ProcessEnv = process.env) {
  return (
    browserConfiguredServerBaseUrl ||
    source.NEXT_PUBLIC_AIMC_SERVER_BASE_URL?.trim() ||
    source.AIMC_SERVER_BASE_URL?.trim() ||
    ""
  );
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getServerBaseUrl(source: NodeJS.ProcessEnv = process.env) {
  const configuredUrl = getConfiguredServerBaseUrl(source);
  if (typeof window !== "undefined") {
    if (!configuredUrl) {
      return window.location.origin;
    }
    try {
      const currentUrl = new URL(window.location.origin);
      const targetUrl = new URL(configuredUrl);
      const isLoopbackFrontend = isLoopbackHost(currentUrl.hostname);
      const isLoopbackApi = isLoopbackHost(targetUrl.hostname);
      if (
        !isLoopbackFrontend ||
        !isLoopbackApi
      ) {
        return window.location.origin;
      }
    } catch {
      return window.location.origin;
    }
  }
  if (configuredUrl) {
    return configuredUrl;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return defaultServerBaseUrl;
}

export type WebEnv = {
  serverBaseUrl: string;
};

export function loadWebEnv(
  overrides: Partial<WebEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): WebEnv {
  return {
    serverBaseUrl: overrides.serverBaseUrl ?? getServerBaseUrl(source),
  };
}
