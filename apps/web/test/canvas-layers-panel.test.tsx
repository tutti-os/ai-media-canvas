import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasLayersPanel } from "../src/components/canvas-layers-panel";

describe("CanvasLayersPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists layers without inactive lock or visibility actions", () => {
    const updateScene = vi.fn();
    const api = {
      getSceneElements: () => [
        {
          id: "shape-1",
          type: "rectangle",
          isDeleted: false,
        },
      ],
      getFiles: () => ({}),
      getAppState: () => ({ selectedElementIds: {} }),
      onChange: () => vi.fn(),
      updateScene,
    };

    render(<CanvasLayersPanel excalidrawApi={api} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Rectangle/ }));

    expect(screen.queryByLabelText("Lock layer")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Toggle layer visibility"),
    ).not.toBeInTheDocument();
    expect(updateScene).toHaveBeenCalledWith({
      appState: { selectedElementIds: { "shape-1": true } },
    });
  });
});
