// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasContextMenuExtensions } from "../src/components/canvas-context-menu-extensions";
import { i18n } from "../src/i18n";

describe("CanvasContextMenuExtensions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("adds a localized download image item to the native Excalidraw context menu", async () => {
    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu"></ul>
      </div>
    `;

    render(<CanvasContextMenuExtensions excalidrawApi={{}} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "下载图片" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "下载图片" }).closest("li"),
    ).toHaveClass("aimc-context-menu-section-start");
  });

  it("renders the download image item in English when the locale changes", async () => {
    await i18n.changeLanguage("en");
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

  it("localizes retained native menu labels and marks group dividers", async () => {
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
              <div class="context-menu-item__label">Wrap selection in frame</div>
            </button>
          </li>
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Crop image</div>
            </button>
          </li>
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy to clipboard as PNG</div>
            </button>
          </li>
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy link to object</div>
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
      expect(screen.getByText("裁剪图片").closest("li")).toHaveClass(
        "aimc-context-menu-section-start",
      );
    });

    expect(screen.getByText("用画框包裹选区")).toBeInTheDocument();
    expect(screen.getByText("复制图片")).toBeInTheDocument();
    expect(screen.getByText("复制对象链接")).toBeInTheDocument();
    expect(screen.getByText("复制").closest("li")).toHaveClass(
      "aimc-context-menu-section-start",
    );
    expect(screen.getByText("Cut").closest("li")).not.toHaveClass(
      "aimc-context-menu-section-start",
    );
  });
});
