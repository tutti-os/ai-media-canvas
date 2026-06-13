"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Circle,
  Hand,
  Image as ImageIcon,
  ImageUp,
  Minus,
  MousePointer2,
  Pencil,
  Sparkles,
  Square,
  Type,
  Video,
} from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import { useAppTranslation } from "../i18n";
import {
  createExcalidrawImageElement,
  fetchAsDataURL,
  isVideoUrl,
} from "../lib/canvas-elements";
import {
  type ImageGeneratorData,
  createImageGeneratorElement,
  getImageGeneratorData,
  isImageGeneratorElement,
} from "../lib/canvas-image-generator";
import { withNormalizedCanvasElementIndices } from "../lib/canvas-normalize";
import {
  type VideoGeneratorData,
  createVideoGeneratorElement,
  getVideoGeneratorData,
  isVideoGeneratorElement,
} from "../lib/canvas-video-generator";
import { isExcalidrawContextMenuTarget } from "../lib/excalidraw-context-menu";
import {
  type GenerationJobSubscription,
  generationJobService,
} from "../lib/generation-job-service";
import { normalizeLocalAssetStorageUrl } from "../lib/local-assets";
import { ImageGeneratorPanel } from "./canvas/image-generator-panel";
import { VideoGeneratorPanel } from "./canvas/video-generator-panel";
import { VideoPlayerPanel } from "./canvas/video-player-panel";

type ToolType =
  | "hand"
  | "selection"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image";

const TOOL_GROUPS: (ToolType | null)[] = [
  "hand",
  "selection",
  "image",
  null,
  "rectangle",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  null,
  "text",
];

type GeneratorOverlayItem = {
  id: string;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  zoom: number;
  model?: string;
  errorMessage?: string;
};

const TOOL_ICONS: Record<
  ToolType,
  React.ComponentType<{ className?: string }>
> = {
  hand: Hand,
  selection: MousePointer2,
  rectangle: Square,
  ellipse: Circle,
  arrow: ArrowUpRight,
  line: Minus,
  freedraw: Pencil,
  text: Type,
  image: ImageUp,
};

const TOOL_LABEL_KEYS: Record<ToolType, string> = {
  hand: "tools.hand",
  selection: "tools.selection",
  rectangle: "tools.rectangle",
  ellipse: "tools.ellipse",
  arrow: "tools.arrow",
  line: "tools.line",
  freedraw: "tools.freedraw",
  text: "tools.text",
  image: "tools.image",
};

type CanvasToolMenuProps = {
  canvasId: string;
  excalidrawApi: any;
  leftPanelOpen?: boolean;
  projectId: string;
};

function ToolbarTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  onMouseDown,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseDown={onMouseDown}
      className={`group relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
        active
          ? "bg-foreground/[0.08] text-foreground"
          : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground"
      }`}
    >
      {children}
      <ToolbarTooltip label={label} />
    </button>
  );
}

function ImageGeneratorIcon() {
  return (
    <span className="relative flex size-[18px] items-center justify-center">
      <ImageIcon className="size-[17px]" />
      <Sparkles className="absolute -right-1 -top-1 size-[9px] stroke-[2.4]" />
    </span>
  );
}

function generateRecoveryFileId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

function getGeneratorOverlayRadius(width: number, height: number) {
  return Math.max(6, Math.min(32, Math.min(width, height) * 0.08));
}
const GENERATOR_OVERLAY_BLEED = 2;
const GENERATOR_DEFAULT_STYLE = {
  backgroundColor: "#F3F4F6",
  strokeColor: "#D1D5DB",
};
const GENERATOR_ERROR_STYLE = {
  backgroundColor: "#FDECEE",
  strokeColor: "#FCA5A5",
};

function getGeneratorElementStyle(status: unknown) {
  return status === "error" ? GENERATOR_ERROR_STYLE : GENERATOR_DEFAULT_STYLE;
}

