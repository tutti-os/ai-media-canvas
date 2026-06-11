// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasBottomBar } from "../src/components/canvas-bottom-bar";
import { i18n } from "../src/i18n";

describe("CanvasBottomBar", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("fits every canvas element into the current viewport", async () => {
    const scrollToContent = vi.fn();
    const excalidrawApi = {
      getAppState: () => ({
        zoom: { value: 1 },
        viewBackgroundColor: "#FFFFFF",
      }),
      onChange: () => vi.fn(),
      scrollToContent,
      updateScene: vi.fn(),
    };

    render(
      <CanvasBottomBar
        excalidrawApi={excalidrawApi}
        layersOpen={false}
        onToggleLayers={vi.fn()}
        filesOpen={false}
        onToggleFiles={vi.fn()}
        leftPanelOpen={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "100%" }));
    await userEvent.click(screen.getByRole("button", { name: "Fit all" }));

    expect(scrollToContent).toHaveBeenCalledWith(undefined, {
      animate: true,
      fitToViewport: true,
      viewportZoomFactor: 0.92,
    });
  });

  it("uses the same bottom offset as the primary canvas toolbar", () => {
    const { container } = render(
      <CanvasBottomBar
        excalidrawApi={null}
        layersOpen={false}
        onToggleLayers={vi.fn()}
        filesOpen={false}
        onToggleFiles={vi.fn()}
        leftPanelOpen={false}
      />,
    );

    expect(container.firstElementChild).toHaveClass("bottom-5");
  });

  it("keeps the auxiliary toolbar inside the available canvas width", () => {
    const { container } = render(
      <CanvasBottomBar
        excalidrawApi={null}
        layersOpen={true}
        onToggleLayers={vi.fn()}
        filesOpen={false}
        onToggleFiles={vi.fn()}
        leftPanelOpen={true}
      />,
    );

    expect(container.firstElementChild).toHaveStyle({
      left: "max(16px, min(296px, calc(100% - 227px)))",
      maxWidth: "calc(100% - 32px)",
    });
  });
});
