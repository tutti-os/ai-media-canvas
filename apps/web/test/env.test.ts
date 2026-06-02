import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerBaseUrl, loadWebEnv } from "../src/lib/env";

describe("@aimc/web env helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("loads the explicit AIMC server base url", () => {
    const env = loadWebEnv(
      {},
      {
        AIMC_SERVER_BASE_URL: "http://localhost:4010",
      } as unknown as NodeJS.ProcessEnv,
    );

    expect(env).toEqual({
      serverBaseUrl: "http://localhost:4010",
    });
  });

  it("prefers the browser origin when no explicit AIMC server base url is set", () => {
    vi.stubEnv("AIMC_SERVER_BASE_URL", "");

    expect(getServerBaseUrl()).toBe("http://localhost:3000");
  });

  it("reads getServerBaseUrl from process env when configured", () => {
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:4020");

    expect(getServerBaseUrl()).toBe("http://localhost:4020");
  });

  it("prefers the public client env when available", () => {
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:4020");
    vi.stubEnv("NEXT_PUBLIC_AIMC_SERVER_BASE_URL", "http://localhost:4030");

    expect(getServerBaseUrl()).toBe("http://localhost:4030");
  });

  it("keeps the configured local API origin for loopback frontends on non-default ports", () => {
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://127.0.0.1:3001");
    vi.stubGlobal("window", {
      location: {
        origin: "http://127.0.0.1:3002",
      },
    } as Window & typeof globalThis);

    expect(getServerBaseUrl()).toBe("http://127.0.0.1:3001");
  });

  it("treats localhost and 127.0.0.1 as the same loopback family", () => {
    vi.stubEnv("AIMC_SERVER_BASE_URL", "http://localhost:3001");
    vi.stubGlobal("window", {
      location: {
        origin: "http://127.0.0.1:3002",
      },
    } as Window & typeof globalThis);

    expect(getServerBaseUrl()).toBe("http://localhost:3001");
  });
});
