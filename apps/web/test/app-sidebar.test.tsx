// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
}));

import { AppSidebar } from "../src/components/app-sidebar";

describe("AppSidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the home and skills navigation entries", () => {
    render(<AppSidebar />);

    expect(screen.getAllByLabelText("Home").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Skills").length).toBeGreaterThan(0);
  });
});
