"use client";

import { ImageIcon, Loader2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import { calculateCenteredGeneratorPanelPosition } from "../../lib/canvas-generator-panel-position";
import { withNormalizedCanvasElementIndices } from "../../lib/canvas-normalize";
import {
  type VideoGeneratorData,
  resizeVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "../../lib/canvas-video-generator";
import { formatProviderLabel } from "../../lib/provider-labels";
import type { VideoModelInfo } from "../../lib/server-api";
import { fetchVideoModels, generateVideoDirect } from "../../lib/server-api";

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
const PANEL_WIDTH = 520;
type FrameSlot = "first" | "last";
type FrameData = { dataUrl: string; file: File };

function FrameUploadTile({
  label,
  inputLabel,
  frame,
  loading,
  disabled,
  inputRef,
  onUpload,
  onClear,
}: {
  label: string;
  inputLabel: string;
  frame: FrameData | null;
  loading: boolean;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="group relative">
      <input
        ref={inputRef}
        aria-label={inputLabel}
        type="file"
        accept="image/*"
        hidden
        disabled={disabled}
        onChange={onUpload}
      />
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-[48px] w-[104px] shrink-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[18px] border border-border/55 bg-muted/25 px-3 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:border-border/80 hover:bg-muted/45 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {frame ? (
          <>
            <img
              src={frame.dataUrl}
              alt={`${label}预览`}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-1 text-center text-[11px] font-medium text-foreground backdrop-blur">
              {label}
            </div>
          </>
        ) : loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
            <span className="whitespace-nowrap">{label}上传中</span>
          </>
        ) : (
          <>
            <ImageIcon className="h-4 w-4 text-muted-foreground/55" />
            <span className="whitespace-nowrap">{label}</span>
          </>
        )}
      </button>
      {frame && !disabled && (
        <button
          type="button"
          aria-label={`移除${label}`}
          onClick={onClear}
          className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

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
  const [firstFrame, setFirstFrame] = useState<FrameData | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameData | null>(null);
  const [frameLoading, setFrameLoading] = useState<Record<FrameSlot, boolean>>({
    first: false,
    last: false,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const { handleGenerationError } = useGenerationErrorHandler();
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetchVideoModels()
      .then((response) => {
        if (cancelled) return;
        setModels(response.models);
      })
      .catch((err) => {
        console.warn("[video-gen] Failed to fetch models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, elementId]);

  useEffect(() => {
    if (models.length === 0) return;
    if (models.some((item) => item.id === model)) return;

    const fallbackModel = models[0]?.id;
    if (!fallbackModel || fallbackModel === model) return;

    setModel(fallbackModel);
    updateVideoGeneratorElement(excalidrawApi, elementId, {
      model: fallbackModel,
    });
  }, [models, model, excalidrawApi, elementId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
        setShowParamsPopover(false);
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

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [prompt]);

  const panelPosition = calculateCenteredGeneratorPanelPosition({
    elementBounds,
    canvasScrollZoom,
    panelWidth: PANEL_WIDTH,
  });

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
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        model: nextModel,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleFrameUpload = useCallback(
    (
      type: FrameSlot,
      setter: React.Dispatch<React.SetStateAction<FrameData | null>>,
    ) => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFrameLoading((current) => ({ ...current, [type]: true }));
        const reader = new FileReader();
        reader.onload = () => {
          setter({ dataUrl: reader.result as string, file });
          setFrameLoading((current) => ({ ...current, [type]: false }));
        };
        reader.onerror = () => {
          setFrameLoading((current) => ({ ...current, [type]: false }));
          setError("图片上传失败，请重新选择。");
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
        onJobCreated: (jobId) => {
          updateVideoGeneratorElement(excalidrawApi, elementId, {
            jobId,
            status: "generating",
          });
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const currentElements = excalidrawApi.getSceneElements();
      const generatorElement = currentElements.find(
        (el: any) => el.id === elementId,
      );
      if (!generatorElement || generatorElement.isDeleted) return;

      const { convertToExcalidrawElements } = await import(
        "@excalidraw/excalidraw"
      );
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

      const elements = currentElements.map((el: any) =>
        el.id === elementId ? { ...el, isDeleted: true } : el,
      );
      excalidrawApi.updateScene({
        elements: withNormalizedCanvasElementIndices([
          ...elements,
          ...newElements,
        ]),
        captureUpdate: "IMMEDIATELY",
      });

      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;

      console.error("[video-gen] Generation error:", err);
      const handled = handleGenerationError(err);
      if (!handled && mountedRef.current) {
        setError("视频生成失败，请重试或更换模型。");
      }
      if (mountedRef.current) {
        setLoading(false);
      }
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
      data-aimc-generator-panel="video"
      style={{ left: panelPosition.left, top: panelPosition.top }}
      className="fixed z-[100] w-[520px] rounded-[24px] border border-border bg-card/95 shadow-card backdrop-blur-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="px-5 pb-3 pt-4">
        <div className="mb-4 flex items-center gap-2.5">
          <FrameUploadTile
            label="首帧"
            inputLabel="上传首帧"
            frame={firstFrame}
            loading={frameLoading.first}
            disabled={loading}
            inputRef={firstFrameInputRef}
            onUpload={handleFrameUpload("first", setFirstFrame)}
            onClear={() => setFirstFrame(null)}
          />
          <FrameUploadTile
            label="尾帧"
            inputLabel="上传尾帧"
            frame={lastFrame}
            loading={frameLoading.last}
            disabled={loading}
            inputRef={lastFrameInputRef}
            onUpload={handleFrameUpload("last", setLastFrame)}
            onClear={() => setLastFrame(null)}
          />
        </div>

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
                className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/60"
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
                        className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                          {(item.displayName || item.id).slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium text-foreground">
                              {item.displayName}
                            </div>
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
                className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/60"
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
                            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
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
                            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
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
                              updateVideoGeneratorElement(
                                excalidrawApi,
                                elementId,
                                {
                                  resolution: value,
                                },
                              );
                            }}
                            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
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
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "生成中..." : "生成视频"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
