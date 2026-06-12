"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAppTranslation } from "../i18n";
import { downloadPngFile } from "../lib/image-download";
import { useToast } from "./toast";

type CanvasContextMenuExtensionsProps = {
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any;
};

type CanvasContextMenuApi = {
  getAppState: () => {
    selectedElementIds?: Record<string, boolean>;
  } & Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  getSceneElements: () => readonly Record<string, unknown>[];
};

function getNativeContextMenu() {
  return document.querySelector<HTMLUListElement>(".excalidraw .context-menu");
}

const SECTION_START_LABELS = new Set(["Crop image", "Duplicate"]);
const HIDDEN_NATIVE_CONTEXT_MENU_TEST_IDS = new Set(["copyAsPng"]);
const NATIVE_CONTEXT_MENU_LABEL_KEYS: Record<string, string> = {
  "Canvas & Shape properties":
    "canvas:contextMenu.native.canvasAndShapeProperties",
  "Copy image": "canvas:contextMenu.native.copyImage",
  "Copy to clipboard as PNG": "canvas:contextMenu.native.copyImage",
  "Copy link to object": "canvas:contextMenu.native.copyLinkToObject",
  "Crop image": "canvas:contextMenu.native.cropImage",
  Duplicate: "canvas:contextMenu.native.duplicate",
  Paste: "canvas:contextMenu.native.paste",
  "Select all": "canvas:contextMenu.native.selectAll",
  "Snap to objects": "canvas:contextMenu.native.snapToObjects",
  "Toggle grid": "canvas:contextMenu.native.toggleGrid",
  "View mode": "canvas:contextMenu.native.viewMode",
  "Wrap selection in frame": "canvas:contextMenu.native.wrapSelectionInFrame",
  "Zen mode": "canvas:contextMenu.native.zenMode",
  "复制为 PNG 到剪贴板": "canvas:contextMenu.native.copyImage",
  复制: "canvas:contextMenu.native.duplicate",
};

function isCanvasContextMenuApi(
  excalidrawApi: CanvasContextMenuExtensionsProps["excalidrawApi"],
): excalidrawApi is CanvasContextMenuApi {
  return (
    typeof excalidrawApi?.getAppState === "function" &&
    typeof excalidrawApi?.getFiles === "function" &&
    typeof excalidrawApi?.getSceneElements === "function"
  );
}

function hideNativeContextMenuItems(menuElement: HTMLUListElement) {
  for (const item of menuElement.querySelectorAll<HTMLLIElement>("li")) {
    if (
      item.dataset.testid &&
      HIDDEN_NATIVE_CONTEXT_MENU_TEST_IDS.has(item.dataset.testid)
    ) {
      item.hidden = true;
    }
  }
}

function getContextMenuItemOriginalLabel(item: HTMLLIElement) {
  return (
    item.querySelector<HTMLElement>(".context-menu-item__label")?.dataset
      .aimcOriginalLabel ??
    item
      .querySelector<HTMLElement>(".context-menu-item__label")
      ?.textContent?.trim() ??
    ""
  );
}

function hideUnsupportedNativeImageCopyItem(
  menuElement: HTMLUListElement,
  excalidrawApi: CanvasContextMenuApi | null,
) {
  for (const item of menuElement.querySelectorAll<HTMLLIElement>(
    'li[data-testid="copy"]',
  )) {
    const originalLabel = getContextMenuItemOriginalLabel(item);
    const isImageCopyItem =
      NATIVE_CONTEXT_MENU_LABEL_KEYS[originalLabel] ===
      "canvas:contextMenu.native.copyImage";
    item.hidden =
      isImageCopyItem &&
      (!excalidrawApi || !canCopySelectionAsImage(excalidrawApi));
  }
}

function markContextMenuSections(menuElement: HTMLUListElement) {
  for (const item of menuElement.querySelectorAll<HTMLLIElement>(
    "li.aimc-context-menu-section-start",
  )) {
    if (item.dataset.testid !== "downloadImage") {
      item.classList.remove("aimc-context-menu-section-start");
    }
  }

  for (const item of menuElement.querySelectorAll<HTMLLIElement>("li")) {
    const label =
      item.querySelector<HTMLElement>(".context-menu-item__label")?.dataset
        .aimcOriginalLabel ??
      item
        .querySelector<HTMLElement>(".context-menu-item__label")
        ?.textContent?.trim();

    if (label && SECTION_START_LABELS.has(label)) {
      item.classList.add("aimc-context-menu-section-start");
    }
  }
}

