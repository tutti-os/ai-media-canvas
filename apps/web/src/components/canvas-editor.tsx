"use client";

import "@excalidraw/excalidraw/index.css";

import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketHandle } from "../hooks/use-websocket";
import { useAppTranslation } from "../i18n";
import { fetchAsDataURL, isVideoUrl } from "../lib/canvas-elements";
import {
  prepareCanvasImageFiles,
  serializeExcalidrawFiles,
} from "../lib/canvas-file-serialization";
import {
  normalizeCanvasElementIndices,
  normalizeCanvasElements,
} from "../lib/canvas-normalize";
import { getServerBaseUrl } from "../lib/env";
import { toRuntimeAssetUrl } from "../lib/local-assets";
import { saveCanvas, uploadThumbnail } from "../lib/server-api";
import { CanvasContextMenuExtensions } from "./canvas-context-menu-extensions";
import { CanvasToolMenu } from "./canvas-tool-menu";
import { VideoCanvasElement } from "./canvas/video-canvas-element";
import { ErrorBoundary } from "./error-boundary";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false },
);

// Safari <16.4 does not support requestIdleCallback — provide a fallback
// that defers via setTimeout(cb, 1) to approximate idle scheduling.
const ric: typeof requestIdleCallback =
  typeof window !== "undefined" && window.requestIdleCallback
    ? window.requestIdleCallback.bind(window)
    : (cb: IdleRequestCallback) => setTimeout(cb, 1) as unknown as number;
const cic: typeof cancelIdleCallback =
  typeof window !== "undefined" && window.cancelIdleCallback
    ? window.cancelIdleCallback.bind(window)
    : clearTimeout;

// Memoize CanvasToolMenu to prevent re-renders when parent state changes
// (e.g. selection changes in the editor don't need to re-render the toolbar)
const MemoizedCanvasToolMenu = memo(CanvasToolMenu);

export type CanvasSelectedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fileId?: string;
  dataUrl?: string;
  /** Preferred persisted asset URL for message attachments. */
  storageUrl?: string;
};

type CanvasEditorProps = {
  canvasId: string;
  projectId: string;
  initialContent: {
    elements: Record<string, unknown>[];
    appState: Record<string, unknown>;
    files: Record<string, Record<string, unknown>>;
  };
  onApiReady?: (api: ExcalidrawApi) => void;
  ws?: WebSocketHandle;
  leftPanelOpen?: boolean;
  onSelectionChange?: (elements: CanvasSelectedElement[]) => void;
};

type CanvasFileRecord = Record<string, unknown>;

type CanvasSceneElement = Record<string, unknown> & {
  customData?: Record<string, unknown>;
  fileId?: string | null;
  height?: number;
  id: string;
  isDeleted?: boolean;
  link?: string | null;
  text?: string | null;
  type: string;
  width?: number;
  x?: number;
  y?: number;
};

type CanvasAppState = Record<string, unknown> & {
  gridModeEnabled?: unknown;
  height?: number;
  scrollX?: number;
  scrollY?: number;
  selectedElementIds?: Record<string, boolean>;
  viewBackgroundColor?: unknown;
  width?: number;
  zoom?: { value?: number };
};

type ExcalidrawApi = {
  addFiles(files: CanvasFileRecord[]): void;
  getAppState(): CanvasAppState;
  getFiles(): Record<string, CanvasFileRecord>;
  getSceneElements(): readonly CanvasSceneElement[];
  onChange(
    handler: (elements: CanvasSceneElement[], appState: CanvasAppState) => void,
  ): () => void;
  setActiveTool(tool: { type: string }): void;
  updateScene(scene: Record<string, unknown>): void;
};

const SAVE_DEBOUNCE_MS = 1500;
const THUMBNAIL_DEBOUNCE_MS = 10_000;
const THUMBNAIL_MAX_SIZE = 800;
const REMOTE_SYNC_SAVE_SUPPRESSION_MS = 1200;

