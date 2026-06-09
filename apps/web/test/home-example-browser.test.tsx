// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeExampleBrowser } from "../src/components/home-example-browser";
import { i18n } from "../src/i18n";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";

describe("HomeExampleBrowser", () => {
  beforeEach(() => {
    void i18n.changeLanguage("zh-CN");
  });

  it("localizes category chips and uses an abstract icon for visual concepts", () => {
    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={vi.fn()}
      />,
    );

    const visualConcepts = screen.getByRole("button", {
      name: "视觉概念",
    });

    expect(
      visualConcepts.querySelector(".lucide-sparkles"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插画" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Illustration" }),
    ).not.toBeInTheDocument();
  });
});