function localizeNativeContextMenuLabels(
  menuElement: HTMLUListElement,
  t: (key: string) => string,
) {
  for (const labelElement of menuElement.querySelectorAll<HTMLElement>(
    ".context-menu-item__label",
  )) {
    const originalLabel =
      labelElement.dataset.aimcOriginalLabel ??
      labelElement.textContent?.trim();
    if (!originalLabel) continue;

    const translationKey = NATIVE_CONTEXT_MENU_LABEL_KEYS[originalLabel];
    if (!translationKey) continue;

    labelElement.dataset.aimcOriginalLabel = originalLabel;
    const localizedLabel = t(translationKey);
    if (labelElement.textContent !== localizedLabel) {
      labelElement.textContent = localizedLabel;
    }
  }
}

function getSelectedElements(excalidrawApi: CanvasContextMenuApi) {
  const appState = excalidrawApi.getAppState();
  const selectedIds = Object.entries(appState.selectedElementIds ?? {}).flatMap(
    ([id, selected]) => (selected ? [id] : []),
  );
  if (selectedIds.length === 0) return [];

  const selectedIdSet = new Set(selectedIds);
  return excalidrawApi
    .getSceneElements()
    .filter(
      (element: Record<string, unknown>) =>
        !element.isDeleted && selectedIdSet.has(element.id as string),
    );
}

function canCopySelectionAsImage(excalidrawApi: CanvasContextMenuApi) {
  const selectedElements = getSelectedElements(excalidrawApi);
  return (
    selectedElements.length > 0 &&
    selectedElements.every(
      (element: Record<string, unknown>) => element.type === "image",
    )
  );
}

function getLiveElements(excalidrawApi: CanvasContextMenuApi) {
  return excalidrawApi
    .getSceneElements()
    .filter((element: Record<string, unknown>) => !element.isDeleted);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Unable to read image data.");
  }
  return await response.blob();
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image data."));
    image.src = dataUrl;
  });
}

async function createCroppedImageBlob(
  dataUrl: string,
  crop: Record<string, unknown>,
) {
  const image = await loadImage(dataUrl);
  const sourceX = numberValue(crop.x) ?? 0;
  const sourceY = numberValue(crop.y) ?? 0;
  const sourceWidth = Math.max(
    1,
    numberValue(crop.width) ?? image.naturalWidth,
  );
  const sourceHeight = Math.max(
    1,
    numberValue(crop.height) ?? image.naturalHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth);
  canvas.height = Math.round(sourceHeight);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create image canvas.");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to export cropped image."));
      }
    }, "image/png");
  });
}

async function exportSelectionToPngBlob(
  excalidrawApi: CanvasContextMenuApi,
  selectedElements: readonly Record<string, unknown>[],
) {
  const appState = excalidrawApi.getAppState();
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  return exportToBlob({
    elements: selectedElements as never,
    appState: { ...appState, exportBackground: true },
    files: excalidrawApi.getFiles() as never,
    mimeType: "image/png",
  });
}

async function exportSelectedImageToPngBlob(
  excalidrawApi: CanvasContextMenuApi,
  selectedElements: readonly Record<string, unknown>[],
) {
  if (selectedElements.length === 1) {
    const element = selectedElements[0];
    if (!element) {
      return exportSelectionToPngBlob(excalidrawApi, selectedElements);
    }
    const fileId = typeof element.fileId === "string" ? element.fileId : null;
    const file = fileId ? asRecord(excalidrawApi.getFiles()[fileId]) : null;
    const dataUrl = typeof file?.dataURL === "string" ? file.dataURL : null;
    if (dataUrl) {
      const crop = asRecord(element.crop);
      return crop
        ? createCroppedImageBlob(dataUrl, crop)
        : blobFromDataUrl(dataUrl);
    }
  }

  return exportSelectionToPngBlob(excalidrawApi, selectedElements);
}

function getSingleUncroppedImageDataUrl(
  excalidrawApi: CanvasContextMenuApi,
  selectedElements: readonly Record<string, unknown>[],
) {
  if (selectedElements.length !== 1) return null;

  const element = selectedElements[0];
  if (!element || element.type !== "image" || element.crop) return null;

  const fileId = typeof element.fileId === "string" ? element.fileId : null;
  const file = fileId ? asRecord(excalidrawApi.getFiles()[fileId]) : null;
  return typeof file?.dataURL === "string" ? file.dataURL : null;
}

async function copySelectedImagesToClipboard(
  excalidrawApi: CanvasContextMenuApi,
) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("PNG clipboard writes are not supported in this browser.");
  }

  const selectedElements = getSelectedElements(excalidrawApi);
  const pngBlob = await exportSelectedImageToPngBlob(
    excalidrawApi,
    selectedElements,
  );
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": pngBlob,
    }),
  ]);
}

