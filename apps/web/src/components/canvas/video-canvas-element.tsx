"use client";

import { Download, Expand, Info, Play, X } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useToast } from "@/components/toast";
import { useAppTranslation } from "../../i18n";

type VideoCanvasElementProps = {
  src: string;
  width: number;
  height: number;
  title?: string | undefined;
  prompt?: string | undefined;
  model?: string | undefined;
  durationSeconds?: number | undefined;
  resolution?: string | undefined;
  aspectRatio?: string | undefined;
  mimeType?: string | undefined;
  zoom?: number | undefined;
  dragEnabled?: boolean | undefined;
  dragging?: boolean | undefined;
};

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export function VideoCanvasElement({
  src,
  width,
  height,
  title,
  prompt,
  model,
  durationSeconds,
  resolution,
  aspectRatio,
  mimeType = "video/mp4",
  zoom = 1,
  dragEnabled = false,
  dragging = false,
}: VideoCanvasElementProps) {
  const { t } = useAppTranslation("canvas");
  const { success: toastSuccess } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const infoDialogRef = useRef<HTMLDialogElement>(null);
  const suppressClickAfterDragRef = useRef(false);
  const removeDragPauseListenersRef = useRef<(() => void) | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [infoPosition, setInfoPosition] = useState({ left: 24, top: 24 });
  const durationLabel = formatDuration(durationSeconds);
  const readableTitle = title || t("tools.videoPanel.playerTitle");
  const controlScale = Math.min(1, Math.max(0.25, zoom));
  const bottomLeftControlStyle: CSSProperties = {
    transform: `scale(${controlScale})`,
    transformOrigin: "bottom left",
  };
  const bottomRightControlStyle: CSSProperties = {
    transform: `scale(${controlScale})`,
    transformOrigin: "bottom right",
  };
  const topRightControlStyle: CSSProperties = {
    transform: `scale(${controlScale})`,
    transformOrigin: "top right",
  };
  const centerControlStyle: CSSProperties = {
    transform: `translate(-50%, -50%) scale(${controlScale})`,
  };

  const stopCanvasEvent = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const stopCanvasPointerEvent = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const playPreview = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
    setPlaying(true);
  }, []);

  const pausePreview = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPlaying(false);
  }, []);

  const togglePreviewState = useCallback(() => {
    if (playing) {
      pausePreview();
    } else {
      playPreview();
    }
  }, [pausePreview, playPreview, playing]);

  const handleDownloadVideo = useCallback(() => {
    toastSuccess(t("files.downloadStarted"));
  }, [t, toastSuccess]);

  const togglePreview = useCallback(
    (event: React.MouseEvent) => {
      stopCanvasEvent(event);
      if (suppressClickAfterDragRef.current) {
        suppressClickAfterDragRef.current = false;
        return;
      }
      togglePreviewState();
    },
    [stopCanvasEvent, togglePreviewState],
  );

  const handleVideoPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button != null && event.button !== 0) return;
      suppressClickAfterDragRef.current = false;
      removeDragPauseListenersRef.current?.();

      const startX = event.clientX;
      const startY = event.clientY;
      let dragStarted = false;

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (dragStarted) return;
        const deltaX = pointerEvent.clientX - startX;
        const deltaY = pointerEvent.clientY - startY;
        if (Math.hypot(deltaX, deltaY) < 4) return;
        dragStarted = true;
        suppressClickAfterDragRef.current = true;
        pausePreview();
      };

      const cleanup = () => {
        document.removeEventListener("pointermove", handlePointerMove, true);
        document.removeEventListener("pointerup", cleanup, true);
        document.removeEventListener("pointercancel", cleanup, true);
        removeDragPauseListenersRef.current = null;
      };

      document.addEventListener("pointermove", handlePointerMove, true);
      document.addEventListener("pointerup", cleanup, true);
      document.addEventListener("pointercancel", cleanup, true);
      removeDragPauseListenersRef.current = cleanup;
    },
    [pausePreview],
  );

  const updateInfoPosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = 320;
    const gap = 16;
    const left =
      rect.right + panelWidth + gap <= window.innerWidth
        ? rect.right + gap
        : Math.max(16, rect.right - panelWidth);
    const top = Math.max(16, Math.min(rect.top, window.innerHeight - 420));
    setInfoPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!infoOpen) return;
    updateInfoPosition();
    window.addEventListener("resize", updateInfoPosition);
    window.addEventListener("scroll", updateInfoPosition, true);
    return () => {
      window.removeEventListener("resize", updateInfoPosition);
      window.removeEventListener("scroll", updateInfoPosition, true);
    };
  }, [infoOpen, updateInfoPosition]);

  useEffect(() => {
    if (!infoOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && infoDialogRef.current?.contains(target)) {
        return;
      }
      setInfoOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [infoOpen]);

  useEffect(() => {
    if (!infoOpen && !playerOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setInfoOpen(false);
      setPlayerOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [infoOpen, playerOpen]);

  useEffect(() => {
    return () => removeDragPauseListenersRef.current?.();
  }, []);

  useEffect(() => {
    if (dragging) pausePreview();
  }, [dragging, pausePreview]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ width, height }}
        className="relative overflow-visible"
      >
        <button
          type="button"
          aria-label={readableTitle}
          className={`pointer-events-auto absolute inset-0 flex appearance-none items-center justify-center overflow-hidden border-0 bg-black p-0 ${
            dragging
              ? "cursor-grabbing"
              : dragEnabled
                ? "cursor-grab"
                : "cursor-pointer"
          }`}
          onPointerDown={handleVideoPointerDown}
          onMouseEnter={playPreview}
          onMouseLeave={pausePreview}
          onClick={togglePreview}
        >
          <video
            ref={videoRef}
            src={src}
            muted
            loop
            playsInline
            preload="metadata"
            draggable={false}
            className="h-full w-full object-cover"
          />

          {!playing && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur-sm"
              style={centerControlStyle}
            >
              <Play className="ml-1 h-7 w-7 fill-white" />
            </div>
          )}

          {durationLabel && (
            <div
              className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/72 px-2.5 py-1.5 text-[13px] font-medium leading-none text-white shadow-sm backdrop-blur-sm"
              style={bottomLeftControlStyle}
            >
              {durationLabel}
            </div>
          )}
        </button>

        <button
          type="button"
          aria-label={t("tools.videoPanel.openInfo")}
          title={t("tools.videoPanel.openInfo")}
          onPointerDown={stopCanvasPointerEvent}
          onClick={(event) => {
            stopCanvasEvent(event);
            setInfoOpen(true);
          }}
          className="pointer-events-auto absolute right-2 top-2 z-40 flex h-9 w-9 items-center justify-center rounded-md bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          style={topRightControlStyle}
        >
          <Info className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          aria-label={t("tools.videoPanel.openPlayer")}
          title={t("tools.videoPanel.openPlayer")}
          onPointerDown={stopCanvasPointerEvent}
          onClick={(event) => {
            stopCanvasEvent(event);
            setPlayerOpen(true);
          }}
          className="pointer-events-auto absolute bottom-2 right-2 z-40 flex h-9 w-9 items-center justify-center rounded-md bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          style={bottomRightControlStyle}
        >
          <Expand className="h-[18px] w-[18px]" />
        </button>
      </div>

      {infoOpen &&
        createPortal(
          <dialog
            ref={infoDialogRef}
            open
            aria-label={t("tools.videoPanel.infoTitle")}
            style={{ left: infoPosition.left, top: infoPosition.top }}
            className="fixed z-[120] w-[320px] rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-card"
            onPointerDown={stopCanvasPointerEvent}
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">
                  {t("tools.videoPanel.infoTitle")}
                </div>
              </div>
              <button
                type="button"
                aria-label={t("tools.videoPanel.closeInfo")}
                title={t("tools.videoPanel.closeInfo")}
                onClick={() => setInfoOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {prompt && (
                <div>
                  <div className="mb-1.5 text-sm text-muted-foreground">
                    {t("tools.videoPanel.prompt")}
                  </div>
                  <div className="text-base leading-6 text-foreground">
                    {prompt}
                  </div>
                </div>
              )}
              {model && (
                <div>
                  <div className="mb-1.5 text-sm text-muted-foreground">
                    {t("tools.videoPanel.model")}
                  </div>
                  <div className="text-base leading-6 text-foreground">
                    {model}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-1.5 text-sm text-muted-foreground">
                  {t("tools.videoPanel.size")}
                </div>
                <div className="text-base leading-6 text-foreground">
                  {aspectRatio || t("tools.videoPanel.autoSize")}
                </div>
              </div>
              {durationSeconds != null && (
                <div>
                  <div className="mb-1.5 text-sm text-muted-foreground">
                    {t("tools.videoPanel.duration")}
                  </div>
                  <div className="text-base leading-6 text-foreground">
                    {durationSeconds}s
                  </div>
                </div>
              )}
              {resolution && (
                <div>
                  <div className="mb-1.5 text-sm text-muted-foreground">
                    {t("tools.videoPanel.resolution")}
                  </div>
                  <div className="text-base leading-6 text-foreground">
                    {resolution}
                  </div>
                </div>
              )}
            </div>
          </dialog>,
          document.body,
        )}

      {playerOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-6"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setPlayerOpen(false);
              }
            }}
          >
            <dialog
              open
              aria-label={t("tools.videoPanel.playerTitle")}
              className="relative m-0 w-[min(920px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border bg-card shadow-card"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                <div className="min-w-0 truncate text-sm font-medium text-foreground">
                  {readableTitle}
                </div>
                <button
                  type="button"
                  aria-label={t("tools.videoPanel.closePlayer")}
                  title={t("tools.videoPanel.closePlayer")}
                  onClick={() => setPlayerOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="bg-black">
                <video
                  src={src}
                  controls
                  controlsList="nodownload"
                  autoPlay
                  playsInline
                  className="max-h-[70vh] w-full bg-black object-contain"
                >
                  <source src={src} type={mimeType} />
                  <track
                    kind="captions"
                    src="data:text/vtt,WEBVTT%0A"
                    label={t("tools.videoPanel.captions")}
                  />
                </video>
              </div>
              <div className="flex items-center justify-end border-t border-border/70 px-3 py-2">
                <a
                  href={src}
                  download
                  onClick={handleDownloadVideo}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80"
                  aria-label={t("files.download", { name: readableTitle })}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("common:actions.download")}
                </a>
              </div>
            </dialog>
          </div>,
          document.body,
        )}
    </>
  );
}