function normalizeGeneratorElementStyles(elements: readonly any[]) {
  let changed = false;
  const normalized = elements.map((element: any) => {
    if (
      element.isDeleted ||
      (!isImageGeneratorElement(element) && !isVideoGeneratorElement(element))
    ) {
      return element;
    }
    const style = getGeneratorElementStyle(element.customData?.status);
    if (
      element.strokeColor === style.strokeColor &&
      element.backgroundColor === style.backgroundColor
    ) {
      return element;
    }
    changed = true;
    return {
      ...element,
      ...style,
      version: ((element.version as number | undefined) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  return changed ? normalized : null;
}

/** Memoized shimmer overlay for a single generating element */
const GeneratingOverlay = memo(function GeneratingOverlay({
  id,
  screenX,
  screenY,
  screenW,
  screenH,
  model,
  zoom,
  label,
}: {
  id: string;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  zoom: number;
  model?: string;
  label: string;
}) {
  const contentScale = Math.min(1, Math.max(0.25, zoom));
  const showIcon = screenH >= 56 && screenW >= 72;
  const borderRadius = getGeneratorOverlayRadius(screenW, screenH);
  return (
    <div
      key={id}
      className="pointer-events-none fixed overflow-hidden"
      style={{
        left: screenX - GENERATOR_OVERLAY_BLEED,
        top: screenY - GENERATOR_OVERLAY_BLEED,
        width: screenW + GENERATOR_OVERLAY_BLEED * 2,
        height: screenH + GENERATOR_OVERLAY_BLEED * 2,
        borderRadius: borderRadius + GENERATOR_OVERLAY_BLEED,
        // Keep generation shimmer above canvas content, but below app chrome
        // such as the chat sidebar, top bar, and floating shell UI.
        zIndex: 10,
      }}
    >
      <div
        className="absolute inset-0 flex flex-col items-center justify-center bg-muted"
        style={{ borderRadius: borderRadius + GENERATOR_OVERLAY_BLEED }}
      >
        <div
          className="flex flex-col items-center justify-center"
          style={{ transform: `scale(${contentScale})` }}
        >
          {showIcon && (
            <svg
              className="h-12 w-12 text-muted-foreground/40"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          )}
          {showIcon && model && (
            <span className="mt-2 whitespace-nowrap rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {model
                .split("/")
                .pop()
                ?.split("-")
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")}
            </span>
          )}
          <span
            className={`${showIcon ? "mt-1" : "mt-0"} whitespace-nowrap text-[11px] text-muted-foreground`}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="absolute inset-0 animate-shimmer-scan">
        <div
          className="h-full w-1/2"
          style={{
            background:
              "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
});

const GeneratorErrorOverlay = memo(function GeneratorErrorOverlay({
  id,
  screenX,
  screenY,
  screenW,
  screenH,
  zoom,
  errorMessage,
}: GeneratorOverlayItem) {
  const contentScale = Math.min(1, Math.max(0.25, zoom));
  const showIcon = screenH >= 48 && screenW >= 72;
  const borderRadius = getGeneratorOverlayRadius(screenW, screenH);
  return (
    <div
      key={id}
      className="pointer-events-none fixed overflow-hidden"
      style={{
        left: screenX - GENERATOR_OVERLAY_BLEED,
        top: screenY - GENERATOR_OVERLAY_BLEED,
        width: screenW + GENERATOR_OVERLAY_BLEED * 2,
        height: screenH + GENERATOR_OVERLAY_BLEED * 2,
        borderRadius: borderRadius + GENERATOR_OVERLAY_BLEED,
        zIndex: 10,
      }}
    >
      <div
        className="absolute flex items-center justify-center px-2 text-center"
        style={{
          inset: 0,
          borderRadius: borderRadius + GENERATOR_OVERLAY_BLEED,
          backgroundColor: GENERATOR_ERROR_STYLE.backgroundColor,
        }}
      >
        <div
          className="flex flex-col items-center justify-center"
          style={{ transform: `scale(${contentScale})` }}
        >
          {showIcon && (
            <AlertTriangle className="h-7 w-7 text-destructive/80" />
          )}
          <span
            className={`${showIcon ? "mt-2" : "mt-0"} whitespace-nowrap rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-destructive shadow-sm`}
          >
            {errorMessage || "生成失败"}
          </span>
        </div>
      </div>
    </div>
  );
});

export function CanvasToolMenu({
  canvasId,
  excalidrawApi,
  leftPanelOpen,
  projectId,
}: CanvasToolMenuProps) {
  const { t } = useAppTranslation("canvas");
  const { activeImageGenerationPreference } = useImageModelPreference();
  const { activeVideoGenerationPreference } = useVideoModelPreference();
  const [activeTool, setActiveTool] = useState<string>("selection");

  // Image generator state
  const [activeGeneratorId, setActiveGeneratorId] = useState<string | null>(
    null,
  );
  const [generatorData, setGeneratorData] = useState<ImageGeneratorData | null>(
    null,
  );
  const [generatorBounds, setGeneratorBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const [activeVideoGenId, setActiveVideoGenId] = useState<string | null>(null);
  const [videoGenData, setVideoGenData] = useState<VideoGeneratorData | null>(
    null,
  );
  const [videoGenBounds, setVideoGenBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const [activeVideoPlayerId, setActiveVideoPlayerId] = useState<string | null>(
    null,
  );
  const [videoPlayerData, setVideoPlayerData] = useState<{
    videoUrl: string;
    mimeType: string;
    durationSeconds?: number;
    title?: string;
  } | null>(null);
  const [videoPlayerBounds, setVideoPlayerBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const [canvasScrollZoom, setCanvasScrollZoom] = useState({
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
  });

  // Track generating elements for shimmer overlay
  const [generatingElements, setGeneratingElements] = useState<
    GeneratorOverlayItem[]
  >([]);
  const [errorElements, setErrorElements] = useState<GeneratorOverlayItem[]>(
    [],
  );

  // Keep activeGeneratorId accessible inside onChange without causing re-subscription
  const activeGeneratorIdRef = useRef(activeGeneratorId);
  activeGeneratorIdRef.current = activeGeneratorId;
  const activeVideoGenIdRef = useRef(activeVideoGenId);
  activeVideoGenIdRef.current = activeVideoGenId;
  const activeVideoPlayerIdRef = useRef(activeVideoPlayerId);
  activeVideoPlayerIdRef.current = activeVideoPlayerId;

  // Track previous generating element IDs to avoid re-renders when nothing changed
  const prevGeneratingKeyRef = useRef("");
  const prevErrorKeyRef = useRef("");
  const watchedGenerationJobIdsRef = useRef(new Set<string>());
  const recoverySubscriptionsRef = useRef<GenerationJobSubscription[]>([]);

  // Helper: close all generator / player panels
  const closeAllPanels = useCallback(() => {
    setActiveGeneratorId(null);
    setGeneratorData(null);
    setGeneratorBounds(null);
    setActiveVideoGenId(null);
    setVideoGenData(null);
    setVideoGenBounds(null);
    setActiveVideoPlayerId(null);
    setVideoPlayerData(null);
    setVideoPlayerBounds(null);
  }, []);

  const replaceRecoveredImageGenerator = useCallback(
    async (element: any, result: Record<string, unknown>, jobId: string) => {
      const url = result.signed_url;
      const assetId = result.asset_id;
      const mimeType = result.mime_type;
      const width = result.width;
      const height = result.height;
      if (
        !excalidrawApi ||
        typeof url !== "string" ||
        typeof mimeType !== "string" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        return;
      }

      const current = excalidrawApi
        .getSceneElements()
        .find((item: any) => item.id === element.id);
      if (
        !current ||
        current.isDeleted ||
        current.customData?.jobId !== jobId ||
        current.customData?.status !== "generating"
      ) {
        return;
      }

      const dataURL = await fetchAsDataURL(url);
      const fileId = generateRecoveryFileId();
      excalidrawApi.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType,
          created: Date.now(),
          ...(typeof assetId === "string" ? { assetId } : {}),
          storageUrl:
            normalizeLocalAssetStorageUrl(
              url,
              typeof assetId === "string" ? assetId : null,
            ) ?? url,
        },
      ]);

      const imageElement = createExcalidrawImageElement({
        ...(typeof assetId === "string" ? { assetId } : {}),
        fileId,
        x: current.x,
        y: current.y,
        width: current.width,
        height: current.height,
        title: String(current.customData?.prompt ?? "").slice(0, 60),
        source: "generated",
        storageUrl:
          normalizeLocalAssetStorageUrl(
            url,
            typeof assetId === "string" ? assetId : null,
          ) ?? url,
      });
      const elements = excalidrawApi
        .getSceneElements()
        .map((item: any) =>
          item.id === current.id ? { ...item, isDeleted: true } : item,
        );
      excalidrawApi.updateScene({
        elements: withNormalizedCanvasElementIndices([
          ...elements,
          imageElement,
        ]),
        captureUpdate: "IMMEDIATELY",
      });
    },
    [excalidrawApi],
  );

  const replaceRecoveredVideoGenerator = useCallback(
    async (element: any, result: Record<string, unknown>, jobId: string) => {
      const url = result.signed_url;
      const assetId = result.asset_id;
      const mimeType = result.mime_type;
      const width = result.width;
      const height = result.height;
      if (
        !excalidrawApi ||
        typeof url !== "string" ||
        typeof mimeType !== "string" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        return;
      }

      const current = excalidrawApi
        .getSceneElements()
        .find((item: any) => item.id === element.id);
      if (
        !current ||
        current.isDeleted ||
        current.customData?.jobId !== jobId ||
        current.customData?.status !== "generating"
      ) {
        return;
      }

      const { convertToExcalidrawElements } = await import(
        "@excalidraw/excalidraw"
      );
      const durationSeconds = result.duration_seconds;
      const newElements = convertToExcalidrawElements([
        {
          type: "embeddable",
          link:
            normalizeLocalAssetStorageUrl(
              url,
              typeof assetId === "string" ? assetId : null,
            ) ?? url,
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
          customData: {
            isVideo: true,
            ...(typeof assetId === "string" ? { assetId } : {}),
            mimeType,
            ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
            title: String(current.customData?.prompt ?? "").slice(0, 60),
            prompt: current.customData?.prompt,
          },
        } as any,
      ]);
      const elements = excalidrawApi
        .getSceneElements()
        .map((item: any) =>
          item.id === current.id ? { ...item, isDeleted: true } : item,
        );
      excalidrawApi.updateScene({
        elements: withNormalizedCanvasElementIndices([
          ...elements,
          ...newElements,
        ]),
        captureUpdate: "IMMEDIATELY",
      });
    },
    [excalidrawApi],
  );

  const markRecoveredGeneratorFailed = useCallback(
    (elementId: string, jobId: string) => {
      if (!excalidrawApi) return;
      const elements = excalidrawApi.getSceneElements().map((item: any) => {
        if (item.id !== elementId) return item;
        if (
          item.customData?.jobId !== jobId ||
          item.customData?.status !== "generating"
        ) {
          return item;
        }
        return {
          ...item,
          strokeColor: "#FCA5A5",
          backgroundColor: "#FDECEE",
          customData: {
            ...item.customData,
            status: "error",
            errorMessage: "生成失败",
          },
        };
      });
      excalidrawApi.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
    },
    [excalidrawApi],
  );

  const recoverGeneratingJobs = useCallback(
    (elements: readonly any[]) => {
      if (!excalidrawApi || elements.length === 0) return;

      for (const element of elements) {
        if (element.isDeleted || element.customData?.status !== "generating") {
          continue;
        }
        const jobId = element.customData?.jobId;
        if (typeof jobId !== "string") continue;
        if (watchedGenerationJobIdsRef.current.has(jobId)) continue;
        const isVideo = isVideoGeneratorElement(element);
        const isImage = isImageGeneratorElement(element);
        if (!isVideo && !isImage) continue;
        watchedGenerationJobIdsRef.current.add(jobId);

        const subscription = generationJobService.watch(jobId, {
          jobType: isVideo ? "video_generation" : "image_generation",
          onSucceeded: (result) => {
            const recovery = isVideo
              ? replaceRecoveredVideoGenerator(element, result, jobId)
              : replaceRecoveredImageGenerator(element, result, jobId);
            void recovery.catch((error) => {
              console.warn(
                "[canvas-tool-menu] recovered generation replacement failed:",
                error,
              );
              watchedGenerationJobIdsRef.current.delete(jobId);
              markRecoveredGeneratorFailed(element.id as string, jobId);
            });
          },
          onFailed: (error) => {
            console.warn(
              "[canvas-tool-menu] recovered generation failed:",
              error,
            );
            watchedGenerationJobIdsRef.current.delete(jobId);
            markRecoveredGeneratorFailed(element.id as string, jobId);
          },
        });
        void subscription.promise.catch(() => {
          // Failure is handled through onFailed so the placeholder can stay visible.
        });
        recoverySubscriptionsRef.current.push(subscription);
      }
    },
    [
      excalidrawApi,
      markRecoveredGeneratorFailed,
      replaceRecoveredImageGenerator,
      replaceRecoveredVideoGenerator,
    ],
  );

  useEffect(() => {
    watchedGenerationJobIdsRef.current.clear();
    recoverySubscriptionsRef.current.forEach((subscription) =>
      subscription.unsubscribe(),
    );
    recoverySubscriptionsRef.current = [];
    if (!excalidrawApi) return;
    recoverGeneratingJobs(excalidrawApi.getSceneElements());
    return () => {
      recoverySubscriptionsRef.current.forEach((subscription) =>
        subscription.unsubscribe(),
      );
      recoverySubscriptionsRef.current = [];
      watchedGenerationJobIdsRef.current.clear();
    };
  }, [excalidrawApi, recoverGeneratingJobs]);

  useEffect(() => {
    if (!excalidrawApi) return;
    const normalized = normalizeGeneratorElementStyles(
      excalidrawApi.getSceneElements(),
    );
    if (normalized) {
      excalidrawApi.updateScene({
        elements: normalized,
        captureUpdate: "IMMEDIATELY",
      });
    }
    const { scrollX, scrollY, zoom } = excalidrawApi.getAppState();
    const errorRaw = excalidrawApi
      .getSceneElements()
      .filter(
        (el: any) =>
          !el.isDeleted &&
          (isImageGeneratorElement(el) || isVideoGeneratorElement(el)) &&
          el.customData?.status === "error",
      );
    prevErrorKeyRef.current =
      errorRaw
        .map(
          (el: any) =>
            `${el.id}:${el.x}:${el.y}:${el.width}:${el.height}:${el.customData?.errorMessage ?? ""}`,
        )
        .join("|") + `@${scrollX}:${scrollY}:${zoom}`;
    setErrorElements(
      errorRaw.map((el: any) => ({
        id: el.id as string,
        screenX: ((el.x as number) + scrollX) * zoom,
        screenY: ((el.y as number) + scrollY) * zoom,
        screenW: (el.width as number) * zoom,
        screenH: (el.height as number) * zoom,
        zoom,
        ...(typeof el.customData?.errorMessage === "string"
          ? { errorMessage: el.customData.errorMessage }
          : {}),
      })),
    );
  }, [excalidrawApi]);

  // Subscribe to Excalidraw changes.
  // This fires on every frame during drag / drawing, so we must be very
  // careful to avoid unnecessary state updates that trigger re-renders.
  useEffect(() => {
    if (!excalidrawApi) return;

    const unsubscribe = excalidrawApi.onChange(
      (elements: any[], appState: any) => {
        const normalized = normalizeGeneratorElementStyles(elements);
        if (normalized) {
          excalidrawApi.updateScene({
            elements: normalized,
            captureUpdate: "IMMEDIATELY",
          });
          recoverGeneratingJobs(normalized);
          return;
        }
        recoverGeneratingJobs(elements);

        // --- Tool sync (cheap string comparison, skip if unchanged) ---
        const tool = appState?.activeTool?.type;
        if (tool)
          setActiveTool((prev: string) => (prev === tool ? prev : tool));

        const scrollX = appState?.scrollX ?? 0;
        const scrollY = appState?.scrollY ?? 0;
        const zoom = appState?.zoom?.value ?? 1;
        // Only update scroll/zoom state if values actually changed
        setCanvasScrollZoom((prev) => {
          if (
            prev.scrollX === scrollX &&
            prev.scrollY === scrollY &&
            prev.zoom === zoom
          )
            return prev;
          return { scrollX, scrollY, zoom };
        });

        // --- Selection-based panel management ---
        const selectedIds = appState?.selectedElementIds ?? {};
        const selectedElements = elements.filter(
          (el: any) => selectedIds[el.id] && !el.isDeleted,
        );

        const currentId = activeGeneratorIdRef.current;
        const currentVideoId = activeVideoGenIdRef.current;
        if (selectedElements.length === 1) {
          const sel = selectedElements[0];

          if (isImageGeneratorElement(sel)) {
            // Only update if the selected generator changed
            if (currentId !== sel.id) {
              const data = getImageGeneratorData(sel);
              setActiveGeneratorId(sel.id as string);
              setGeneratorData(data);
              if (currentVideoId) {
                setActiveVideoGenId(null);
                setVideoGenData(null);
                setVideoGenBounds(null);
              }
              if (activeVideoPlayerIdRef.current) {
                setActiveVideoPlayerId(null);
                setVideoPlayerData(null);
                setVideoPlayerBounds(null);
              }
            }
            // Always update bounds (element may have been moved/resized)
            setGeneratorBounds({
              x: sel.x as number,
              y: sel.y as number,
              width: sel.width as number,
              height: sel.height as number,
            });
          } else if (isVideoGeneratorElement(sel)) {
            if (currentVideoId !== sel.id) {
              const data = getVideoGeneratorData(sel);
              setActiveVideoGenId(sel.id as string);
              setVideoGenData(data);
              if (currentId) {
                setActiveGeneratorId(null);
                setGeneratorData(null);
                setGeneratorBounds(null);
              }
              if (activeVideoPlayerIdRef.current) {
                setActiveVideoPlayerId(null);
                setVideoPlayerData(null);
                setVideoPlayerBounds(null);
              }
            }
            setVideoGenBounds({
              x: sel.x as number,
              y: sel.y as number,
              width: sel.width as number,
              height: sel.height as number,
            });
          } else if (
            sel.type === "embeddable" &&
            (isVideoUrl(sel.link as string) || sel.customData?.isVideo === true)
          ) {
            if (activeVideoPlayerIdRef.current !== sel.id) {
              setActiveVideoPlayerId(sel.id as string);
              setVideoPlayerData({
                videoUrl: sel.link as string,
                mimeType: (sel.customData?.mimeType as string) ?? "video/mp4",
                ...(sel.customData?.durationSeconds != null
                  ? {
                      durationSeconds: sel.customData.durationSeconds as number,
                    }
                  : {}),
                ...(sel.customData?.title != null
                  ? { title: sel.customData.title as string }
                  : {}),
              });
              if (currentId) {
                setActiveGeneratorId(null);
                setGeneratorData(null);
                setGeneratorBounds(null);
              }
              if (currentVideoId) {
                setActiveVideoGenId(null);
                setVideoGenData(null);
                setVideoGenBounds(null);
              }
            }
            setVideoPlayerBounds({
              x: sel.x as number,
              y: sel.y as number,
              width: sel.width as number,
              height: sel.height as number,
            });
          } else {
            if (currentId || currentVideoId || activeVideoPlayerIdRef.current) {
              closeAllPanels();
            }
          }
        } else {
          if (currentId || currentVideoId || activeVideoPlayerIdRef.current) {
            closeAllPanels();
          }
        }

        // --- Generator status overlays ---
        // Build stable keys so we skip setState when overlay sets are unchanged.
        const generatorRaw = elements.filter(
          (el: any) =>
            !el.isDeleted &&
            (isImageGeneratorElement(el) || isVideoGeneratorElement(el)),
        );
        const generatingRaw = generatorRaw.filter(
          (el: any) => el.customData?.status === "generating",
        );
        const errorRaw = generatorRaw.filter(
          (el: any) => el.customData?.status === "error",
        );

        // Include viewport state as well, because the shimmer overlay is
        // rendered in screen coordinates and must move when the canvas pans
        // or zooms even if the scene element itself did not change.
        const genKey =
          generatingRaw
            .map(
              (el: any) => `${el.id}:${el.x}:${el.y}:${el.width}:${el.height}`,
            )
            .join("|") + `@${scrollX}:${scrollY}:${zoom}`;

        if (genKey !== prevGeneratingKeyRef.current) {
          prevGeneratingKeyRef.current = genKey;
          const generating = generatingRaw.map((el: any) => ({
            id: el.id as string,
            screenX: ((el.x as number) + scrollX) * zoom,
            screenY: ((el.y as number) + scrollY) * zoom,
            screenW: (el.width as number) * zoom,
            screenH: (el.height as number) * zoom,
            zoom,
            ...(el.customData?.model
              ? { model: el.customData.model as string }
              : {}),
          }));
          setGeneratingElements(generating);
        }

        const errorKey =
          errorRaw
            .map(
              (el: any) =>
                `${el.id}:${el.x}:${el.y}:${el.width}:${el.height}:${el.customData?.errorMessage ?? ""}`,
            )
            .join("|") + `@${scrollX}:${scrollY}:${zoom}`;

        if (errorKey !== prevErrorKeyRef.current) {
          prevErrorKeyRef.current = errorKey;
          const errored = errorRaw.map((el: any) => ({
            id: el.id as string,
            screenX: ((el.x as number) + scrollX) * zoom,
            screenY: ((el.y as number) + scrollY) * zoom,
            screenW: (el.width as number) * zoom,
            screenH: (el.height as number) * zoom,
            zoom,
            ...(typeof el.customData?.errorMessage === "string"
              ? { errorMessage: el.customData.errorMessage }
              : {}),
          }));
          setErrorElements(errored);
        }
      },
    );

    return unsubscribe;
  }, [excalidrawApi, closeAllPanels]);

  const handleToolChange = useCallback(
    (tool: ToolType) => {
      excalidrawApi?.setActiveTool({ type: tool });
    },
    [excalidrawApi],
  );

  const handleCreateImageGenerator = useCallback(() => {
    if (!excalidrawApi) return;
    const preferredModel = activeImageGenerationPreference?.models[0];
    const elementId = createImageGeneratorElement(excalidrawApi, {
      ...(preferredModel ? { model: preferredModel } : {}),
    });
    // Select the newly created element so onChange recognises it
    excalidrawApi.updateScene({
      appState: { selectedElementIds: { [elementId]: true } },
    });
    setActiveGeneratorId(elementId);
    // Read back the created element to populate initial state
    const elements = excalidrawApi.getSceneElements();
    const el = elements.find((e: any) => e.id === elementId);
    if (el) {
      setGeneratorData(getImageGeneratorData(el));
      setGeneratorBounds({
        x: el.x as number,
        y: el.y as number,
        width: el.width as number,
        height: el.height as number,
      });
    }
  }, [activeImageGenerationPreference, excalidrawApi]);

  const clearSelectionForElement = useCallback(
    (elementId: string | null) => {
      if (!elementId || !excalidrawApi) return;
      const selectedElementIds =
        excalidrawApi.getAppState()?.selectedElementIds;
      if (!selectedElementIds?.[elementId]) return;
      excalidrawApi.updateScene({
        appState: { selectedElementIds: {} },
        captureUpdate: "IMMEDIATELY",
      });
    },
    [excalidrawApi],
  );

  const handleCloseGenerator = useCallback(() => {
    clearSelectionForElement(activeGeneratorIdRef.current);
    setActiveGeneratorId(null);
    setGeneratorData(null);
    setGeneratorBounds(null);
  }, [clearSelectionForElement]);

  const handleCreateVideoGenerator = useCallback(() => {
    if (!excalidrawApi) return;
    const preferredModel = activeVideoGenerationPreference?.models[0];
    const elementId = createVideoGeneratorElement(excalidrawApi, {
      aspectRatio: "16:9",
      ...(preferredModel ? { model: preferredModel } : {}),
    });
    excalidrawApi.updateScene({
      appState: { selectedElementIds: { [elementId]: true } },
    });
    setActiveVideoGenId(elementId);
    const elements = excalidrawApi.getSceneElements();
    const el = elements.find((item: any) => item.id === elementId);
    if (el) {
      setVideoGenData(getVideoGeneratorData(el));
      setVideoGenBounds({
        x: el.x as number,
        y: el.y as number,
        width: el.width as number,
        height: el.height as number,
      });
    }
  }, [activeVideoGenerationPreference, excalidrawApi]);

  const handleCloseVideoGenerator = useCallback(() => {
    clearSelectionForElement(activeVideoGenIdRef.current);
    setActiveVideoGenId(null);
    setVideoGenData(null);
    setVideoGenBounds(null);
  }, [clearSelectionForElement]);

  const handleCloseVideoPlayer = useCallback(() => {
    clearSelectionForElement(activeVideoPlayerIdRef.current);
    setActiveVideoPlayerId(null);
    setVideoPlayerData(null);
    setVideoPlayerBounds(null);
  }, [clearSelectionForElement]);

  useEffect(() => {
    if (!activeGeneratorId && !activeVideoGenId && !activeVideoPlayerId) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (isExcalidrawContextMenuTarget(target)) return;
      const panel = document.querySelector("[data-aimc-generator-panel]");
      if (panel?.contains(target)) return;

      if (activeGeneratorIdRef.current) handleCloseGenerator();
      if (activeVideoGenIdRef.current) handleCloseVideoGenerator();
      if (activeVideoPlayerIdRef.current) handleCloseVideoPlayer();
    };

    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        handlePointerDownOutside,
        true,
      );
  }, [
    activeGeneratorId,
    activeVideoGenId,
    activeVideoPlayerId,
    handleCloseGenerator,
    handleCloseVideoGenerator,
    handleCloseVideoPlayer,
  ]);

  return (
    <>
      <div
        className="absolute bottom-[72px] z-30 flex max-w-[calc(100%_-_32px)] items-center gap-0.5 overflow-x-auto rounded-xl p-1 bg-card/75 backdrop-blur-lg border border-border shadow-card transition-[left,transform,bottom] duration-200 min-[900px]:bottom-5"
        style={{
          left: leftPanelOpen ? "calc(140px + 50%)" : "50%",
          transform: "translateX(-50%)",
        }}
      >
        {/* Standard Excalidraw tools */}
        {TOOL_GROUPS.map((tool, i) => {
          if (tool === null) {
            return (
              <div
                key={`sep-${i}`}
                className="mx-0.5 h-6 w-px shrink-0 bg-border"
              />
            );
          }

          const Icon = TOOL_ICONS[tool];
          const isActive = activeTool === tool;

          return (
            <ToolbarButton
              key={tool}
              label={t(TOOL_LABEL_KEYS[tool])}
              active={isActive}
              onMouseDown={(e) => {
                e.preventDefault();
                handleToolChange(tool);
              }}
            >
              <Icon className="size-[16px]" />
            </ToolbarButton>
          );
        })}

        {/* Separator before AI tools */}
        <div className="mx-0.5 h-6 w-px shrink-0 bg-border" />

        {/* AI Image -- creates a placeholder on canvas */}
        <ToolbarButton
          label={t("tools.generateImage")}
          active={Boolean(activeGeneratorId)}
          onClick={handleCreateImageGenerator}
        >
          <ImageGeneratorIcon />
        </ToolbarButton>

        <ToolbarButton
          label={t("tools.generateVideo")}
          active={Boolean(activeVideoGenId)}
          onClick={handleCreateVideoGenerator}
        >
          <Video className="size-[16px]" />
        </ToolbarButton>
      </div>

      {/* Image Generator Panel -- floats below the selected placeholder */}
      {activeGeneratorId && generatorData && generatorBounds && (
        <ImageGeneratorPanel
          elementId={activeGeneratorId}
          elementBounds={generatorBounds}
          data={generatorData}
          excalidrawApi={excalidrawApi}
          canvasScrollZoom={canvasScrollZoom}
          onClose={handleCloseGenerator}
        />
      )}

      {activeVideoGenId && videoGenData && videoGenBounds && (
        <VideoGeneratorPanel
          elementId={activeVideoGenId}
          elementBounds={videoGenBounds}
          canvasId={canvasId}
          data={videoGenData}
          excalidrawApi={excalidrawApi}
          projectId={projectId}
          canvasScrollZoom={canvasScrollZoom}
          onClose={handleCloseVideoGenerator}
        />
      )}

      {activeVideoPlayerId && videoPlayerData && videoPlayerBounds && (
        <VideoPlayerPanel
          elementId={activeVideoPlayerId}
          elementBounds={videoPlayerBounds}
          videoUrl={videoPlayerData.videoUrl}
          mimeType={videoPlayerData.mimeType}
          {...(videoPlayerData.durationSeconds != null
            ? { durationSeconds: videoPlayerData.durationSeconds }
            : {})}
          {...(videoPlayerData.title != null
            ? { title: videoPlayerData.title }
            : {})}
          canvasScrollZoom={canvasScrollZoom}
          onClose={handleCloseVideoPlayer}
        />
      )}

      {/* Shimmer overlays for generating elements */}
      {generatingElements.length > 0 &&
        createPortal(
          <>
            {generatingElements.map((el) => (
              <GeneratingOverlay
                key={el.id}
                {...el}
                label={t("tools.generating")}
              />
            ))}
          </>,
          document.body,
        )}

      {errorElements.length > 0 &&
        createPortal(
          <>
            {errorElements.map((el) => (
              <GeneratorErrorOverlay
                key={el.id}
                {...el}
                errorMessage={el.errorMessage || t("tools.generateFailed")}
              />
            ))}
          </>,
          document.body,
        )}
    </>
  );
}
