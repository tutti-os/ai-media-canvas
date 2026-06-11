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

  it("closes the native menu immediately when downloading an image", async () => {
    const user = userEvent.setup();
    const keydownEvents: KeyboardEvent[] = [];
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

    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu"></ul>
      </div>
    `;
    document.addEventListener("keydown", (event) => {
      keydownEvents.push(event);
    });
    exportToBlobMock.mockReturnValue(new Promise<Blob>(() => {}));

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={excalidrawApi} />
      </ToastProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "下载图片" }));

    expect(keydownEvents).toEqual([
      expect.objectContaining({ key: "Escape", code: "Escape" }),
    ]);
    expect(exportToBlobMock).toHaveBeenCalledWith({
      elements: [imageElement],
      appState: expect.objectContaining({ exportBackground: true }),
      files: {},
      mimeType: "image/png",
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

  it("hides native copy image when there is no image-only selection", async () => {
    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu">
          <li data-testid="copy">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy image</div>
            </button>
          </li>
        </ul>
      </div>
    `;
    const excalidrawApi = {
      getAppState: () => ({
        selectedElementIds: {},
        viewBackgroundColor: "#ffffff",
      }),
      getFiles: () => ({}),
      getSceneElements: () => [
        {
          id: "image-1",
          type: "image",
          isDeleted: false,
          x: 0,
          y: 0,
          width: 320,
          height: 320,
        },
      ],
    };

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={excalidrawApi} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("复制图片").closest("li")).not.toBeVisible();
    });
  });

  it("copies selected images as PNG without triggering the native PNG copy action", async () => {
    const user = userEvent.setup();
    const nativeCopyClick = vi.fn();
    const copyAsPngClick = vi.fn();
    const keydownEvents: KeyboardEvent[] = [];
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const pngBlob = new Blob(["png"], { type: "image/png" });
    class TestClipboardItem {
      items: Record<string, Blob>;

      constructor(items: Record<string, Blob>) {
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
      .querySelector('[data-testid="copy"] button')
      ?.addEventListener("click", nativeCopyClick);
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
    expect(nativeCopyClick).not.toHaveBeenCalled();
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
    const clipboardItems = clipboardWrite.mock
      .calls[0][0] as TestClipboardItem[];
    expect(clipboardItems[0].items["image/png"]).toBe(pngBlob);
    expect(screen.getByText("图片已复制")).toBeInTheDocument();
  });

  it("copies a single uncropped image from the original file data without resampling the canvas selection", async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const originalBlob = new Blob(["original"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => originalBlob,
    });
    class TestClipboardItem {
      items: Record<string, Blob>;

      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }

    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu">
          <li data-testid="copy">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy image</div>
            </button>
          </li>
        </ul>
      </div>
    `;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: clipboardWrite },
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: TestClipboardItem,
    });
    vi.stubGlobal("fetch", fetchMock);

    const excalidrawApi = {
      getAppState: () => ({
        selectedElementIds: { "image-1": true },
      }),
      getFiles: () => ({
        "file-1": { dataURL: "data:image/png;base64,b3JpZ2luYWw=" },
      }),
      getSceneElements: () => [
        {
          id: "image-1",
          type: "image",
          fileId: "file-1",
          isDeleted: false,
          x: 0,
          y: 0,
          width: 120,
          height: 120,
        },
      ],
    };

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={excalidrawApi} />
      </ToastProvider>,
    );

    await user.click(await screen.findByText("复制图片"));

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "data:image/png;base64,b3JpZ2luYWw=",
    );
    expect(exportToBlobMock).not.toHaveBeenCalled();
    const clipboardItems = clipboardWrite.mock
      .calls[0][0] as TestClipboardItem[];
    expect(clipboardItems[0].items["image/png"]).toBe(originalBlob);
  });

  it("copies a cropped image by rendering only the crop rectangle on a transparent canvas", async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const croppedBlob = new Blob(["cropped"], { type: "image/png" });
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => callback(croppedBlob));
    const originalCreateElement = document.createElement.bind(document);
    class TestClipboardItem {
      items: Record<string, Blob>;

      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }
    class TestImage {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    document.body.innerHTML = `
      <div class="excalidraw">
        <ul class="context-menu">
          <li data-testid="copy">
            <button type="button" class="context-menu-item">
              <div class="context-menu-item__label">Copy image</div>
            </button>
          </li>
        </ul>
      </div>
    `;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: clipboardWrite },
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: TestClipboardItem,
    });
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: TestImage,
    });
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ clearRect, drawImage }),
          toBlob,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const excalidrawApi = {
      getAppState: () => ({
        selectedElementIds: { "image-1": true },
      }),
      getFiles: () => ({
        "file-1": { dataURL: "data:image/png;base64,Y3JvcA==" },
      }),
      getSceneElements: () => [
        {
          id: "image-1",
          type: "image",
          fileId: "file-1",
          isDeleted: false,
          x: 0,
          y: 0,
          width: 120,
          height: 120,
          crop: { x: 20, y: 30, width: 200, height: 150 },
        },
      ],
    };

    render(
      <ToastProvider>
        <CanvasContextMenuExtensions excalidrawApi={excalidrawApi} />
      </ToastProvider>,
    );

    await user.click(await screen.findByText("复制图片"));

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
    });
    expect(clearRect).toHaveBeenCalledWith(0, 0, 200, 150);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(TestImage),
      20,
      30,
      200,
      150,
      0,
      0,
      200,
      150,
    );
    expect(exportToBlobMock).not.toHaveBeenCalled();
    const clipboardItems = clipboardWrite.mock
      .calls[0][0] as TestClipboardItem[];
    expect(clipboardItems[0].items["image/png"]).toBe(croppedBlob);
  });
});
