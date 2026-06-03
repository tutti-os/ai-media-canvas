// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomeExampleBrowser } from "../src/components/home-example-browser";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";

describe("HomeExampleBrowser", () => {
  it("uses an abstract icon for the Visual Concepts category", () => {
    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={vi.fn()}
      />,
    );

    const visualConcepts = screen.getByRole("button", {
      name: "Visual Concepts",
    });

    expect(
      visualConcepts.querySelector(".lucide-sparkles"),
    ).toBeInTheDocument();
  });
});
