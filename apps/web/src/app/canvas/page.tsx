"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import type { StreamEvent, ToolArtifact } from "@aimc/shared";
import { BrandKitSelector } from "../../components/brand-kit-selector";
import { CanvasBottomBar } from "../../components/canvas-bottom-bar";
import { CanvasEditor } from "../../components/canvas-editor";
import type { CanvasSelectedElement } from "../../components/canvas-editor";
import { CanvasEmptyHint } from "../../components/canvas-empty-hint";
import { CanvasFilesPanel } from "../../components/canvas-files-panel";
import type { CanvasImageItem } from "../../components/canvas-image-picker";
import { CanvasLayersPanel } from "../../components/canvas-layers-panel";
import { CanvasLogoMenu } from "../../components/canvas-logo-menu";
import { ChatSidebar } from "../../components/chat-sidebar";
import { EditableProjectName } from "../../components/editable-project-name";
import { LoadingScreen } from "../../components/loading-screen";
import { useToast } from "../../components/toast";
import { Button } from "../../components/ui/button";
import { useWebSocket } from "../../hooks/use-websocket";
import {
  insertImageOnCanvas,
  insertVideoOnCanvas,
} from "../../lib/canvas-elements";
import { SHOW_BRAND_KIT_ENTRY_POINTS } from "../../lib/feature-flags";
import {
  type GenerationJobSubscription,
  generationJobService,
} from "../../lib/generation-job-service";
import { fetchCanvas, fetchProject } from "../../lib/server-api";

