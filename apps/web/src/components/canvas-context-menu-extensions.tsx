"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAppTranslation } from "../i18n";

type CanvasContextMenuExtensionsProps = {
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any;
};

function getNativeContextMenu() {
  return document.querySelector<HTMLUListElement>(".excalidraw .context-menu");
}

const SECTION_START_LABELS = new Set(["Crop image", "Duplicate"]);
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
};

function markContextMenuSections(menuElement: HTMLUListElement) {
  for (const item of menuElement.querySelectorAll<HTMLLIElement>(
    "li.aimc-context-menu-section-start",
  )) {
    if (item.dataset.testid !== "downloadImage") {
      item.classList.remove("aimc-context-menu-section-start");
    }
  }

  for (const item of menuElement.querySelectorAll<HTMLLIElement>("li")) {
    const label = item
      .querySelector<HTMLElement>(".context-menu-item__label")
      ?.dataset.aimcOriginalLabel ??
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

export function CanvasContextMenuExtensions({
  excalidrawApi,
}: CanvasContextMenuExtensionsProps) {
  const { i18n, t } = useAppTranslation("canvas");
  const renderedLanguage = i18n.resolvedLanguage ?? i18n.language;
  const [menuElement, setMenuElement] = useState<HTMLUListElement | null>(null);

  useEffect(() => {
    const syncMenuElement = () => {
      const nativeMenuElement = getNativeContextMenu();
      if (nativeMenuElement) {
        markContextMenuSections(nativeMenuElement);
        localizeNativeContextMenuLabels(nativeMenuElement, t);
      }
      setMenuElement(nativeMenuElement);
    };
    syncMenuElement();

    const observer = new MutationObserver(syncMenuElement);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [renderedLanguage]);

  const handleDownloadImage = useCallback(async () => {
    if (!excalidrawApi) return;

    const appState = excalidrawApi.getAppState();
    const selectedIds = Object.entries(
      appState.selectedElementIds ?? {},
    ).flatMap(([id, selected]) => (selected ? [id] : []));
    const allElements = excalidrawApi
      .getSceneElements()
      .filter((element: Record<string, unknown>) => !element.isDeleted);
    const elements =
      selectedIds.length > 0
        ? allElements.filter((element: Record<string, unknown>) =>
            selectedIds.includes(element.id as string),
          )
        : allElements;

    if (elements.length === 0) return;

    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const blob = await exportToBlob({
      elements,
      appState: { ...appState, exportBackground: true },
      files: excalidrawApi.getFiles(),
      mimeType: "image/png",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      elements.length === 1
        ? "ai-media-canvas-image.png"
        : "ai-media-canvas-selection.png";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }, [excalidrawApi]);

  if (!menuElement) return null;

  return createPortal(
    <li className="aimc-context-menu-section-start" data-testid="downloadImage">
      <button
        type="button"
        className="context-menu-item"
        onClick={handleDownloadImage}
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