function pickPersistedAppState(appState: CanvasAppState) {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridModeEnabled: appState.gridModeEnabled,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    width: appState.width,
    height: appState.height,
    zoom: appState.zoom,
  };
}

function isCanvasSceneElement(value: unknown): value is CanvasSceneElement {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { type?: unknown }).type === "string",
  );
}

function isLiveElement(element: unknown): element is CanvasSceneElement {
  return (
    isCanvasSceneElement(element) &&
    (element as { isDeleted?: unknown }).isDeleted !== true
  );
}

export function CanvasEditor({
  canvasId,
  projectId,
  initialContent,
  onApiReady,
  ws,
  leftPanelOpen,
  onSelectionChange,
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  const { i18n } = useAppTranslation();
  const excalidrawLangCode = (
    i18n.resolvedLanguage ?? i18n.language
  ).startsWith("en")
    ? "en"
    : "zh-CN";
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasIdRef = useRef(canvasId);
  canvasIdRef.current = canvasId;
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawApi | null>(
    null,
  );
  const prevSelectedIdsRef = useRef<string>("");
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  // Tracks whether the one-time normalization pass has already run
  const normalizedRef = useRef(false);
  const suppressSaveUntilRef = useRef(0);

  // Guard: prevent auto-save until Excalidraw has fully hydrated with initial data.
  // Without this, a page reload can fire onChange with empty elements before
  // initialData is applied, causing a FULL REPLACE that wipes existing content.
  const hydratedRef = useRef(false);
  const initialElementCountRef = useRef(
    initialContent.elements.filter(isLiveElement).length,
  );

  // Track pending save payload so we can flush on tab close / unmount
  const pendingSaveRef = useRef<{
    elements: Record<string, unknown>[];
    appState: Record<string, unknown>;
    files: Record<string, Record<string, unknown>>;
  } | null>(null);

  // Separate inline files (ready) from storage URLs (need async fetch)
  const preparedInitialContent = useMemo(() => {
    const prepared = prepareCanvasImageFiles(initialContent);
    const elements = prepared.elements.map((element) => ({ ...element }));
    const indicesChanged = normalizeCanvasElementIndices(elements);
    return { ...prepared, elements, indicesChanged };
  }, [initialContent]);
  const {
    elements: initialElements,
    files: initialFiles,
    inlineFiles,
    pendingUrls,
    indicesChanged: initialIndicesChanged,
  } = preparedInitialContent;
  const initialIndicesChangedRef = useRef(initialIndicesChanged);
  initialIndicesChangedRef.current = initialIndicesChanged;

  useEffect(() => {
    const handleRemoteSync = (event: Event) => {
      const detail = (event as CustomEvent<{ canvasId?: string }>).detail;
      if (detail?.canvasId && detail.canvasId !== canvasIdRef.current) return;
      suppressSaveUntilRef.current =
        Date.now() + REMOTE_SYNC_SAVE_SUPPRESSION_MS;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
    };
    window.addEventListener("aimc:canvas-remote-sync", handleRemoteSync);
    return () => {
      window.removeEventListener("aimc:canvas-remote-sync", handleRemoteSync);
    };
  }, []);

  // Ref to hold recovered file metadata for storageUrl lookup in handleChange
  // without adding the full initialContent to the dependency array.
  const initialFilesRef = useRef(initialFiles);
  initialFilesRef.current = initialFiles;

  // Lazily resolve storage URLs and inject into Excalidraw
  useEffect(() => {
    if (!excalidrawApi || pendingUrls.length === 0) return;
    const api = excalidrawApi;
    let cancelled = false;

    async function resolveFiles() {
      const resolved: Record<string, CanvasFileRecord> = {};
      await Promise.all(
        pendingUrls.map(async ({ fileId, url, meta }) => {
          try {
            const dataURL = await fetchAsDataURL(url);
            resolved[fileId] = {
              id: meta.id ?? fileId,
              mimeType:
                meta.mimeType ??
                /^data:([^;]+)/.exec(dataURL)?.[1] ??
                "image/png",
              created: meta.created ?? Date.now(),
              dataURL,
              ...(meta.storageUrl ? { storageUrl: meta.storageUrl } : {}),
              ...(meta.objectPath ? { objectPath: meta.objectPath } : {}),
            };
          } catch (err) {
            console.warn(
              `[canvas-editor] Failed to resolve file ${fileId}:`,
              err,
            );
          }
        }),
      );
      if (!cancelled && Object.keys(resolved).length > 0) {
        api.addFiles(Object.values(resolved));
        console.log(
          `[canvas-editor] Resolved ${Object.keys(resolved).length} storage files`,
        );
      }
    }

    resolveFiles();
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, pendingUrls]);

  const handleExcalidrawApi = useCallback(
    (api: unknown) => {
      const canvasApi = api as ExcalidrawApi;
      setExcalidrawApi(canvasApi);
      onApiReady?.(canvasApi);
    },
    [onApiReady],
  );

  // Normalize agent-created elements on initial load.
  // Uses DOM text measurement to fix server-side approximation errors.
  useEffect(() => {
    if (!excalidrawApi || normalizedRef.current) return;
    normalizedRef.current = true;

    // Run normalization after Excalidraw has loaded fonts.
    // Store the handle so we can cancel on unmount to prevent memory leaks.
    const idleHandle = ric(() => {
      try {
        const sceneElements = excalidrawApi.getSceneElements();
        // Create mutable copies for normalization
        const mutableElements = sceneElements.map((el) => ({ ...el }));
        const { changed } = normalizeCanvasElements(mutableElements);

        if (changed || initialIndicesChangedRef.current) {
          console.log("[canvas-editor] normalized agent-created elements");
          excalidrawApi.updateScene({
            elements: mutableElements,
            captureUpdate: "NONE",
          });
          // Persist normalized elements to DB
          const files: Record<string, Record<string, unknown>> = {};
          const rawFiles = excalidrawApi.getFiles();
          Object.assign(
            files,
            serializeExcalidrawFiles(rawFiles, initialFilesRef.current),
          );
          const appState = excalidrawApi.getAppState();
          saveCanvas(canvasIdRef.current, {
            elements: mutableElements.filter(isLiveElement),
            appState: pickPersistedAppState(appState),
            files,
          }).catch((err: Error) =>
            console.warn("[canvas-editor] normalization save failed:", err),
          );
        }
      } catch (err) {
        console.warn("[canvas-editor] normalization failed:", err);
      }

      // Mark hydrated after normalization — auto-save is now safe.
      // Before this point, onChange may fire with incomplete element lists
      // during Excalidraw's internal initialization, which would cause a
      // FULL REPLACE with empty content and silently wipe existing data.
      hydratedRef.current = true;
    });
    return () => cic(idleHandle);
  }, [excalidrawApi]);

  const handleChange = useCallback(
    (elements: readonly unknown[], appStateInput: unknown) => {
      const appState = appStateInput as CanvasAppState;
      // Skip auto-save until Excalidraw has fully hydrated with initial data.
      // During initialization, onChange may fire with empty/partial elements
      // which would wipe the persisted canvas via FULL REPLACE.
      if (!hydratedRef.current) return;

      const shouldPersist = Date.now() >= suppressSaveUntilRef.current;

      if (shouldPersist) {
        // --- 1. Debounced save ---
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        // Mark that a save is pending. The full payload is built lazily inside
        // the timeout to avoid constructing the files map on every drag frame.
        pendingSaveRef.current = { elements: [], appState: {}, files: {} };

        saveTimerRef.current = setTimeout(() => {
          // Build the full payload only when the debounce fires
          const files: Record<string, Record<string, unknown>> = {};
          if (excalidrawApi) {
            const rawFiles = excalidrawApi.getFiles();
            Object.assign(
              files,
              serializeExcalidrawFiles(rawFiles, initialFilesRef.current),
            );
          }
          const content = {
            elements: elements.filter(isLiveElement),
            appState: pickPersistedAppState(appState),
            files,
          };
          if (
            content.elements.length === 0 &&
            initialElementCountRef.current > 0
          ) {
            console.warn(
              "[canvas-editor] skipping debounced save: 0 elements but loaded with",
              initialElementCountRef.current,
            );
            pendingSaveRef.current = null;
            return;
          }
          pendingSaveRef.current = content;

          saveCanvas(canvasId, content)
            .then(() => {
              if (pendingSaveRef.current === content) {
                pendingSaveRef.current = null;
              }
            })
            .catch((err) => console.error("[canvas-editor] save failed:", err));
        }, SAVE_DEBOUNCE_MS);

        // --- 2. Debounced thumbnail (runs much less frequently than save) ---
        if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
        thumbnailTimerRef.current = setTimeout(async () => {
          if (!excalidrawApi) return;
          try {
            const { exportToBlob } = await import("@excalidraw/excalidraw");
            const sceneElements = excalidrawApi.getSceneElements();
            const sceneFiles = excalidrawApi.getFiles();
            if (!sceneElements.length) return;

            const blob = await exportToBlob({
              elements: sceneElements as never,
              appState: { exportBackground: true },
              files: sceneFiles as never,
              mimeType: "image/webp",
              quality: 0.8,
              maxWidthOrHeight: THUMBNAIL_MAX_SIZE,
            });

            console.log(
              "[canvas-editor] uploading thumbnail, blob size:",
              blob.size,
            );
            await uploadThumbnail(projectId, blob);
            console.log("[canvas-editor] thumbnail uploaded OK");
          } catch (err) {
            console.warn(
              "[canvas-editor] thumbnail generation/upload failed:",
              err,
            );
          }
        }, THUMBNAIL_DEBOUNCE_MS);
      }

      // --- 3. Selection change detection ---
      // Cheap string comparison avoids unnecessary downstream re-renders.
      const selectedElementIds = appState.selectedElementIds as
        | Record<string, boolean>
        | undefined;
      const selectedIds = selectedElementIds
        ? Object.keys(selectedElementIds)
            .filter((id) => selectedElementIds[id])
            .sort()
            .join(",")
        : "";

      if (selectedIds !== prevSelectedIdsRef.current) {
        prevSelectedIdsRef.current = selectedIds;
        if (onSelectionChangeRef.current) {
          if (!selectedIds) {
            onSelectionChangeRef.current([]);
          } else {
            const idSet = new Set(selectedIds.split(","));
            const selFiles: Record<string, CanvasFileRecord> =
              excalidrawApi?.getFiles() ?? {};
            const selected: CanvasSelectedElement[] = elements
              .filter(
                (el): el is CanvasSceneElement =>
                  isLiveElement(el) && idSet.has(el.id),
              )
              .map((el) => {
                const base: CanvasSelectedElement = {
                  id: el.id,
                  type: el.type,
                  x: el.x ?? 0,
                  y: el.y ?? 0,
                  width: el.width ?? 0,
                  height: el.height ?? 0,
                };
                if (el.type === "text" && el.text) {
                  base.text = el.text;
                }
                if (el.type === "image" && el.fileId) {
                  base.fileId = el.fileId;
                  const file = selFiles[el.fileId];
                  if (typeof file?.dataURL === "string") {
                    base.dataUrl = file.dataURL;
                  }
                  // Prefer storage URL over base64 dataUrl for message attachments.
                  // Sources: 1) element customData (model-generated images)
                  //          2) initial canvas content files (server-resolved URLs)
                  const sUrl =
                    el.customData?.storageUrl ??
                    initialFilesRef.current[el.fileId]?.storageUrl;
                  if (typeof sUrl === "string" && sUrl) {
                    base.storageUrl = sUrl;
                  }
                }
                return base;
              });
            onSelectionChangeRef.current(selected);
          }
        }
      }
    },
    [canvasId, projectId, excalidrawApi],
  );

  // Register screenshot RPC handler so the server can request canvas captures
  useEffect(() => {
    if (!ws || !excalidrawApi) return;

    const cleanup = ws.registerRPC("canvas.screenshot", async (params) => {
      const {
        mode,
        region,
        max_dimension = 1024,
      } = params as {
        mode: string;
        region?: { x: number; y: number; width: number; height: number };
        max_dimension?: number;
      };

      const allElements = excalidrawApi
        .getSceneElements()
        .filter(isLiveElement);
      const appState = excalidrawApi.getAppState();
      const files = excalidrawApi.getFiles();

      let elements = allElements;

      if (mode === "region" && region) {
        elements = allElements.filter((el) => {
          const ex = el.x ?? 0;
          const ey = el.y ?? 0;
          const ew = el.width ?? 0;
          const eh = el.height ?? 0;
          return !(
            ex + ew < region.x ||
            ex > region.x + region.width ||
            ey + eh < region.y ||
            ey > region.y + region.height
          );
        });
      } else if (mode === "viewport") {
        const zoom = (appState.zoom?.value as number) ?? 1;
        const sx = -((appState.scrollX as number) ?? 0);
        const sy = -((appState.scrollY as number) ?? 0);
        const vw = ((appState.width as number) ?? 1920) / zoom;
        const vh = ((appState.height as number) ?? 1080) / zoom;
        elements = allElements.filter((el) => {
          const ex = el.x ?? 0;
          const ey = el.y ?? 0;
          const ew = el.width ?? 0;
          const eh = el.height ?? 0;
          return !(
            ex + ew < sx ||
            ex > sx + vw ||
            ey + eh < sy ||
            ey > sy + vh
          );
        });
      }

      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements: elements as never,
        appState: { ...appState, exportBackground: true },
        files: files as never,
        maxWidthOrHeight: max_dimension,
        mimeType: "image/png",
      });

      // Convert blob to base64 data URL directly (no upload needed --
      // the image is passed inline to the model for visual understanding)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () =>
          reject(new Error("Failed to convert screenshot to data URL"));
        reader.readAsDataURL(blob);
      });

      const bmp = await createImageBitmap(blob);
      const width = bmp.width;
      const height = bmp.height;
      bmp.close();

      return { url: dataUrl, width, height };
    });

    return cleanup;
  }, [ws, excalidrawApi]);

  // Build a full save payload from current Excalidraw state.
  // Used by both beforeunload and unmount to flush pending changes.
  const buildSavePayload = useCallback(() => {
    if (!excalidrawApi) return null;
    // Never flush before hydration — Excalidraw may not have loaded elements yet
    if (!hydratedRef.current) return null;
    try {
      const sceneElements = excalidrawApi.getSceneElements();
      const rawFiles = excalidrawApi.getFiles();
      const appState = excalidrawApi.getAppState();

      // Safety: refuse to save empty when we loaded with elements — prevents
      // race conditions from wiping canvas content during page teardown.
      const liveCount = sceneElements.filter(isLiveElement).length;
      if (liveCount === 0 && initialElementCountRef.current > 0) {
        console.warn(
          "[canvas-editor] skipping save: 0 elements but loaded with",
          initialElementCountRef.current,
        );
        return null;
      }
      const files: Record<string, Record<string, unknown>> = {};
      Object.assign(
        files,
        serializeExcalidrawFiles(rawFiles, initialFilesRef.current),
      );
      return {
        elements: sceneElements.filter(isLiveElement),
        appState: pickPersistedAppState(appState),
        files,
      };
    } catch (err) {
      console.warn(
        "[canvas-editor] failed to build save payload on flush:",
        err,
      );
      return null;
    }
  }, [excalidrawApi]);

  // Keep buildSavePayload accessible without stale closures
  const buildSavePayloadRef = useRef(buildSavePayload);
  buildSavePayloadRef.current = buildSavePayload;

  // Flush pending save on page close (beforeunload) and component unmount
  useEffect(() => {
    const flushBeforeUnload = () => {
      if (!pendingSaveRef.current) return;

      // Build the real payload since pendingSaveRef may hold a placeholder
      const payload = buildSavePayloadRef.current();
      if (!payload) return;

      // Use fetch with keepalive to ensure the request survives page teardown.
      // keepalive requests are limited to 64 KiB total in-flight per page; for
      // canvases with very large embedded files this may exceed the limit, but
      // it's the best-effort approach -- sendBeacon has the same constraint.
      const url = `${getServerBaseUrl()}/api/canvases/${canvasIdRef.current}`;
      try {
        fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: payload }),
          keepalive: true,
        });
      } catch {
        // Best-effort -- nothing we can do if it fails during page teardown
      }
      pendingSaveRef.current = null;
    };

    window.addEventListener("beforeunload", flushBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", flushBeforeUnload);

      // Cancel pending debounce timers
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);

      // Flush pending save on component unmount (e.g. SPA navigation)
      if (pendingSaveRef.current) {
        const payload = buildSavePayloadRef.current();
        if (payload) {
          saveCanvas(canvasIdRef.current, payload).catch(console.error);
        }
        pendingSaveRef.current = null;
      }
    };
  }, []);

  const renderEmbeddable = useCallback((element: unknown) => {
    const record =
      element && typeof element === "object"
        ? (element as Record<string, unknown>)
        : {};
    const customData =
      record.customData && typeof record.customData === "object"
        ? (record.customData as Record<string, unknown>)
        : {};
    const link = record.link;
    const videoUrl =
      typeof customData.videoUrl === "string"
        ? customData.videoUrl
        : typeof link === "string"
          ? link
          : null;
    if (videoUrl && (isVideoUrl(videoUrl) || customData.isVideo === true)) {
      const assetId =
        typeof customData.assetId === "string" ? customData.assetId : null;
      return (
        <VideoCanvasElement
          src={toRuntimeAssetUrl(videoUrl, assetId)}
          width={typeof record.width === "number" ? record.width : 640}
          height={typeof record.height === "number" ? record.height : 360}
          title={
            typeof customData.title === "string" ? customData.title : undefined
          }
          prompt={
            typeof customData.prompt === "string"
              ? customData.prompt
              : undefined
          }
          model={
            typeof customData.model === "string" ? customData.model : undefined
          }
          durationSeconds={
            typeof customData.durationSeconds === "number"
              ? customData.durationSeconds
              : undefined
          }
          resolution={
            typeof customData.resolution === "string"
              ? customData.resolution
              : undefined
          }
          aspectRatio={
            typeof customData.aspectRatio === "string"
              ? customData.aspectRatio
              : undefined
          }
          mimeType={
            typeof customData.mimeType === "string"
              ? customData.mimeType
              : undefined
          }
        />
      );
    }
    return null;
  }, []);

  const validateEmbeddable = useCallback(() => true, []);

  return (
    <ErrorBoundary
      onError={(err) => console.error("[canvas-editor] render crashed:", err)}
    >
      <div className="h-full w-full relative">
        <Excalidraw
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          langCode={excalidrawLangCode}
          initialData={
            {
              elements: initialElements,
              appState: initialContent.appState,
              files: inlineFiles,
            } as never
          }
          onChange={handleChange}
          excalidrawAPI={handleExcalidrawApi}
          renderEmbeddable={renderEmbeddable}
          validateEmbeddable={validateEmbeddable}
        />
        {excalidrawApi && (
          <>
            <CanvasContextMenuExtensions excalidrawApi={excalidrawApi} />
            <MemoizedCanvasToolMenu
              canvasId={canvasId}
              excalidrawApi={excalidrawApi}
              leftPanelOpen={leftPanelOpen ?? false}
              projectId={projectId}
            />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
