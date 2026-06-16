"use client";

import { ChevronDown, ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import { useAppTranslation } from "../../i18n";
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
import { isExcalidrawContextMenuTarget } from "../../lib/excalidraw-context-menu";
import {
  imageTargetForAspectRatio,
  isAgnesModel,
  normalizeImageDataUrlToTarget,
} from "../../lib/image-input-normalization";
import { normalizeLocalAssetStorageUrl } from "../../lib/local-assets";
import { formatProviderLabel } from "../../lib/provider-labels";
import type { ImageModelInfo } from "../../lib/server-api";
import { fetchImageModels, generateImageDirect } from "../../lib/server-api";

type ImageGeneratorPanelProps = {
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  data: ImageGeneratorData;
  excalidrawApi: ImageGeneratorExcalidrawApi;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  onClose: () => void;
};

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const PANEL_WIDTH = 450;
type ReferenceImageData = { dataUrl: string; file: File };
type CanvasElement = Record<string, unknown> & {
  id?: string;
  isDeleted?: boolean;
};
type ImageGeneratorExcalidrawApi = {
  addFiles(files: Record<string, unknown>[]): void;
  getSceneElements(): readonly CanvasElement[];
  updateScene(scene: Record<string, unknown>): void;
};

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

function getSchemaEnum<T extends string | number>(
  model: ImageModelInfo | undefined,
  property: string,
): T[] {
  const values = model?.schema?.properties?.[property]?.enum;
  return Array.isArray(values)
    ? values.filter(
        (value): value is T =>
          typeof value === "string" || typeof value === "number",
      )
    : [];
}

function getAspectRatioOptions(model?: ImageModelInfo): string[] {
  const schemaRatios = getSchemaEnum<string>(model, "aspectRatio");
  return schemaRatios.length ? schemaRatios : [...ASPECT_RATIOS];
}

function getMaxInputImages(model?: ImageModelInfo): number {
  const value = model?.schema?.properties?.inputImages?.maxItems;
  return typeof value === "number" ? value : 0;
}

export function ImageGeneratorPanel({
  elementId,
  elementBounds,
  data,
  excalidrawApi,
  canvasScrollZoom,
  onClose,
}: ImageGeneratorPanelProps) {
  const { t } = useAppTranslation("canvas");
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
  const [referenceImage, setReferenceImage] =
    useState<ReferenceImageData | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
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
          setAvailabilityError(t("tools.imagePanel.noAvailableModels"));
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
          setAvailabilityError(t("tools.imagePanel.serviceUnavailable"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, elementId, t]);

  // Close dropdowns when clicking outside the panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isExcalidrawContextMenuTarget(e.target)) return;
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
  });

  // Calculate panel screen position from canvas coordinates
  const panelPosition = calculateCenteredGeneratorPanelPosition({
    elementBounds,
    canvasScrollZoom,
    panelWidth: PANEL_WIDTH,
  });
  const currentModel = models.find((item) => item.id === model);
  const aspectRatioOptions = useMemo(
    () => getAspectRatioOptions(currentModel),
    [currentModel],
  );
  const maxInputImages = getMaxInputImages(currentModel);

  useEffect(() => {
    if (!currentModel) return;
    if (maxInputImages === 0 && referenceImage) setReferenceImage(null);
    const nextAspectRatio = aspectRatioOptions.includes(aspectRatio)
      ? aspectRatio
      : (aspectRatioOptions[0] ?? aspectRatio);
    if (nextAspectRatio === aspectRatio) return;
    setAspectRatio(nextAspectRatio);
    resizeImageGeneratorElement(excalidrawApi, elementId, nextAspectRatio);
    updateImageGeneratorElement(excalidrawApi, elementId, {
      aspectRatio: nextAspectRatio,
    });
  }, [
    aspectRatio,
    aspectRatioOptions,
    currentModel,
    excalidrawApi,
    elementId,
    maxInputImages,
    referenceImage,
  ]);

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

  const handleReferenceUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setReferenceLoading(true);
      const reader = new FileReader();
      reader.onload = () => {
        setReferenceImage({ dataUrl: reader.result as string, file });
        setReferenceLoading(false);
      };
      reader.onerror = () => {
        setReferenceLoading(false);
        setError(t("tools.imagePanel.referenceUploadFailed"));
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [t],
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
      const inputImage =
        referenceImage && maxInputImages > 0
          ? isAgnesModel(model)
            ? await normalizeImageDataUrlToTarget(
                referenceImage.dataUrl,
                imageTargetForAspectRatio(aspectRatio),
              )
            : referenceImage.dataUrl
          : null;
      const result = await generateImageDirect(prompt.trim(), {
        model,
        aspectRatio,
        quality: data.quality,
        ...(inputImage ? { inputImages: [inputImage] } : {}),
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

      const currentElements = excalidrawApi.getSceneElements();
      const generatorElement = currentElements.find(
        (el) => el.id === elementId,
      );
      if (!generatorElement || generatorElement.isDeleted) return;

      const fileId = generateId();
      excalidrawApi.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType: result.mimeType,
          created: Date.now(),
          assetId: result.assetId,
          storageUrl:
            normalizeLocalAssetStorageUrl(result.url, result.assetId) ??
            result.url,
        },
      ]);

      const imageElement = createExcalidrawImageElement({
        assetId: result.assetId,
        fileId,
        x: elementBounds.x,
        y: elementBounds.y,
        width: elementBounds.width,
        height: elementBounds.height,
        title: prompt.trim().slice(0, 60),
        storageUrl:
          normalizeLocalAssetStorageUrl(result.url, result.assetId) ??
          result.url,
      });

      // Replace: delete placeholder, add image
      const elements = currentElements.map((el) => {
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
        setError(t("tools.imagePanel.generationFailed"));
      }
      if (mountedRef.current) {
        setLoading(false);
      }
      updateImageGeneratorElement(excalidrawApi, elementId, {
        status: "error",
        errorMessage: t("tools.generateFailed"),
      });
    }
  }, [
    availabilityError,
    prompt,
    loading,
    model,
    aspectRatio,
    data.quality,
    referenceImage,
    maxInputImages,
    excalidrawApi,
    elementId,
    elementBounds,
    onClose,
    handleGenerationError,
    t,
  ]);

  return createPortal(
    <div
      ref={panelRef}
      data-aimc-generator-panel="image"
      style={{ left: panelPosition.left, top: panelPosition.top }}
      className="fixed z-[100] w-[450px] rounded-xl border-[0.5px] border-border bg-card/95 p-2 shadow-card backdrop-blur-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {maxInputImages > 0 && (
        <div className="relative mb-2 inline-block">
          <input
            ref={referenceInputRef}
            aria-label={t("tools.imagePanel.uploadReferenceImage")}
            type="file"
            accept="image/*"
            hidden
            disabled={loading}
            onChange={handleReferenceUpload}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => referenceInputRef.current?.click()}
            className="group relative flex h-[48px] w-[118px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[18px] border border-border/55 bg-muted/25 px-3 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:border-border/80 hover:bg-muted/45 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {referenceImage ? (
              <>
                <img
                  src={referenceImage.dataUrl}
                  alt={t("tools.imagePanel.referenceImagePreview")}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-1 text-center text-[11px] font-medium text-foreground backdrop-blur">
                  {t("tools.imagePanel.referenceImage")}
                </div>
              </>
            ) : referenceLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
                <span className="whitespace-nowrap">
                  {t("tools.imagePanel.uploadingReference")}
                </span>
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 text-muted-foreground/55" />
                <span className="whitespace-nowrap">
                  {t("tools.imagePanel.referenceImage")}
                </span>
              </>
            )}
          </button>
          {referenceImage && !loading && (
            <button
              type="button"
              aria-label={t("tools.imagePanel.removeReferenceImage")}
              title={t("tools.imagePanel.removeReferenceImage")}
              onClick={() => setReferenceImage(null)}
              className="absolute right-1 top-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

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
        placeholder={t("tools.imagePanel.placeholder")}
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
                    : t("tools.imagePanel.noModel")}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
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
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {showRatioDropdown && (
              <div className="absolute bottom-full right-0 z-50 mb-1 rounded-lg border-[0.5px] border-border bg-card py-1 shadow-card">
                {aspectRatioOptions.map((r) => (
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
            aria-label={t("tools.imagePanel.generateImage")}
            disabled={!prompt.trim() || loading || Boolean(availabilityError)}
            className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-full bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/80 hover:accent-glow disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
