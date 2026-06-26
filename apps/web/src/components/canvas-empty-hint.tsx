"use client";

import { useEffect, useRef, useState } from "react";

import { useAppTranslation } from "@/i18n";

type CanvasEmptyHintProps = {
  excalidrawApi?: {
    getSceneElements?: () => ReadonlyArray<{ isDeleted?: boolean }>;
  } | null;
  onOpenChat: () => void;
};

/**
 * Floating overlay hint shown when the Excalidraw canvas has no visible
 * elements. Pressing the `C` key opens the chat sidebar and focuses the
 * chat input textarea.
 */
export function CanvasEmptyHint({
  excalidrawApi,
  onOpenChat,
}: CanvasEmptyHintProps) {
  const { t } = useAppTranslation("canvas");
  const [hasElements, setHasElements] = useState(false);
  const onOpenChatRef = useRef(onOpenChat);
  onOpenChatRef.current = onOpenChat;

  // Poll the Excalidraw API every 500ms to determine if the canvas contains
  // any non-deleted elements.
  useEffect(() => {
    function check() {
      if (!excalidrawApi) {
        setHasElements(false);
        return;
      }
      const elements = excalidrawApi.getSceneElements?.() ?? [];
      setHasElements(elements.some((el) => !el.isDeleted));
    }

    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [excalidrawApi]);

  // Global keydown listener for the `C` shortcut.
  useEffect(() => {
    if (hasElements) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when the user is typing in an input or textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Also ignore if contentEditable
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        onOpenChatRef.current();

        // The chat input may not be in the DOM yet (sidebar was closed), so
        // retry focus with a short delay.
        requestAnimationFrame(() => {
          const input = findChatInput();
          if (input) {
            input.focus();
          } else {
            // Sidebar might animate open; retry once more.
            setTimeout(() => {
              findChatInput()?.focus();
            }, 100);
          }
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasElements]);

  if (hasElements) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <p className="text-base text-muted-foreground/50">{t("empty")}</p>
    </div>
  );
}

function findChatInput() {
  const root = document.querySelector<HTMLElement>("[data-chat-input]");
  return root?.matches("textarea, [contenteditable='true'], [role='textbox']")
    ? root
    : root?.querySelector<HTMLElement>(
        "textarea, [contenteditable='true'], [role='textbox']",
      );
}
