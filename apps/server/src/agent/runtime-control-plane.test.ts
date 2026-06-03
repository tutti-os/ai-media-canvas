import { describe, expect, it } from "vitest";

import { createRuntimeControlPlane, inferRuntimeKind } from "./runtime-control-plane.js";

describe("runtime control plane", () => {
  it("defaults to the single registered runtime when no selector is provided", () => {
    const controlPlane = createRuntimeControlPlane([
      {
        kind: "server-deepagent" as const,
        async *streamRun() {
          yield {
            type: "run.completed" as const,
            runId: "run-1",
            timestamp: "2026-06-04T00:00:00.000Z",
          };
        },
      },
    ]);

    expect(
      controlPlane.resolveRuntimeKind({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: undefined,
      }),
    ).toBe("server-deepagent");
  });

  it("throws when multiple runtimes are registered without a selector", () => {
    const controlPlane = createRuntimeControlPlane([
      {
        kind: "server-deepagent" as const,
        async *streamRun() {},
      },
      {
        kind: "local-codex" as const,
        async *streamRun() {},
      },
    ]);

    expect(() =>
      controlPlane.resolveRuntimeKind({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: undefined,
      }),
    ).toThrow("No runtime kind requested and no selector configured");
  });

  it("returns the requested runtime kind before applying fallback inference", () => {
    expect(
      inferRuntimeKind({
        availableRuntimeKinds: ["server-deepagent", "local-codex"],
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-codex",
      }),
    ).toBe("local-codex");
  });
});
