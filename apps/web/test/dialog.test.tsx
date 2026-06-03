// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog, DialogContent } from "../src/components/ui/dialog";

describe("Dialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders overlay and popup above the desktop chat sidebar layer", () => {
    const { container } = render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>Settings</DialogContent>
      </Dialog>,
    );

    const overlay = container.ownerDocument.querySelector(
      '[data-slot="dialog-overlay"]',
    );
    const content = container.ownerDocument.querySelector(
      '[data-slot="dialog-content"]',
    );

    expect(overlay).toHaveClass("z-[200]");
    expect(content).toHaveClass("z-[200]");
  });
});
