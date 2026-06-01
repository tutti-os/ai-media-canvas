// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileSection } from "../src/components/profile-section";

describe("ProfileSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("disables save when the trimmed display name becomes empty", async () => {
    render(
      <ProfileSection
        displayName="Settings Verify UI 3"
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByLabelText("Display Name");
    await userEvent.clear(input);
    await userEvent.type(input, "   ");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
