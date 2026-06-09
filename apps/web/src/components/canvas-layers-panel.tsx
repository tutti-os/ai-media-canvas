"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useAppTranslation } from "@/i18n";

/* -- Types -- */
// biome-ignore lint/suspicious/noExplicitAny: Excalidraw element has no public type
type ExcalidrawEl = any;
type ExcalidrawFile = {
  dataURL?: string;
};

export type CanvasLayersPanelProps = {
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any;
  open: boolean;
  onClose: () => void;
};

/* -- Throttle utility -- */
/** Simple trailing-edge throttle. Ensures fn fires at most once per `ms`. */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const throttled = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, ms);
  }) as T & { cancel: () => void };
  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };
  return throttled;
}

/* -- Icon helpers -- */
const CloseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path
      d="M4.5 4.5l7 7M11.5 4.5l-7 7"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

/* -- Element helpers -- */
function elLabel(el: ExcalidrawEl): string {
  if (el.customData?.type === "image-generator") {
    return el.customData?.title?.slice(0, 20) || "Image Generator";
  }
  if (el.type === "text") return (el.text as string)?.slice(0, 20) || "Text";
  if (el.type === "image") {
    return el.customData?.title?.slice(0, 20) || "Image";
  }
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

function elThumbnailIcon(el: ExcalidrawEl): string {
  if (el.customData?.type === "image-generator") return "\u2728";
  if (el.type === "text") return "T";
  if (el.type === "image") return "";
  if (el.type === "rectangle") return "\u25AD";
  if (el.type === "ellipse") return "\u25EF";
  if (el.type === "diamond") return "\u25C7";
  if (el.type === "line") return "\u2500";
  if (el.type === "arrow") return "\u2192";
  return "\u25C6";
}

/* -- Thumbnail component -- */
function LayerThumbnail({
  el,
  files,
}: {
  el: ExcalidrawEl;
  files: Record<string, ExcalidrawFile>;
}) {
  const icon = elThumbnailIcon(el);

  // For image elements, try to show a small preview
  if (el.type === "image" && el.fileId) {
    const file = files[el.fileId];
    if (file?.dataURL) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted overflow-hidden">
          <img
            src={file.dataURL}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      );
    }
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-[11px] leading-none text-muted-foreground">
      {icon}
    </div>
  );
}

/* -- Layer row (memoized to prevent re-render when other rows' selection changes) -- */
const LayerRow = memo(function LayerRow({
  el,
  files,
  selected,
  onSelect,
}: {
  el: ExcalidrawEl;
  files: Record<string, ExcalidrawFile>;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(el.id), [onSelect, el.id]);

  return (
    <div
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 44px" }}
    >
      <button
        type="button"
        className={`group/layer flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          selected ? "bg-muted" : "hover:bg-muted"
        }`}
        onClick={handleClick}
      >
        <LayerThumbnail el={el} files={files} />
        <span className="flex-1 truncate text-[11px] text-foreground min-w-0">
          {elLabel(el)}
        </span>
      </button>
    </div>
  );
});

/* ================================================================
   Main component
   ================================================================ */
export function CanvasLayersPanel({
  excalidrawApi,
  open,
  onClose,
}: CanvasLayersPanelProps) {
  const { t } = useAppTranslation("canvas");
  const panelRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<ExcalidrawEl[]>([]);
  const [files, setFiles] = useState<Record<string, ExcalidrawFile>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  /* -- Refresh elements on open + subscribe to changes -- */
  const refreshElements = useCallback(() => {
    if (!excalidrawApi) return;
    const all = excalidrawApi.getSceneElements() as ExcalidrawEl[];
    setElements(all.filter((el: ExcalidrawEl) => !el.isDeleted).reverse());
    setFiles(excalidrawApi.getFiles() ?? {});
    const state = excalidrawApi.getAppState();
    setSelectedIds(state.selectedElementIds ?? {});
  }, [excalidrawApi]);

  // Throttle refresh to avoid hammering React state on every drag frame.
  // 100ms gives smooth UI without excessive re-renders during drawing.
  useEffect(() => {
    if (!open || !excalidrawApi) return;
    // Initial refresh is immediate
    refreshElements();

    const throttledRefresh = throttle(refreshElements, 100);
    const unsubscribe = excalidrawApi.onChange(() => {
      throttledRefresh();
    });
    return () => {
      throttledRefresh.cancel();
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [open, excalidrawApi, refreshElements]);

  /* -- Escape to close -- */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  /* -- Select element on canvas -- */
  const selectElement = useCallback(
    (id: string) => {
      excalidrawApi?.updateScene({
        appState: { selectedElementIds: { [id]: true } },
      });
    },
    [excalidrawApi],
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed left-0 top-0 z-30 flex h-full w-[280px] flex-col border-r border-border bg-card animate-in slide-in-from-left duration-200"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Title bar */}
      <div className="flex h-11 shrink-0 items-center justify-between px-3">
        <span className="text-sm font-medium text-foreground">
          {t("layers.title")}
        </span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          onClick={onClose}
          aria-label={t("closeLayers")}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* Layer list -- uses content-visibility for large canvas performance */}
      <div
        className="flex-1 overflow-y-auto px-1 py-1"
        style={{ contain: "layout style" }}
      >
        {elements.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            {t("layers.empty")}
          </p>
        ) : (
          elements.map((el: ExcalidrawEl) => (
            <LayerRow
              key={el.id}
              el={el}
              files={files}
              selected={!!selectedIds[el.id]}
              onSelect={selectElement}
            />
          ))
        )}
      </div>
    </div>
  );
}
