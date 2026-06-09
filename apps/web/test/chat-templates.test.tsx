// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatTemplates } from "../src/components/chat-templates";
import { i18n } from "../src/i18n";

describe("ChatTemplates", () => {
  beforeEach(() => {
    void i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Chinese local template copy by default", () => {
    render(<ChatTemplates onSend={vi.fn()} />);

    expect(screen.getByText("试试这些本地创作模板")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "社媒轮播图" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Social Carousel" }),
    ).not.toBeInTheDocument();
  });

  it("renders English template copy and sends English prompts", async () => {
    await i18n.changeLanguage("en");
    const onSend = vi.fn();

    render(<ChatTemplates onSend={onSend} />);

    expect(
      screen.getByText("Try these local creation templates"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "社媒轮播图" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Social Carousel" }),
    );

    expect(onSend).toHaveBeenCalledWith(
      "Design a cohesive social media carousel with a cover and multiple inner slides.",
    );
  });
});
