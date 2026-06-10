import { describe, expect, it } from "vitest";

import { cliCommandOutputSchema } from "./nextop-cli-contracts.js";

describe("nextop CLI output contracts", () => {
  it("accepts json outputs", () => {
    expect(
      cliCommandOutputSchema.parse({
        kind: "json",
        value: { ok: true },
      }),
    ).toEqual({
      kind: "json",
      value: { ok: true },
    });
  });

  it("accepts table outputs", () => {
    expect(
      cliCommandOutputSchema.parse({
        kind: "table",
        columns: [{ key: "id", label: "ID" }],
        rows: [{ id: "project-1" }],
      }),
    ).toEqual({
      kind: "table",
      columns: [{ key: "id", label: "ID" }],
      rows: [{ id: "project-1" }],
    });
  });

  it("accepts error outputs", () => {
    expect(
      cliCommandOutputSchema.parse({
        kind: "error",
        error: {
          code: "project_not_found",
          message: "Project not found.",
        },
      }),
    ).toEqual({
      kind: "error",
      error: {
        code: "project_not_found",
        message: "Project not found.",
      },
    });
  });

  it("rejects invalid output shapes", () => {
    expect(() =>
      cliCommandOutputSchema.parse({
        kind: "table",
        rows: [],
      }),
    ).toThrow();
  });
});
