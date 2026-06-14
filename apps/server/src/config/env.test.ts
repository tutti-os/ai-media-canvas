import { describe, expect, it } from "vitest";

import { loadServerEnv } from "./env.js";

describe("loadServerEnv", () => {
  it("loads Tutti package runtime data root and package version overrides", () => {
    const env = loadServerEnv({}, {
      AIMC_APP_VERSION: "1.2.3",
      AIMC_DATA_ROOT: "/tmp/aimc-tutti-data",
    });

    expect(env.dataRoot).toBe("/tmp/aimc-tutti-data");
    expect(env.version).toBe("1.2.3");
  });

  it("loads Tutti managed app env", () => {
    const env = loadServerEnv(
      {},
      {
        TUTTI_API_BASE_URL: "https://tutti.example/api",
        TUTTI_APP_ID: "tutti-app",
        TUTTI_APP_INSTALLATION_ID: "tutti-installation",
        TUTTI_APP_SERVER_TOKEN: "tutti-token",
        TUTTI_WORKSPACE_ID: "tutti-workspace",
      },
    );

    expect(env.tuttiApiBaseUrl).toBe("https://tutti.example/api");
    expect(env.tuttiAppId).toBe("tutti-app");
    expect(env.tuttiAppInstallationId).toBe("tutti-installation");
    expect(env.tuttiAppServerToken).toBe("tutti-token");
    expect(env.tuttiWorkspaceId).toBe("tutti-workspace");
  });

  it("loads Kie provider credentials and endpoint overrides", () => {
    const env = loadServerEnv(
      {},
      {
        AIMC_KIE_API_KEY: "env-kie-key",
        AIMC_KIE_BASE_URL: "https://kie-api.example",
        AIMC_KIE_UPLOAD_BASE_URL: "https://kie-upload.example",
      },
    );

    expect(env.kieApiKey).toBe("env-kie-key");
    expect(env.kieBaseUrl).toBe("https://kie-api.example");
    expect(env.kieUploadBaseUrl).toBe("https://kie-upload.example");
  });
});
