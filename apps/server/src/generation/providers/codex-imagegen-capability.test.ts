import { afterEach, describe, expect, it } from "vitest";

import {
  type CodexImagegenCommandRunner,
  clearCodexImagegenCapabilityCache,
  compareSemver,
  detectCodexImagegenCapability,
  parseCodexVersion,
} from "./codex-imagegen-capability.js";

afterEach(() => {
  clearCodexImagegenCapabilityCache();
});

describe("detectCodexImagegenCapability", () => {
  it("reports disabled without probing Codex", () => {
    let calls = 0;
    const capability = detectCodexImagegenCapability({
      enabled: false,
      now: () => new Date("2026-06-15T00:00:00.000Z"),
      runCommand: () => {
        calls += 1;
        return "";
      },
      fileExists: () => true,
    });

    expect(calls).toBe(0);
    expect(capability).toMatchObject({
      ready: false,
      reasons: ["disabled"],
      checkedAt: "2026-06-15T00:00:00.000Z",
    });
  });

  it("reports missing Codex CLI", () => {
    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      runCommand: () => {
        throw new Error("not found");
      },
      fileExists: () => true,
    });

    expect(capability.ready).toBe(false);
    expect(capability.reasons).toContain("codex_not_found");
  });

  it("reports old Codex versions, auth failures, and missing skills", () => {
    const runCommand: CodexImagegenCommandRunner = (_command, args) => {
      if (args.join(" ") === "--version") return "codex 0.123.0";
      return "ok";
    };

    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      codexHome: "/tmp/codex-home",
      runCommand,
      fileExists: () => false,
    });

    expect(capability).toMatchObject({
      ready: false,
      codexVersion: "0.123.0",
      reasons: [
        "codex_version_too_old",
        "codex_not_logged_in",
        "imagegen_skill_missing",
      ],
    });
  });

  it("reports ready when all probes pass", () => {
    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      codexHome: "/tmp/codex-home",
      runCommand: (_command, args) =>
        args.join(" ") === "--version" ? "codex 0.124.0" : "ok",
      fileExists: (path) =>
        path === "/tmp/codex-home/auth.json" ||
        path === "/tmp/codex-home/skills/.system/imagegen/SKILL.md",
      readFile: () =>
        JSON.stringify({ tokens: { access_token: "access-token" } }),
    });

    expect(capability).toMatchObject({
      ready: true,
      reasons: [],
      codexVersion: "0.124.0",
      codexHome: "/tmp/codex-home",
    });
  });

  it("accepts API key auth stored in Codex auth.json", () => {
    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      codexHome: "/tmp/codex-home",
      runCommand: (_command, args) =>
        args.join(" ") === "--version" ? "codex 0.124.0" : "ok",
      fileExists: () => true,
      readFile: () => JSON.stringify({ OPENAI_API_KEY: "sk-test" }),
    });

    expect(capability.ready).toBe(true);
    expect(capability.reasons).not.toContain("codex_not_logged_in");
  });

  it("accepts API key auth from process env", () => {
    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      codexHome: "/tmp/codex-home",
      env: { OPENAI_API_KEY: "sk-env-test" },
      runCommand: (_command, args) =>
        args.join(" ") === "--version" ? "codex 0.124.0" : "ok",
      fileExists: (path) =>
        path === "/tmp/codex-home/skills/.system/imagegen/SKILL.md",
      readFile: () => {
        throw new Error("auth.json should not be required when env key exists");
      },
    });

    expect(capability.ready).toBe(true);
    expect(capability.reasons).not.toContain("codex_not_logged_in");
  });

  it("rejects empty or malformed auth files", () => {
    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      codexHome: "/tmp/codex-home",
      runCommand: (_command, args) =>
        args.join(" ") === "--version" ? "codex 0.124.0" : "ok",
      fileExists: () => true,
      readFile: () => JSON.stringify({ tokens: {} }),
    });

    expect(capability.ready).toBe(false);
    expect(capability.reasons).toContain("codex_not_logged_in");
  });

  it("probes exec with user config ignored", () => {
    const calls: string[] = [];
    const capability = detectCodexImagegenCapability({
      enabled: true,
      cacheTtlMs: 0,
      codexHome: "/tmp/codex-home",
      runCommand: (_command, args) => {
        calls.push(args.join(" "));
        return args.join(" ") === "--version" ? "codex 0.124.0" : "ok";
      },
      fileExists: () => true,
      readFile: () =>
        JSON.stringify({ tokens: { access_token: "access-token" } }),
    });

    expect(capability.ready).toBe(true);
    expect(calls).toContain("exec --ignore-user-config --full-auto --help");
    expect(calls).not.toContain("login status");
  });
});

describe("Codex Imagegen capability utilities", () => {
  it("parses Codex semver output", () => {
    expect(parseCodexVersion("codex-cli 0.124.1")).toBe("0.124.1");
    expect(parseCodexVersion("no version")).toBeUndefined();
  });

  it("compares semantic versions", () => {
    expect(compareSemver("0.124.0", "0.124.0")).toBe(0);
    expect(compareSemver("0.124.1", "0.124.0")).toBe(1);
    expect(compareSemver("0.123.9", "0.124.0")).toBe(-1);
  });
});
