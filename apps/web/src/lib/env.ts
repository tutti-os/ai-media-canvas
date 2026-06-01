const defaultServerBaseUrl = "http://localhost:3001";

export function getServerBaseUrl(source: NodeJS.ProcessEnv = process.env) {
  const configuredUrl = source.AIMC_SERVER_BASE_URL?.trim();
  if (typeof window !== "undefined") {
    if (!configuredUrl) {
      return window.location.origin;
    }
    try {
      const currentUrl = new URL(window.location.origin);
      const targetUrl = new URL(configuredUrl);
      const isLoopbackFrontend =
        (currentUrl.hostname === "localhost" ||
          currentUrl.hostname === "127.0.0.1") &&
        (currentUrl.port === "3000" || currentUrl.port === "3200");
      if (!isLoopbackFrontend || currentUrl.hostname !== targetUrl.hostname) {
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
