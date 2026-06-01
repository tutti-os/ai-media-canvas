import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerBaseUrl, loadWebEnv } from "../src/lib/env";

describe("@aimc/web env helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
