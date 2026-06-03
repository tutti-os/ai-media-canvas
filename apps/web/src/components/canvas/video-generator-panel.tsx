"use client";

import { Plus, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { VideoModelInfo } from "../../lib/server-api";
import { fetchVideoModels, generateVideoDirect } from "../../lib/server-api";
import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import {
  updateVideoGeneratorElement,
  resizeVideoGeneratorElement,
  type VideoGeneratorData,
} from "../../lib/canvas-video-generator";
import { formatProviderLabel } from "../../lib/provider-labels";

type VideoGeneratorPanelProps = {
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  canvasId: string;
  data: VideoGeneratorData;
  excalidrawApi: any;
  projectId: string;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  onClose: () => void;
};

const ASPECT_RATIOS = ["16:9", "9:16"] as const;
const DURATIONS = [4, 5, 6, 8] as const;

export function VideoGeneratorPanel({
  elementId,
  elementBounds,
  canvasId,
  data,
  excalidrawApi,
  projectId,
  canvasScrollZoom,
  onClose,
}: VideoGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [duration, setDuration] = useState(data.duration);
  const [resolution, setResolution] = useState(data.resolution);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showParamsPopover, setShowParamsPopover] = useState(false);
  const [firstFrame, setFirstFrame] = useState<{
    dataUrl: string;
    file: File;
  } | null>(null);
  const [lastFrame, setLastFrame] = useState<{
    dataUrl: string;
    file: File;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const { handleGenerationError } = useGenerationErrorHandler();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVideoModels()
      .then((response) => {
        if (!cancelled) setModels(response.models);
      })
      .catch((err) => {
        console.warn("[video-gen] Failed to fetch models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
        setShowParamsPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [prompt]);

  const { scrollX, scrollY, zoom } = canvasScrollZoom;
  const screenX = (elementBounds.x + scrollX) * zoom;
  const screenY =
    (elementBounds.y + elementBounds.height + scrollY) * zoom + 8;

  const currentModel = models.find((item) => item.id === model);

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
      resizeVideoGeneratorElement(excalidrawApi, elementId, ratio);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        aspectRatio: ratio,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleDurationChange = useCallback(
    (nextDuration: number) => {
      setDuration(nextDuration);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        duration: nextDuration,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      setShowModelDropdown(false);
      updateVideoGeneratorElement(excalidrawApi, elementId, { model: nextModel });
    },
    [excalidrawApi, elementId],
  );

  const handleFrameUpload = useCallback(
    (
      _type: "first" | "last",
      setter: React.Dispatch<
        React.SetStateAction<{ dataUrl: string; file: File } | null>
      >,
    ) => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          setter({ dataUrl: reader.result as string, file });
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      };
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    updateVideoGeneratorElement(excalidrawApi, elementId, {
      status: "generating",
      prompt: prompt.trim(),
      model,
      aspectRatio,
      duration,
      resolution,
    });

    try {
      const inputImages: string[] = [];
      if (firstFrame) inputImages.push(firstFrame.dataUrl);
      if (lastFrame) inputImages.push(lastFrame.dataUrl);
      const videoMode =
        firstFrame && lastFrame ? ("keyframes" as const) : undefined;

      const result = await generateVideoDirect(prompt.trim(), {
        model,
        duration,
        resolution,
        aspectRatio,
        ...(inputImages.length ? { inputImages } : {}),
        ...(videoMode ? { videoMode } : {}),
        projectId,
        canvasId,
      });

      if (controller.signal.aborted) return;

      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      if (controller.signal.aborted) return;

      const newElements = convertToExcalidrawElements([
        {
          type: "embeddable",
          link: result.url,
          x: elementBounds.x,
          y: elementBounds.y,
          width: elementBounds.width,
          height: elementBounds.height,
          customData: {
            isVideo: true,
            mimeType: result.mimeType,
            durationSeconds: result.durationSeconds,
            title: prompt.trim().slice(0, 60),
            prompt: prompt.trim(),
          },
        } as any,
      ]);

      const elements = excalidrawApi
        .getSceneElements()
        .map((el: any) =>
          el.id === elementId ? { ...el, isDeleted: true } : el,
        );
      excalidrawApi.updateScene({
        elements: [...elements, ...newElements],
        captureUpdate: "IMMEDIATELY",
      });

      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;

      console.error("[video-gen] Generation error:", err);
      const handled = handleGenerationError(err);
      if (!handled) {
        setError("视频生成失败，请重试或更换模型。");
      }
      setLoading(false);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        status: "error",
        errorMessage: "生成失败",
      });
    }
  }, [
    prompt,
    loading,
    model,
    aspectRatio,
    duration,
    resolution,
    firstFrame,
    lastFrame,
    excalidrawApi,
    elementId,
    elementBounds,
    onClose,
    handleGenerationError,
  ]);

  const paramsLabel = `${aspectRatio} · ${duration}s`;

  return createPortal(
    <div
      ref={panelRef}
      style={{ left: screenX, top: screenY }}
      className="fixed z-[100] w-[520px] rounded-[24px] border border-border bg-card/95 shadow-card backdrop-blur-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="px-5 pb-3 pt-4">
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
          placeholder="描述你想要的视频镜头、动作、节奏与画面氛围"
          disabled={loading}
          style={{ scrollbarWidth: "none" }}
          className="min-h-[88px] max-h-[140px] w-full resize-none border-none bg-transparent p-0 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-scrollbar]:hidden"
        />

        {error && (
          <div className="mt-3 rounded-2xl border border-destructive/15 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowModelDropdown((value) => !value)}
                className="flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <span className="truncate max-w-[180px]">
                  {currentModel
                    ? `${currentModel.displayName} · ${formatProviderLabel(currentModel.provider)}`
                    : model}
                </span>
                <svg
                  className="h-3.5 w-3.5 text-muted-foreground"
                  viewBox="0 0 12 24"
                  fill="currentColor"
                >
                  <path d="M8.546 10.33a.4.4 0 0 1 .566 0l.424.424a.4.4 0 0 1 0 .566l-3.041 3.041a.7.7 0 0 1-.99 0l-3.04-3.04a.4.4 0 0 1 0-.567l.423-.424a.4.4 0 0 1 .567 0L6 12.876z" />
                </svg>
              </button>
              {showModelDropdown && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-[280px] overflow-hidden rounded-2xl border border-border bg-popover shadow-card">
                  <div className="max-h-[260px] overflow-y-auto py-1">
                    {models.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleModelChange(item.id)}
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                          {(item.displayName || item.id).slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium text-foreground">
                              {item.displayName}
                            </div>
                            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              {formatProviderLabel(item.provider)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatProviderLabel(item.provider)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowParamsPopover((value) => !value)}
                className="flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{paramsLabel}</span>
              </button>
              {showParamsPopover && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-[260px] rounded-2xl border border-border bg-popover p-3 shadow-card">
                  <div className="space-y-3">
                    <div>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        比例
                      </div>
                      <div className="flex gap-2">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => handleAspectRatioChange(ratio)}
                            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                              aspectRatio === ratio
                                ? "bg-foreground text-background"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        时长
                      </div>
                      <div className="flex gap-2">
                        {DURATIONS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleDurationChange(value)}
                            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                              duration === value
                                ? "bg-foreground text-background"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {value}s
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        分辨率
                      </div>
                      <div className="flex gap-2">
                        {["720p", "1080p"].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setResolution(value);
                              updateVideoGeneratorElement(excalidrawApi, elementId, {
                                resolution: value,
                              });
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                              resolution === value
                                ? "bg-foreground text-background"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !prompt.trim()}
            className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "生成中..." : "生成视频"}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            ref={firstFrameInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFrameUpload("first", setFirstFrame)}
          />
          <input
            ref={lastFrameInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFrameUpload("last", setLastFrame)}
          />
          <button
            type="button"
            onClick={() => firstFrameInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <Plus className="h-3.5 w-3.5" />
            首帧
          </button>
          <button
            type="button"
            onClick={() => lastFrameInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <Plus className="h-3.5 w-3.5" />
            尾帧
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