function CanvasPageContent() {
  const searchParams = useSearchParams();
  const canvasId = searchParams.get("id");
  const initialSessionId = searchParams.get("session") ?? undefined;
  // Capture prompt once — router.replace will strip it from URL, but the
  // value must survive for the auto-send effect in ChatSidebar.
  const [initialPrompt] = useState(() => searchParams.get("prompt") ?? undefined);
  const router = useRouter();

  const [canvasData, setCanvasData] = useState<{
    id: string;
    name: string;
    projectId: string;
    content: {
      elements: Record<string, unknown>[];
      appState: Record<string, unknown>;
      files: Record<string, Record<string, unknown>>;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  // Default chat open on desktop, closed on mobile/tablet to avoid blocking canvas
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1024;
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled");
  const [selectedCanvasElements, setSelectedCanvasElements] = useState<CanvasSelectedElement[]>([]);
  const { error: toastError } = useToast();

  const excalidrawApiRef = useRef<any>(null);
  const fallbackSubscriptionsRef = useRef<GenerationJobSubscription[]>([]);
  const [excalidrawApi, setExcalidrawApi] = useState<any>(null);

  const routerRef = useRef(router);
  routerRef.current = router;

  // Stable callbacks for panel toggles to prevent re-renders of child components
  const handleOpenChat = useCallback(() => setChatOpen(true), []);
  const handleToggleChat = useCallback(() => setChatOpen((v) => !v), []);
  const handleToggleLayers = useCallback(() => { setLayersOpen((v) => !v); setFilesOpen(false); }, []);
  const handleToggleFiles = useCallback(() => { setFilesOpen((v) => !v); setLayersOpen(false); }, []);
  const handleCloseLayers = useCallback(() => setLayersOpen(false), []);
  const handleCloseFiles = useCallback(() => setFilesOpen(false), []);

  const ws = useWebSocket();

  const handleApiReady = useCallback((api: any) => {
    excalidrawApiRef.current = api;
    setExcalidrawApi(api);
  }, []);

  const handleImageGenerated = useCallback((artifact: ToolArtifact) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const task =
      artifact.type === "video"
        ? insertVideoOnCanvas(api, artifact)
        : insertImageOnCanvas(api, artifact);
    task.catch((err) => {
      console.warn("Failed to insert generated media on canvas:", err);
    });
  }, []);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      if (event.type !== "tool.completed") return;
      const output = event.output as
        | {
            jobId?: unknown;
            jobType?: unknown;
            videoUrl?: unknown;
            url?: unknown;
            elementId?: unknown;
          }
        | undefined;
      const jobId = typeof output?.jobId === "string" ? output.jobId : null;
      const jobType =
        output?.jobType === "image_generation" ||
        output?.jobType === "video_generation"
          ? output.jobType
          : null;
      if (!jobId || !jobType) return;
      if (typeof output?.elementId === "string") return;
      if (typeof output?.videoUrl === "string" || typeof output?.url === "string") {
        return;
      }
      const isVideo = jobType === "video_generation";
      const subscription = generationJobService.watch(jobId, {
        jobType,
        onSucceeded: (result) => {
          const url = result.signed_url;
          const mimeType = result.mime_type;
          const width = result.width;
          const height = result.height;
          if (
            typeof url !== "string" ||
            typeof mimeType !== "string" ||
            typeof width !== "number" ||
            typeof height !== "number"
          ) {
            return;
          }
          if (isVideo) {
            const durationSeconds = result.duration_seconds;
            handleImageGenerated({
              type: "video",
              url,
              mimeType,
              width,
              height,
              ...(typeof durationSeconds === "number"
                ? { durationSeconds }
                : {}),
              jobId,
            });
          } else {
            handleImageGenerated({
              type: "image",
              url,
              mimeType,
              width,
              height,
              jobId,
            });
          }
        },
        onFailed: (err) => {
          console.warn("[canvas] fallback generation polling failed:", err);
        },
      });
      void subscription.promise.catch(() => {
        // Failure is surfaced through onFailed; no UI state lives in this page path.
      });
      fallbackSubscriptionsRef.current.push(subscription);
    },
    [handleImageGenerated],
  );

  useEffect(() => {
    return () => {
      fallbackSubscriptionsRef.current.forEach((subscription) =>
        subscription.unsubscribe(),
      );
      fallbackSubscriptionsRef.current = [];
    };
  }, []);

  // Must be defined BEFORE useJobFallbackPolling which references it
  const handleCanvasSync = useCallback(async () => {
    const api = excalidrawApiRef.current;
    if (!api || !canvasData) return;
    try {
      const { canvas } = await fetchCanvas(canvasData.id);
      const elements = canvas.content.elements ?? [];
      const files = (canvas.content as Record<string, unknown>).files as
        Record<string, { id: string; dataURL: string; mimeType: string; created: number }> | undefined;

      // Sync files (base64 dataURLs from backend-inserted images) into Excalidraw
      if (files && Object.keys(files).length > 0) {
        api.addFiles(Object.values(files));
      }

      api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
    } catch (err) {
      console.warn("Failed to sync canvas:", err);
    }
  }, [canvasData]);

  const handleSessionChange = useCallback(
    (sessionId: string) => {
      if (!canvasId) return;
      // Update URL: set session param, remove prompt param to prevent re-send on refresh
      routerRef.current.replace(`/canvas?id=${canvasId}&session=${sessionId}`);
    },
    [canvasId],
  );

  const handleRequestCanvasImages = useCallback((): CanvasImageItem[] => {
    const api = excalidrawApiRef.current;
    if (!api) return [];
    const elements: any[] = api.getSceneElements() ?? [];
    const files: Record<string, any> = api.getFiles() ?? {};
    let idx = 0;
    return elements
      .filter((el: any) => el.type === "image" && !el.isDeleted && el.fileId)
      .map((el: any) => {
        idx++;
        const file = files[el.fileId];
        const dataURL = file?.dataURL ?? "";
        const title =
          el.customData?.title ||
          el.customData?.label ||
          `Image ${idx}`;
        return {
          kind: "canvas-image",
          id: el.id,
          name: title,
          thumbnailUrl: dataURL,
          assetId: el.id,
          url: el.customData?.storageUrl ?? dataURL,
          mimeType: file?.mimeType ?? "image/png",
        };
      });
  }, []);

  const loadProjectShell = useCallback(
    async (projectId: string) => {
      try {
        const projectData = await fetchProject(projectId);
        setBrandKitId(projectData.project.brandKitId);
        setProjectName(projectData.project.name ?? "Untitled");
      } catch (err) {
        console.warn("Failed to fetch project for brand kit:", err);
        toastError("项目信息加载失败，请重试。");
      }
    },
    [toastError],
  );

  useEffect(() => {
    if (!canvasId) return;

    setPageLoading(true);
    fetchCanvas(canvasId)
      .then((data) => {
        const c = data.canvas;
        setCanvasData({
          id: c.id,
          name: c.name,
          projectId: c.projectId,
          content: {
            elements: c.content.elements ?? [],
            appState: c.content.appState ?? {},
            files: (c.content as any).files ?? {},
          },
        });
        setPageLoading(false);
        void loadProjectShell(c.projectId);
      })
      .catch(() => {
        setError("Failed to load the local canvas.");
        setPageLoading(false);
      });
  }, [canvasId, loadProjectShell]);

  if (!canvasId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">No canvas ID specified.</p>
      </div>
    );
  }

  if (pageLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!canvasData) return null;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Top-left navigation bar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
        <CanvasLogoMenu
          projectId={canvasData.projectId}
          canvasId={canvasData.id}
          excalidrawApi={excalidrawApi}
        />
        <EditableProjectName
          projectId={canvasData.projectId}
          initialName={projectName}
        />
        {SHOW_BRAND_KIT_ENTRY_POINTS && (
          <BrandKitSelector
            projectId={canvasData.projectId}
            currentBrandKitId={brandKitId}
            onBrandKitChange={(kitId) => setBrandKitId(kitId)}
          />
        )}
      </div>
      {/* Canvas always takes full width; on mobile/tablet, ChatSidebar overlays instead of side-by-side */}
      <div className="flex-1 relative min-w-0 overflow-hidden">
        <CanvasEditor
          canvasId={canvasData.id}
          projectId={canvasData.projectId}
          initialContent={canvasData.content}
          onApiReady={handleApiReady}
          ws={ws}
          leftPanelOpen={layersOpen || filesOpen}
          onSelectionChange={setSelectedCanvasElements}
        />
        <CanvasEmptyHint
          excalidrawApi={excalidrawApi}
          onOpenChat={handleOpenChat}
        />
        <CanvasBottomBar
          excalidrawApi={excalidrawApi}
          layersOpen={layersOpen}
          onToggleLayers={handleToggleLayers}
          filesOpen={filesOpen}
          onToggleFiles={handleToggleFiles}
          leftPanelOpen={layersOpen || filesOpen}
        />
        <CanvasLayersPanel
          excalidrawApi={excalidrawApi}
          open={layersOpen}
          onClose={handleCloseLayers}
        />
        <CanvasFilesPanel
          excalidrawApi={excalidrawApi}
          open={filesOpen}
          onClose={handleCloseFiles}
        />
      </div>
      <ChatSidebar
        canvasId={canvasData.id}
        projectId={canvasData.projectId}
        open={chatOpen}
        onToggle={handleToggleChat}
        onImageGenerated={handleImageGenerated}
        onCanvasSync={handleCanvasSync}
        onStreamEvent={handleStreamEvent}
        initialPrompt={initialPrompt}
        initialSessionId={initialSessionId}
        onSessionChange={handleSessionChange}
        onRequestCanvasImages={handleRequestCanvasImages}
        currentBrandKitId={SHOW_BRAND_KIT_ENTRY_POINTS ? brandKitId : null}
        ws={ws}
        selectedCanvasElements={selectedCanvasElements}
      />
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CanvasPageContent />
    </Suspense>
  );
}
