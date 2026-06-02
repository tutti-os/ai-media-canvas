// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "../src/app/(workspace)/settings/page";

const { fetchViewerMock, updateProfileMock } = vi.hoisted(() => ({
  fetchViewerMock: vi.fn(),
  updateProfileMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchViewer: fetchViewerMock,
  updateProfile: updateProfileMock,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    fetchViewerMock.mockReset();
    updateProfileMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a retry state instead of rendering blank when the initial load fails", async () => {
    fetchViewerMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        profile: {
          id: "viewer-1",
          email: "local@aimc.app",
          displayName: "Local User",
        },
      });

    render(<SettingsPage />);

    await screen.findByText("Failed to load local settings. Please try again.");
    const retryButton = screen.getByRole("button", { name: "Retry" });
    await userEvent.click(retryButton);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Local User")).toBeInTheDocument(),
    );
  });
});
