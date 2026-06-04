import { describe, expect, it } from "vitest";

import { resolveResumeMode } from "./resume-context.js";

describe("resume context", () => {
  it("uses provider-local resume for the same runtime target", () => {
    expect(
      resolveResumeMode({
        previousRuntimeKind: "local-agent",
        previousRuntimeProvider: "codex",
        nextRuntimeKind: "local-agent",
        nextRuntimeProvider: "codex",
      }),
    ).toBe("provider-local");
  });

  it("uses handoff for cross-provider resume", () => {
    expect(
      resolveResumeMode({
        previousRuntimeKind: "local-agent",
        previousRuntimeProvider: "codex",
        nextRuntimeKind: "server-deepagent",
      }),
    ).toBe("handoff");
  });
});
