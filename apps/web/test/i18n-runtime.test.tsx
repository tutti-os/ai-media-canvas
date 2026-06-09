// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AIMC_LOCALE_COOKIE_NAME,
  AIMC_LOCALE_STORAGE_KEY,
  I18nProvider,
  detectInitialLocale,
  i18n,
  persistLocalePreference,
  useAppTranslation,
} from "../src/i18n";

function Probe() {
  const { i18n, t } = useAppTranslation("settings");
  return (
    <div>
      <p data-testid="locale">{i18n.language}</p>
      <p>{t("general.languageLabel")}</p>
      <button type="button" onClick={() => void i18n.changeLanguage("en")}>
        switch
      </button>
      <button type="button" onClick={() => void i18n.changeLanguage("zh-CN")}>
        switch zh
      </button>
    </div>
  );
}

describe("web i18n runtime", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    document.cookie = `${AIMC_LOCALE_COOKIE_NAME}=; Max-Age=0; path=/`;
    void i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.cookie = `${AIMC_LOCALE_COOKIE_NAME}=; Max-Age=0; path=/`;
    document.documentElement.lang = "";
  });

  it("falls back to zh-CN when no saved or browser locale is available", () => {
    setNavigatorLanguage(null, []);

    expect(detectInitialLocale()).toBe("zh-CN");
  });

  it("prefers localStorage over cookie and browser language", () => {
    window.localStorage.setItem(AIMC_LOCALE_STORAGE_KEY, "en");
    document.cookie = `${AIMC_LOCALE_COOKIE_NAME}=zh-CN; path=/`;
    setNavigatorLanguage("zh-CN", ["zh-CN"]);

    expect(detectInitialLocale()).toBe("en");
  });

  it("persists locale to localStorage, cookie, and document language", () => {
    persistLocalePreference("en");

    expect(window.localStorage.getItem(AIMC_LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.cookie).toContain(`${AIMC_LOCALE_COOKIE_NAME}=en`);
    expect(document.documentElement.lang).toBe("en");
  });

  it("applies a saved locale after the provider hydrates", async () => {
    window.localStorage.setItem(AIMC_LOCALE_STORAGE_KEY, "en");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(await screen.findByText("Language")).toBeInTheDocument();
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches rendered copy through the provider", async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    await act(async () => {
      await screen.findByText("语言");
    });
    expect(screen.getByText("语言")).toBeInTheDocument();
    expect(screen.getByTestId("locale")).toHaveTextContent("zh-CN");

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "switch" }));
    });

    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(window.localStorage.getItem(AIMC_LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "switch zh" }));
    });

    expect(screen.getByText("语言")).toBeInTheDocument();
    expect(window.localStorage.getItem(AIMC_LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
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

function setNavigatorLanguage(language: string | null, languages: string[]) {
  Object.defineProperty(window, "navigator", {
    configurable: true,
    value: {
      language: language ?? "",
      languages,
    },
  });
}
