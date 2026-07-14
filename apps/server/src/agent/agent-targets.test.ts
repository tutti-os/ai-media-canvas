import type { LocalAgentTargetInfo } from "@aimc/shared";
import { describe, expect, it } from "vitest";

import {
  isCatalogProviderAddressable,
  resolveAgentTargetFromCatalog,
} from "./agent-targets.js";

function target(
  agentTargetId: string,
  providerId: string,
  available = true,
): LocalAgentTargetInfo {
  return {
    agentTargetId,
    providerId,
    displayName: agentTargetId,
    available,
    runtimeSupported: true,
    isDefault: false,
    models: [],
  };
}

describe("resolveAgentTargetFromCatalog", () => {
  const targets = [
    target("team:designer", "codex"),
    target("team:reviewer", "codex"),
    target("team:writer", "claude-code"),
  ];

  it("selects exact targets even when identities share a provider", () => {
    expect(
      resolveAgentTargetFromCatalog(targets, "team:designer", {
        agentTargetId: "team:reviewer",
      }),
    ).toEqual({ agentTargetId: "team:reviewer", providerId: "codex" });
  });

  it("fails closed for ambiguous deprecated provider input", () => {
    expect(() =>
      resolveAgentTargetFromCatalog(targets, "team:designer", {
        providerId: "codex",
      }),
    ).toThrow("Multiple agents use provider codex");
  });

  it("maps deprecated provider input only when globally unique", () => {
    expect(
      resolveAgentTargetFromCatalog(targets, "team:designer", {
        providerId: "claude-code",
      }),
    ).toEqual({ agentTargetId: "team:writer", providerId: "claude-code" });
  });

  it("does not run unavailable exact targets", () => {
    expect(() =>
      resolveAgentTargetFromCatalog(
        [target("team:offline", "other", false)],
        null,
        { agentTargetId: "team:offline" },
      ),
    ).toThrow("unavailable");
  });

  it("fails closed at the catalog boundary for ambiguous provider compatibility", () => {
    const agents = [
      {
        agentTargetId: "team:designer",
        providerId: "codex",
        displayName: "Designer",
        availability: { status: "available" as const },
        runtimeSupported: true,
      },
      {
        agentTargetId: "team:reviewer",
        providerId: "codex",
        displayName: "Reviewer",
        availability: { status: "available" as const },
        runtimeSupported: true,
      },
    ];

    expect(
      isCatalogProviderAddressable(
        { agents, cliContract: "provider-compat" },
        "codex",
      ),
    ).toBe(false);
    expect(
      isCatalogProviderAddressable(
        { agents, cliContract: "agent-id" },
        "codex",
      ),
    ).toBe(true);
  });
});
