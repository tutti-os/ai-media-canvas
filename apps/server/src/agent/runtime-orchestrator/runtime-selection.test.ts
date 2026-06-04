import { describe, expect, it } from "vitest";

import { inferAimcRuntimeTarget } from "./runtime-selection.js";

describe("runtime selection", () => {
  it("keeps server-deepagent as the default runtime", () => {
    expect(
      inferAimcRuntimeTarget({
        availableRuntimeTargets: [
          { kind: "server-deepagent" },
          { kind: "local-agent", provider: "codex" },
        ],
        model: "gpt-4.1",
        requestedRuntimeKind: undefined,
      }),
    ).toEqual({ kind: "server-deepagent" });
  });

  it("routes to local codex only when explicitly requested", () => {
    expect(
      inferAimcRuntimeTarget({
        availableRuntimeTargets: [
          { kind: "server-deepagent" },
          { kind: "local-agent", provider: "codex" },
        ],
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-agent",
        requestedRuntimeProvider: "codex",
      }),
    ).toEqual({ kind: "local-agent", provider: "codex" });
  });

  it("fills the only local provider when a legacy request omits it", () => {
    expect(
      inferAimcRuntimeTarget({
        availableRuntimeTargets: [
          { kind: "server-deepagent" },
          { kind: "local-agent", provider: "codex" },
        ],
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-agent",
      }),
    ).toEqual({ kind: "local-agent", provider: "codex" });
  });
});
