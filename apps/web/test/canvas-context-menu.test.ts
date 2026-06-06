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
});