function closeNativeContextMenu(triggerElement?: HTMLElement | null) {
  const target =
    triggerElement ??
    (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : document.body);
  target.blur();
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    }),
  );
  getNativeContextMenu()?.remove();
}

function replaceImageCopyContextMenuItem(
  menuElement: HTMLUListElement,
  excalidrawApi: CanvasContextMenuApi,
  onImageCopied: () => void,
  onImageCopyFailed: () => void,
) {
  if (!canCopySelectionAsImage(excalidrawApi)) return;

  const copyItem = menuElement.querySelector<HTMLLIElement>(
    'li[data-testid="copy"]',
  );
  if (!copyItem || copyItem.dataset.aimcCopyImageItem === "true") return;

  const imageCopyItem = copyItem.cloneNode(true) as HTMLLIElement;
  imageCopyItem.dataset.testid = "aimcCopyImage";
  imageCopyItem.dataset.aimcCopyImageItem = "true";
  const copyButton = imageCopyItem.querySelector<HTMLButtonElement>("button");
  if (!copyButton) return;
  copyButton.addEventListener("click", () => {
    const copyPromise = copySelectedImagesToClipboard(excalidrawApi);
    closeNativeContextMenu(copyButton);
    void copyPromise.then(onImageCopied).catch((error) => {
      console.warn("[canvas-context-menu] copy image failed:", error);
      onImageCopyFailed();
    });
  });
  copyItem.replaceWith(imageCopyItem);
}

export function CanvasContextMenuExtensions({
  excalidrawApi,
}: CanvasContextMenuExtensionsProps) {
  const { t } = useAppTranslation("canvas");
  const { success: toastSuccess, error: toastError } = useToast();
  const [menuElement, setMenuElement] = useState<HTMLUListElement | null>(null);

  useEffect(() => {
    const syncMenuElement = () => {
      const nativeMenuElement = getNativeContextMenu();
      if (nativeMenuElement) {
        const canvasContextMenuApi = isCanvasContextMenuApi(excalidrawApi)
          ? excalidrawApi
          : null;
        hideNativeContextMenuItems(nativeMenuElement);
        hideUnsupportedNativeImageCopyItem(
          nativeMenuElement,
          canvasContextMenuApi,
        );
        markContextMenuSections(nativeMenuElement);
        localizeNativeContextMenuLabels(nativeMenuElement, t);
        if (canvasContextMenuApi) {
          replaceImageCopyContextMenuItem(
            nativeMenuElement,
            canvasContextMenuApi,
            () => {
              toastSuccess(t("contextMenu.copyImageSuccess"));
            },
            () => {
              toastError(t("contextMenu.copyImageFailed"));
            },
          );
        }
      }
      setMenuElement(nativeMenuElement);
    };
    syncMenuElement();

    const observer = new MutationObserver(syncMenuElement);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [excalidrawApi, t, toastError, toastSuccess]);

  const handleDownloadImage = useCallback(
    async (triggerElement: HTMLElement) => {
      closeNativeContextMenu(triggerElement);
      if (!isCanvasContextMenuApi(excalidrawApi)) return;

      const selectedElements = getSelectedElements(excalidrawApi);
      const elements =
        selectedElements.length > 0
          ? selectedElements
          : getLiveElements(excalidrawApi);
      if (elements.length === 0) return;

      const filename =
        elements.length === 1
          ? "ai-media-canvas-image.png"
          : "ai-media-canvas-selection.png";

      try {
        const dataUrl = getSingleUncroppedImageDataUrl(excalidrawApi, elements);
        const result = await downloadPngFile({
          filename,
          source:
            dataUrl ??
            (await exportSelectedImageToPngBlob(excalidrawApi, elements)),
        });
        if (result === "saved") {
          toastSuccess(t("files.downloadSuccess", { name: filename }));
        }
      } catch (error) {
        console.warn("[canvas-context-menu] download image failed:", error);
        toastError(t("files.downloadFailed"));
      }
    },
    [excalidrawApi, t, toastError, toastSuccess],
  );

  if (!menuElement) return null;

  return createPortal(
    <li className="aimc-context-menu-section-start" data-testid="downloadImage">
      <button
        type="button"
        className="context-menu-item"
        onClick={(event) => {
          void handleDownloadImage(event.currentTarget);
        }}
      >
        <div className="context-menu-item__label">
          {t("contextMenu.downloadImage")}
        </div>
        <kbd className="context-menu-item__shortcut" />
      </button>
    </li>,
    menuElement,
  );
}
