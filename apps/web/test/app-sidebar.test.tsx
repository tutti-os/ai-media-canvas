// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchViewerMock } = vi.hoisted(() => ({
  fetchViewerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
}));

vi.mock("../src/lib/server-api", () => ({
  fetchViewer: fetchViewerMock,
}));

import { AppSidebar } from "../src/components/app-sidebar";
import { i18n } from "../src/i18n";

describe("AppSidebar", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    fetchViewerMock.mockReset();
    fetchViewerMock.mockResolvedValue({
      profile: {
        id: "viewer-1",
        email: "local@aimc.app",
        displayName: "Local User",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the home and skills navigation entries plus the avatar settings trigger", async () => {
    render(<AppSidebar />);

    expect(screen.getAllByLabelText("Home").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Skills").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Brand Kit")).toHaveLength(0);
    expect(screen.getByRole("tooltip", { name: "Home" })).toBeInTheDocument();
    const skillsTooltip = screen.getByRole("tooltip", { name: "Skills" });
    expect(skillsTooltip).toHaveClass("opacity-0");
    await userEvent.hover(screen.getAllByLabelText("Skills")[0]!);
    expect(skillsTooltip).toHaveClass("opacity-100");
    const trigger = screen.getByLabelText("Open settings menu");
    expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);

    expect(await screen.findByText("Settings")).toBeInTheDocument();
  });
});
