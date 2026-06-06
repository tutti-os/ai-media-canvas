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
  });
});
