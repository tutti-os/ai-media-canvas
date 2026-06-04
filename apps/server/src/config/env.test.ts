import { describe, expect, it } from "vitest";

import { loadServerEnv } from "./env.js";

describe("loadServerEnv", () => {
  it("loads Nextop package runtime data root and package version overrides", () => {
    const env = loadServerEnv({}, {
      AIMC_APP_VERSION: "1.2.3",
      AIMC_DATA_ROOT: "/tmp/aimc-nextop-data",
    });

    expect(env.dataRoot).toBe("/tmp/aimc-nextop-data");
    expect(env.version).toBe("1.2.3");
  });
});
