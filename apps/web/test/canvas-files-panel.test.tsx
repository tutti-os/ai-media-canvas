// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasFilesPanel } from "../src/components/canvas-files-panel";
import { ToastProvider } from "../src/components/toast";
import { i18n } from "../src/i18n";

describe("CanvasFilesPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a success toast after downloading a generated file", async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const excalidrawApi = {
      getSceneElements: () => [
        {
          id: "image-1",
          type: "image",
          isDeleted: false,
          fileId: "file-1",
          customData: {
            source: "generated",
            title: "Generated image",
          },
        },
      ],
      getFiles: () => ({
        "file-1": {
          dataURL: "data:image/png;base64,cG5n",
        },
      }),
      onChange: () => vi.fn(),
    };

    render(
      <ToastProvider>
        <CanvasFilesPanel
          excalidrawApi={excalidrawApi}
          open={true}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Download Generated image" }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Downloaded Generated image")).toBeInTheDocument();
  });
});
