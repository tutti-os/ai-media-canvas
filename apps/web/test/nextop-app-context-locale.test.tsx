// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../src/components/providers";

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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    setHostAppContext(undefined);
    document.documentElement.lang = "en";
    cleanup();
  });

  it("uses English by default without reading locale from the URL", async () => {
    window.history.replaceState({}, "", "/home?locale=zh-CN&lang=zh-CN");
    document.documentElement.lang = "";

    render(
      <Providers>
        <div>content</div>
      </Providers>,
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
      <Providers>
        <div>content</div>
      </Providers>,
    );

    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));

    act(() => {
      localeListener?.({ language: "fr" });
    });

    expect(document.documentElement.lang).toBe("fr");

    result.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
