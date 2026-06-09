"use client";

import i18n from "i18next";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";

import {
  AIMC_LOCALE_COOKIE_NAME,
  AIMC_LOCALE_STORAGE_KEY,
  type AppLocale,
  defaultLocale,
  detectInitialLocale,
  fallbackLocale,
  normalizeLocale,
  persistLocalePreference,
  supportedLocales,
  syncDocumentLanguage,
} from "./locales";
import {
  type AppNamespace,
  defaultNamespace,
  namespaces,
  resources,
} from "./resources";

type TranslationOptions = Record<string, unknown>;
type AppTranslation = {
  i18n: typeof i18n;
  t: (key: string, options?: TranslationOptions) => string;
};
type ResourceTree = Record<string, unknown>;
type NextopAppContextValue = {
  locale?: unknown;
  language?: unknown;
};
type NextopAppContext = NextopAppContextValue & {
  get?: () =>
    | Promise<NextopAppContextValue | null>
    | NextopAppContextValue
    | null;
  subscribe?: (
    listener: (context: NextopAppContextValue | null) => void,
  ) => (() => void) | undefined;
};
type NextopWindow = Window & {
  nextop?: {
    appContext?: NextopAppContext;
  };
  nextopAppContext?: NextopAppContext;
};

const useUntypedTranslation = useTranslation as unknown as (
  namespace?: AppNamespace | AppNamespace[],
) => AppTranslation;
const I18nHydrationContext = createContext(true);

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    defaultNS: defaultNamespace,
    fallbackLng: fallbackLocale,
    interpolation: {
      escapeValue: false,
    },
    lng: defaultLocale,
    ns: namespaces,
    react: {
      useSuspense: false,
    },
    resources,
    supportedLngs: ["zh-CN", "en"],
  });
}

i18n.on("languageChanged", (locale) => {
  if (locale === "zh-CN" || locale === "en") {
    persistLocalePreference(locale);
  }
});

export {
  AIMC_LOCALE_COOKIE_NAME,
  AIMC_LOCALE_STORAGE_KEY,
  detectInitialLocale,
  persistLocalePreference,
  supportedLocales,
  type AppLocale,
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    function handleLanguageChanged(localeValue: string) {
      const locale = normalizeLocale(localeValue);
      if (locale) {
        syncDocumentLanguage(locale);
      }
    }

    handleLanguageChanged(i18n.resolvedLanguage ?? i18n.language);
    i18n.on("languageChanged", handleLanguageChanged);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const locale = detectInitialLocale();
    const finishHydration = () => {
      if (isCurrent) {
        setIsHydrated(true);
      }
    };

    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale).finally(() => {
        syncDocumentLanguage(locale);
        finishHydration();
      });
    } else {
      syncDocumentLanguage(locale);
      finishHydration();
    }

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let isCurrent = true;
    const appContext = getHostAppContext();

    function applyHostLocale(context: NextopAppContextValue | null) {
      const locale = readHostLocale(context);
      if (locale && isCurrent && i18n.language !== locale) {
        void i18n.changeLanguage(locale);
      }
    }

    if (!appContext) {
      return undefined;
    }

    if (typeof appContext.get === "function") {
      void Promise.resolve(appContext.get())
        .then(applyHostLocale)
        .catch(() => undefined);
    } else {
      applyHostLocale(appContext);
    }

    const unsubscribe =
      typeof appContext.subscribe === "function"
        ? appContext.subscribe(applyHostLocale)
        : undefined;

    return () => {
      isCurrent = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return (
    <I18nHydrationContext.Provider value={isHydrated}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </I18nHydrationContext.Provider>
  );
}

export function useAppTranslation(namespace?: AppNamespace | AppNamespace[]) {
  const translation = useUntypedTranslation(namespace);
  const isHydrated = useContext(I18nHydrationContext);
  const renderedLocale = isHydrated
    ? (normalizeLocale(
        translation.i18n.resolvedLanguage ?? translation.i18n.language,
      ) ?? defaultLocale)
    : defaultLocale;

  useEffect(() => {
    syncDocumentLanguage(renderedLocale);
  }, [renderedLocale]);
  syncDocumentLanguage(renderedLocale);

  if (isHydrated) {
    return translation;
  }

  return {
    ...translation,
    t: (key: string, options?: TranslationOptions) =>
      translateFromResources(defaultLocale, namespace, key, options),
  };
}

export { i18n };

function translateFromResources(
  locale: AppLocale,
  namespace: AppNamespace | AppNamespace[] | undefined,
  key: string,
  options?: TranslationOptions,
) {
  const { keyPath, namespaceName } = resolveTranslationKey(
    namespace,
    key,
    options,
  );
  const value = getNestedValue(resources[locale][namespaceName], keyPath);
  const fallback =
    typeof options?.defaultValue === "string" ? options.defaultValue : key;

  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, optionName) => {
    const replacement = options?.[optionName];
    if (replacement === undefined || replacement === null) {
      return placeholder;
    }
    return String(replacement);
  });
}

function resolveTranslationKey(
  namespace: AppNamespace | AppNamespace[] | undefined,
  key: string,
  options?: TranslationOptions,
) {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex > 0) {
    const namespaceName = key.slice(0, separatorIndex);
    if (isAppNamespace(namespaceName)) {
      return {
        keyPath: key.slice(separatorIndex + 1),
        namespaceName,
      };
    }
  }

  const optionNamespace = options?.ns;
  if (typeof optionNamespace === "string" && isAppNamespace(optionNamespace)) {
    return {
      keyPath: key,
      namespaceName: optionNamespace,
    };
  }

  const namespaceName = Array.isArray(namespace)
    ? (namespace[0] ?? defaultNamespace)
    : (namespace ?? defaultNamespace);

  return {
    keyPath: key,
    namespaceName,
  };
}

function isAppNamespace(value: string): value is AppNamespace {
  return namespaces.includes(value as AppNamespace);
}

function getNestedValue(tree: ResourceTree, keyPath: string) {
  return keyPath.split(".").reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === "object" && segment in current) {
      return (current as ResourceTree)[segment];
    }
    return undefined;
  }, tree);
}

function getHostAppContext() {
  const hostWindow = window as NextopWindow;
  return hostWindow.nextop?.appContext || hostWindow.nextopAppContext || null;
}

function readHostLocale(context: NextopAppContextValue | null | undefined) {
  if (typeof context?.locale === "string" && context.locale.trim()) {
    return normalizeLocale(context.locale);
  }
  if (typeof context?.language === "string" && context.language.trim()) {
    return normalizeLocale(context.language);
  }
  return null;
}
