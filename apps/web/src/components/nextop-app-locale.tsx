"use client";

import { useEffect } from "react";

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

const DEFAULT_LOCALE = "en";

function readLocaleFromContext(
  context: NextopAppContextValue | null | undefined,
) {
  if (typeof context?.locale === "string" && context.locale.trim()) {
    return context.locale;
  }
  if (typeof context?.language === "string" && context.language.trim()) {
    return context.language;
  }
  return null;
}

function getHostAppContext() {
  const hostWindow = window as NextopWindow;
  return hostWindow.nextop?.appContext || hostWindow.nextopAppContext || null;
}

function applyDocumentLocale(locale: string | null | undefined) {
  document.documentElement.lang = locale || DEFAULT_LOCALE;
}

export function NextopAppLocale() {
  useEffect(() => {
    let active = true;
    const appContext = getHostAppContext();

    applyDocumentLocale(DEFAULT_LOCALE);

    if (!appContext) {
      return undefined;
    }

    if (typeof appContext.get === "function") {
      Promise.resolve(appContext.get())
        .then((context) => {
          if (active) {
            applyDocumentLocale(readLocaleFromContext(context));
          }
        })
        .catch(() => {
          if (active) {
            applyDocumentLocale(DEFAULT_LOCALE);
          }
        });
    } else {
      applyDocumentLocale(readLocaleFromContext(appContext));
    }

    const unsubscribe =
      typeof appContext.subscribe === "function"
        ? appContext.subscribe((context) => {
            if (active) {
              applyDocumentLocale(readLocaleFromContext(context));
            }
          })
        : undefined;

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return null;
}
