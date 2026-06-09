export const supportedLocales = ["zh-CN", "en"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "zh-CN";
export const fallbackLocale: AppLocale = "zh-CN";
export const AIMC_LOCALE_STORAGE_KEY = "aimc_locale";
export const AIMC_LOCALE_COOKIE_NAME = "aimc_locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && supportedLocales.includes(value as AppLocale)
  );
}

export function normalizeLocale(
  value: string | null | undefined,
): AppLocale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function detectInitialLocale(): AppLocale {
  if (typeof window === "undefined") return defaultLocale;

  return (
    normalizeLocale(readStoredLocale()) ??
    normalizeLocale(readLocaleCookie()) ??
    normalizeLocale(window.navigator.languages?.[0]) ??
    normalizeLocale(window.navigator.language) ??
    defaultLocale
  );
}

export function persistLocalePreference(locale: AppLocale): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(AIMC_LOCALE_STORAGE_KEY, locale);
    } catch {
      // localStorage can be unavailable in privacy modes or opaque test origins.
    }
    document.cookie = `${AIMC_LOCALE_COOKIE_NAME}=${locale}; Max-Age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax`;
  }
  syncDocumentLanguage(locale);
}

export function syncDocumentLanguage(locale: AppLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

function readLocaleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${AIMC_LOCALE_COOKIE_NAME}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function readStoredLocale(): string | null {
  try {
    return window.localStorage?.getItem(AIMC_LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
