import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

const contextMenuCss = fs.readFileSync(
  path.resolve(__dirname, "../src/app/globals.css"),
  "utf8",
);

describe("canvas context menu", () => {
  it("hides advanced Excalidraw actions from the right-click menu", () => {
    const hiddenActions = [
      "copyStyles",
      "pasteStyles",
      "wrapSelectionInFrame",
      "copyAsSvg",
      "addToLibrary",
      "sendBackward",
      "bringForward",
      "sendToBack",
      "bringToFront",
      "flipHorizontal",
      "flipVertical",
      "hyperlink",
      "copyElementLink",
      "toggleElementLock",
    ];

    for (const actionName of hiddenActions) {
      expect(contextMenuCss).toContain(`li[data-testid="${actionName}"]`);
    }
  });

  it("renames the PNG clipboard action to Copy image", () => {
    expect(contextMenuCss).toContain('li[data-testid="copyAsPng"]');
    expect(contextMenuCss).toContain('content: "Copy image"');
  });

  it("draws AIMC section dividers for retained menu groups", () => {
    expect(contextMenuCss).toContain("li.aimc-context-menu-section-start");
    expect(contextMenuCss).toContain("rgba(17, 24, 39, 0.22)");
  });

  it("normalizes native Excalidraw context-menu hover state to AIMC menu tokens", () => {
    expect(contextMenuCss).toContain(".excalidraw .context-menu");
    expect(contextMenuCss).toContain("--aimc-context-menu-hover");
    expect(contextMenuCss).toContain("--aimc-context-menu-destructive-hover");
    expect(contextMenuCss).toContain("background: var(--popover)");
    expect(contextMenuCss).toContain("color: var(--popover-foreground)");
    expect(contextMenuCss).toContain(".context-menu-item:hover");
    expect(contextMenuCss).toContain(
      "background: var(--aimc-context-menu-hover)",
    );
    expect(contextMenuCss).toContain("color: var(--foreground)");
  });

  it("keeps native Excalidraw destructive actions red", () => {
    expect(contextMenuCss).toContain(
      'li[data-testid="deleteSelectedElements"]',
    );
    expect(contextMenuCss).toContain(".context-menu-item.dangerous");
    expect(contextMenuCss).toContain("color: var(--destructive)");
    expect(contextMenuCss).toContain(
      "background: var(--aimc-context-menu-destructive-hover)",
    );
  });
});
