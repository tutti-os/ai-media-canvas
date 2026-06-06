// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasContextMenuExtensions } from "../src/components/canvas-context-menu-extensions";

describe("CanvasContextMenuExtensions", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("adds a Download image item to the native Excalidraw context menu", async () => {
    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu"></ul>
      </div>
    `;

    render(<CanvasContextMenuExtensions excalidrawApi={{}} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download image" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Download image" }).closest("li"),
    ).toHaveClass("aimc-context-menu-section-start");
  });

  it("marks retained native menu groups with section dividers", async () => {
    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu">
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Cut</div>
            </button>
          </li>
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Crop image</div>
            </button>
          </li>
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Duplicate</div>
            </button>
          </li>
        </ul>
      </div>
    `;

    render(<CanvasContextMenuExtensions excalidrawApi={{}} />);

    await waitFor(() => {
      expect(screen.getByText("Crop image").closest("li")).toHaveClass(
        "aimc-context-menu-section-start",
      );
    });

    expect(screen.getByText("Duplicate").closest("li")).toHaveClass(
      "aimc-context-menu-section-start",
    );
    expect(screen.getByText("Cut").closest("li")).not.toHaveClass(
      "aimc-context-menu-section-start",
    );
  });
});
