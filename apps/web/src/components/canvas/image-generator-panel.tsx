"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import {
  createExcalidrawImageElement,
  fetchAsDataURL,
} from "../../lib/canvas-elements";
import { calculateCenteredGeneratorPanelPosition } from "../../lib/canvas-generator-panel-position";
import {
  type ImageGeneratorData,
  resizeImageGeneratorElement,
  updateImageGeneratorElement,
} from "../../lib/canvas-image-generator";
import { withNormalizedCanvasElementIndices } from "../../lib/canvas-normalize";
import { formatProviderLabel } from "../../lib/provider-labels";
import type { ImageModelInfo } from "../../lib/server-api";
import { fetchImageModels, generateImageDirect } from "../../lib/server-api";

type ImageGeneratorPanelProps = {
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  data: ImageGeneratorData;
  excalidrawApi: any;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  onClose: () => void;
};

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const PANEL_WIDTH = 450;

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

export function ImageGeneratorPanel({
  elementId,
  elementBounds,
  data,
  excalidrawApi,
  canvasScrollZoom,
  onClose,
}: ImageGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { handleGenerationError } = useGenerationErrorHandler();
  // AbortController for canceling only when a newer generation supersedes this one.
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const modelRef = useRef(model);
  const lastElementIdRef = useRef(elementId);
  modelRef.current = model;

  useEffect(() => {
    if (lastElementIdRef.current === elementId) return;
    lastElementIdRef.current = elementId;
    setPrompt(data.prompt);
    setModel(data.model);
    setAspectRatio(data.aspectRatio);
    setLoading(data.status === "generating");
    setError(data.errorMessage ?? null);
    setShowModelDropdown(false);
    setShowRatioDropdown(false);
  }, [
    elementId,
    data.prompt,
    data.model,
    data.aspectRatio,
    data.status,
    data.errorMessage,
  ]);

  useEffect(() => {
    let cancelled = false;
    fetchImageModels()
      .then((response) => {
        if (cancelled) return;
        setModels(response.models);
        if (response.models.length === 0) {
          setAvailabilityError(
            "未配置可用生图模型，请先在设置中配置 Replicate、Agnes 或 Volces provider。",
          );
          return;
        }

        setAvailabilityError(null);
        const currentModel = modelRef.current;
        if (response.models.some((item) => item.id === currentModel)) return;

        const fallbackModel = response.models[0]?.id;
        if (!fallbackModel || fallbackModel === currentModel) return;

        setModel(fallbackModel);
        updateImageGeneratorElement(excalidrawApi, elementId, {
          model: fallbackModel,
        });
      })
      .catch((err) => {
        console.warn("[image-gen] Failed to fetch models:", err);
        if (!cancelled) {
          setAvailabilityError("生图服务不可用，请确认本地 3001 服务已启动。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, elementId]);

  // Close dropdowns when clicking outside the panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
        setShowRatioDropdown(false);
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [prompt]);

  // Calculate panel screen position from canvas coordinates
  const panelPosition = calculateCenteredGeneratorPanelPosition({
    elementBounds,
    canvasScrollZoom,
    panelWidth: PANEL_WIDTH,
  });
  const currentModel = models.find((item) => item.id === model);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      setShowModelDropdown(false);
      updateImageGeneratorElement(excalidrawApi, elementId, {
        model: nextModel,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
      setShowRatioDropdown(false);
      resizeImageGeneratorElement(excalidrawApi, elementId, ratio);
      updateImageGeneratorElement(excalidrawApi, elementId, {
        aspectRatio: ratio,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading || availabilityError) return;

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    updateImageGeneratorElement(excalidrawApi, elementId, {
      status: "generating",
      prompt: prompt.trim(),
      aspectRatio,
    });

    try {
      const result = await generateImageDirect(prompt.trim(), {
        model,
        aspectRatio,
        quality: data.quality,
        onJobCreated: (jobId) => {
          updateImageGeneratorElement(excalidrawApi, elementId, {
            jobId,
            status: "generating",
          });
        },
        signal: controller.signal,
      });

      // Check if this generation was cancelled while awaiting
      if (controller.signal.aborted) return;

      // Download and insert as real image element at same position
      const dataURL = await fetchAsDataURL(result.url);
      if (controller.signal.aborted) return;

      const fileId = generateId();
      excalidrawApi.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType: result.mimeType,
          created: Date.now(),
        },
      ]);

      const imageElement = createExcalidrawImageElement({
        fileId,
        x: elementBounds.x,
        y: elementBounds.y,
        width: elementBounds.width,
        height: elementBounds.height,
        title: prompt.trim().slice(0, 60),
      });

      // Replace: delete placeholder, add image
      const elements = excalidrawApi.getSceneElements().map((el: any) => {
        if (el.id === elementId) return { ...el, isDeleted: true };
        return el;
      });
      excalidrawApi.updateScene({
        elements: withNormalizedCanvasElementIndices([
          ...elements,
          imageElement,
        ]),
        captureUpdate: "IMMEDIATELY",
      });

      onClose();
    } catch (err) {
      // Ignore aborted requests (user cancelled or component unmounted)
      if (controller.signal.aborted) return;

      console.error("[image-gen] Generation error:", err);
      const handled = handleGenerationError(err);
      if (!handled && mountedRef.current) {
        setError("图片生成失败，请重试或更换模型。");
      }
      if (mountedRef.current) {
        setLoading(false);
      }
      updateImageGeneratorElement(excalidrawApi, elementId, {
        status: "error",
        errorMessage: "生成失败",
      });
    }
  }, [
    availabilityError,
    prompt,
    loading,
    model,
    aspectRatio,
    excalidrawApi,
    elementId,
    elementBounds,
    onClose,
    handleGenerationError,
  ]);

  return createPortal(
    <div
      ref={panelRef}
      style={{ left: panelPosition.left, top: panelPosition.top }}
      className="fixed z-[100] w-[450px] rounded-xl border-[0.5px] border-border bg-card/95 p-2 shadow-card backdrop-blur-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Prompt textarea */}
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleGenerate();
          }
        }}
        placeholder="今天我们要创作什么"
        disabled={loading}
        style={{ scrollbarWidth: "none" }}
        className="min-h-[74px] max-h-[140px] w-full resize-none border-none bg-transparent p-1 text-[14px] leading-[18px] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-scrollbar]:hidden"
      />

      {(error || availabilityError) && (
        <div className="mb-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error ?? availabilityError}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModelDropdown((value) => !value)}
              disabled={models.length === 0}
              className="flex h-8 items-center gap-1 rounded-full border-[0.5px] border-border bg-background px-3 text-xs text-foreground transition-colors hover:bg-muted/60"
            >
              <span className="truncate max-w-[180px]">
                {currentModel
                  ? currentModel.displayName
                  : models.length > 0
                    ? model
                    : "未配置模型"}
              </span>
              <svg
                className="h-3 w-3 text-muted-foreground"
                viewBox="0 0 12 24"
                fill="currentColor"
              >
                <path d="M8.546 10.33a.4.4 0 0 1 .566 0l.424.424a.4.4 0 0 1 0 .566l-3.041 3.041a.7.7 0 0 1-.99 0l-3.04-3.04a.4.4 0 0 1 0-.567l.423-.424a.4.4 0 0 1 .567 0L6 12.876z" />
              </svg>
            </button>
            {showModelDropdown && (
              <div className="absolute bottom-full left-0 z-50 mb-1 w-[280px] overflow-hidden rounded-2xl border-[0.5px] border-border bg-card py-1 shadow-card">
                <div className="max-h-[240px] overflow-y-auto">
                  {models.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleModelChange(item.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                        {(item.displayName || item.id).slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {item.displayName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatProviderLabel(item.provider)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRatioDropdown((v) => !v)}
              className="flex h-8 items-center gap-0.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              <span className="text-foreground">{aspectRatio}</span>
              <svg
                className="h-3 w-3 text-muted-foreground"
                viewBox="0 0 12 24"
                fill="currentColor"
              >
                <path d="M8.546 10.33a.4.4 0 0 1 .566 0l.424.424a.4.4 0 0 1 0 .566l-3.041 3.041a.7.7 0 0 1-.99 0l-3.04-3.04a.4.4 0 0 1 0-.567l.423-.424a.4.4 0 0 1 .567 0L6 12.876z" />
              </svg>
            </button>
            {showRatioDropdown && (
              <div className="absolute bottom-full right-0 z-50 mb-1 rounded-lg border-[0.5px] border-border bg-card py-1 shadow-card">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleAspectRatioChange(r)}
                    className={`flex w-full items-center px-3 py-1.5 text-xs transition-colors hover:bg-muted ${r === aspectRatio ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={() => void handleGenerate()}
            aria-label="生成图片"
            disabled={!prompt.trim() || loading || Boolean(availabilityError)}
            className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-full bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/80 hover:accent-glow disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            ) : (
              <svg
                className="h-3.5 w-[9.3px] shrink-0"
                viewBox="0 0 8 10"
                fill="currentColor"
              >
                <path d="M6.9 4.36H5.385V.76c0-.84-.447-1.01-.991-.38L4 .835.677 4.685c-.457.525-.265.955.422.955h1.517v3.6c0 .84.446 1.01.991.38L4 9.165l3.323-3.85c.456-.525.265-.955-.422-.955" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
