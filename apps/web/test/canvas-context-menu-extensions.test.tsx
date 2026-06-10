// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasContextMenuExtensions } from "../src/components/canvas-context-menu-extensions";
import { ToastProvider } from "../src/components/toast";
import { i18n } from "../src/i18n";

const { exportToBlobMock } = vi.hoisted(() => ({
  exportToBlobMock: vi.fn(),
}));

vi.mock("@excalidraw/excalidraw", () => ({
  exportToBlob: exportToBlobMock,
}));

describe("CanvasContextMenuExtensions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    exportToBlobMock.mockReset();
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

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={{}} />
      </ToastProvider>,
    );

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

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={{}} />
      </ToastProvider>,
    );

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
          <li data-testid="copyAsPng">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy to clipboard as PNG</div>
            </button>
          </li>
          <li>
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy link to object</div>
            </button>
          </li>
          <li data-testid="duplicateSelection">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Duplicate</div>
            </button>
          </li>
        </ul>
      </div>
    `;

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={{}} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("裁剪图片").closest("li")).toHaveClass(
        "aimc-context-menu-section-start",
      );
    });

    expect(screen.getByText("用画框包裹选区")).toBeInTheDocument();
    expect(screen.getByText("复制图片").closest("li")).not.toBeVisible();
    expect(screen.getByText("复制对象链接")).toBeInTheDocument();
    expect(screen.getByText("复制节点").closest("li")).toHaveClass(
      "aimc-context-menu-section-start",
    );
    expect(screen.getByText("Cut").closest("li")).not.toHaveClass(
      "aimc-context-menu-section-start",
    );
  });

  it("copies selected images as PNG without triggering the native PNG copy action", async () => {
    const user = userEvent.setup();
    const copyAsPngClick = vi.fn();
    const keydownEvents: KeyboardEvent[] = [];
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const pngBlob = new Blob(["png"], { type: "image/png" });
    class TestClipboardItem {
      items: Record<string, Promise<Blob>>;

      constructor(items: Record<string, Promise<Blob>>) {
        this.items = items;
      }
    }

    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu">
          <li data-testid="copy">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">拷贝</div>
            </button>
          </li>
          <li data-testid="copyAsPng">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">复制为 PNG 到剪贴板</div>
            </button>
          </li>
        </ul>
      </div>
    `;
    document
      .querySelector('[data-testid="copyAsPng"] button')
      ?.addEventListener("click", copyAsPngClick);
    document.addEventListener("keydown", (event) => {
      keydownEvents.push(event);
    });
    exportToBlobMock.mockResolvedValue(pngBlob);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: clipboardWrite },
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: TestClipboardItem,
    });
    const imageElement = {
      id: "image-1",
      type: "image",
      isDeleted: false,
      x: 0,
      y: 0,
      width: 320,
      height: 320,
    };
    const excalidrawApi = {
      getAppState: () => ({
        selectedElementIds: { "image-1": true },
        viewBackgroundColor: "#ffffff",
      }),
      getFiles: () => ({}),
      getSceneElements: () => [imageElement],
    };

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={excalidrawApi} />
      </ToastProvider>,
    );

    await user.click(screen.getByText("拷贝"));

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
    });
    expect(copyAsPngClick).not.toHaveBeenCalled();
    expect(keydownEvents).toEqual([
      expect.objectContaining({ key: "Escape", code: "Escape" }),
    ]);
    expect(exportToBlobMock).toHaveBeenCalledWith({
      elements: [imageElement],
      appState: expect.objectContaining({ exportBackground: true }),
      files: {},
      mimeType: "image/png",
    });
    const clipboardItems = clipboardWrite.mock.calls[0][0] as TestClipboardItem[];
    await expect(clipboardItems[0].items["image/png"]).resolves.toBe(pngBlob);
    expect(screen.getByText("图片已复制")).toBeInTheDocument();
  });
});
