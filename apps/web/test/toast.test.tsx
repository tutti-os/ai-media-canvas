// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ToastProvider, useToast } from "../src/components/toast";

function ToastHarness() {
  const { success } = useToast();

  return (
    <button type="button" onClick={() => success("Done")}>
      Show toast
    </button>
  );
}

describe("ToastProvider", () => {
  it("renders app toasts from the top center", async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Show toast" }));

    const toast = screen.getByText("Done");
    expect(toast).toBeInTheDocument();
    expect(toast.parentElement).toHaveClass("top-6");
    expect(toast.parentElement).not.toHaveClass("bottom-6");
  });
});
