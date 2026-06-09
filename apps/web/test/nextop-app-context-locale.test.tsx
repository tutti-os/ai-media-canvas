// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIMC_LOCALE_STORAGE_KEY, I18nProvider, i18n } from "../src/i18n";

type HostContext = {
  locale?: string;
  language?: string;
};

type HostAppContext = {
  get?: () => Promise<HostContext> | HostContext;
  subscribe?: (listener: (context: HostContext) => void) => () => void;
};

function setHostAppContext(appContext: HostAppContext | undefined) {
  const hostWindow = window as Window & {
    nextop?: { appContext?: HostAppContext };
    nextopAppContext?: HostAppContext;
  };

  if (appContext) {
    hostWindow.nextop = { appContext };
    return;
  }

  hostWindow.nextop = undefined;
  hostWindow.nextopAppContext = undefined;
}

describe("Nextop host app context locale", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    void i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    setHostAppContext(undefined);
    window.localStorage.clear();
    document.documentElement.lang = "";
    cleanup();
  });

  it("ignores URL locale parameters when detecting the initial locale", async () => {
    window.history.replaceState({}, "", "/home?locale=zh-CN&lang=zh-CN");
    window.localStorage.setItem(AIMC_LOCALE_STORAGE_KEY, "en");
    document.documentElement.lang = "";

    render(
      <I18nProvider>
        <div>content</div>
      </I18nProvider>,
    );

    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  });

  it("reads and subscribes to the host app context locale", async () => {
    let localeListener: ((context: HostContext) => void) | undefined;
    const unsubscribe = vi.fn();
    setHostAppContext({
      get: vi.fn().mockResolvedValue({ locale: "zh-CN" }),
      subscribe: vi.fn((listener) => {
        localeListener = listener;
        return unsubscribe;
      }),
    });

    const result = render(
      <I18nProvider>
        <div>content</div>
      </I18nProvider>,
    );

    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));

    act(() => {
      localeListener?.({ language: "en" });
    });

    await waitFor(() => expect(document.documentElement.lang).toBe("en"));

    result.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

function installMemoryLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}
