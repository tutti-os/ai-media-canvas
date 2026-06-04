import { describe, expect, it } from "vitest";

import { createRuntimeControlPlane, inferRuntimeKind } from "./runtime-control-plane.js";

function createRuntimeProvider(
  runtime: {
    id: string;
    kind: "server-deepagent" | "local-agent";
    provider?: "codex";
    mode: "server" | "local";
    status?: "online" | "offline" | "degraded";
    maxConcurrentRuns?: number;
  },
) {
  return {
    runtime: {
      capabilities: {
        cancel: true,
        nativeResume: runtime.kind === "local-agent",
        streaming: true,
        toolGateway: runtime.kind === "local-agent",
        maxConcurrentRuns: runtime.maxConcurrentRuns ?? 1,
      },
      lastSeenAt: "2026-06-04T00:00:00.000Z",
      status: runtime.status ?? "online",
      ...runtime,
    },
    async *streamRun() {
      yield {
        type: "run.completed" as const,
        runId: "run-1",
        timestamp: "2026-06-04T00:00:00.000Z",
      };
    },
  };
}

describe("runtime control plane", () => {
  it("defaults to the single registered runtime when no selector is provided", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "server-deepagent",
        kind: "server-deepagent",
        mode: "server",
      }),
    ]);

    expect(
      controlPlane.resolveRuntimeTarget({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: undefined,
      }),
    ).toEqual({ kind: "server-deepagent" });
  });

  it("throws when multiple runtimes are registered without a selector", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "server-deepagent",
        kind: "server-deepagent",
        mode: "server",
      }),
      createRuntimeProvider({
        id: "local-agent:codex",
        kind: "local-agent",
        mode: "local",
        provider: "codex",
      }),
    ]);

    expect(() =>
      controlPlane.resolveRuntimeTarget({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: undefined,
      }),
    ).toThrow("No runtime kind requested and no selector configured");
  });

  it("returns the requested runtime kind before applying fallback inference", () => {
    expect(
      inferRuntimeKind({
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

  it("does not schedule offline runtimes", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "server-deepagent",
        kind: "server-deepagent",
        mode: "server",
      }),
      createRuntimeProvider({
        id: "local-agent:codex",
        kind: "local-agent",
        mode: "local",
        provider: "codex",
        status: "offline",
      }),
    ]);

    expect(controlPlane.listRuntimeTargets()).toEqual([
      { kind: "server-deepagent" },
    ]);
    expect(() =>
      controlPlane.resolveRuntimeTarget({
        model: "codex:gpt-5.4",
        requestedRuntimeKind: "local-agent",
        requestedRuntimeProvider: "codex",
      }),
    ).toThrow("Runtime local-agent (codex) is offline");
  });

  it("enforces runtime concurrency through leases", () => {
    const controlPlane = createRuntimeControlPlane([
      createRuntimeProvider({
        id: "local-agent:codex",
        kind: "local-agent",
        mode: "local",
        provider: "codex",
        maxConcurrentRuns: 1,
      }),
    ]);

    const lease = controlPlane.acquireRuntimeLease(
      { kind: "local-agent", provider: "codex" },
      "run-1",
    );

    expect(() =>
      controlPlane.acquireRuntimeLease(
        { kind: "local-agent", provider: "codex" },
        "run-2",
      ),
    ).toThrow("Runtime local-agent (codex) is at capacity");

    lease.release();

    expect(() =>
      controlPlane.acquireRuntimeLease(
        { kind: "local-agent", provider: "codex" },
        "run-2",
      ),
    ).not.toThrow();
  });

  it("updates runtime health metadata", () => {
    const controlPlane = createRuntimeControlPlane(
      [
        createRuntimeProvider({
          id: "local-agent:codex",
          kind: "local-agent",
          mode: "local",
          provider: "codex",
        }),
      ],
      {
        now: () => "2026-06-04T12:34:56.000Z",
      },
    );

    const runtime = controlPlane.updateRuntimeStatus(
      { kind: "local-agent", provider: "codex" },
      "degraded",
    );

    expect(runtime.status).toBe("degraded");
    expect(runtime.lastSeenAt).toBe("2026-06-04T12:34:56.000Z");
  });
});
