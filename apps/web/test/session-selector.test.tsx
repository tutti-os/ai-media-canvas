// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionSelector } from "../src/components/session-selector";
import { i18n } from "../src/i18n";

describe("SessionSelector", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("localizes service default New chat session titles", async () => {
    render(
      <SessionSelector
        sessions={[
          {
            id: "session-1",
            title: " New   chat ",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
        activeSessionId="session-1"
        onDelete={vi.fn()}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "打开历史对话" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "打开历史对话" }));

    expect(screen.getAllByText("新建对话")).not.toHaveLength(0);
    expect(screen.queryByText("New chat")).not.toBeInTheDocument();
  });
});
