"use client";

import type { AimcInputMode } from "@aimc/shared";
import { Check, ChevronDown, ImageIcon, Loader2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import { useAppTranslation } from "../../i18n";
import { calculateCenteredGeneratorPanelPosition } from "../../lib/canvas-generator-panel-position";
import { withNormalizedCanvasElementIndices } from "../../lib/canvas-normalize";
import {
  type VideoGeneratorData,
  resizeVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "../../lib/canvas-video-generator";
import {
  isExcalidrawCanvasTarget,
  isExcalidrawContextMenuTarget,
} from "../../lib/excalidraw-context-menu";
import {
  isAgnesModel,
  normalizeImageDataUrlsToTarget,
  videoTargetForAspectRatio,
} from "../../lib/image-input-normalization";
import { normalizeLocalAssetStorageUrl } from "../../lib/local-assets";
import { formatProviderLabel } from "../../lib/provider-labels";
import type { VideoModelInfo } from "../../lib/server-api";
import { fetchVideoModels, generateVideoDirect } from "../../lib/server-api";

type VideoGeneratorPanelProps = {
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  canvasId: string;
  data: VideoGeneratorData;
  excalidrawApi: VideoGeneratorExcalidrawApi;
  projectId: string;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  hidden?: boolean;
  onClose: () => void;
};

const ASPECT_RATIOS = ["16:9", "9:16"] as const;
const FALLBACK_DURATION_OPTIONS = [4, 5, 6, 8, 10, 15, 18] as const;
const RESOLUTION_OPTIONS = ["480p", "720p", "1080p", "4k", "2160p"] as const;
const PANEL_WIDTH = 640;
type FrameSlot = "first" | "last";
type FrameData = { dataUrl: string; file: File };
type VideoResolution = (typeof RESOLUTION_OPTIONS)[number];
type CanvasElement = Record<string, unknown> & {
  id?: string;
  isDeleted?: boolean;
};
type VideoGeneratorExcalidrawApi = {
  getSceneElements(): readonly CanvasElement[];
  updateScene(scene: Record<string, unknown>): void;
};
type VideoInputModeId =
  | "text"
  | "image"
  | "keyframes"
  | "reference"
  | "multivideo"
  | "video";
const videoInputModeMemory = new Map<string, VideoInputModeId>();
type VideoModeOption = {
  id: "keyframes" | "reference";
  labelKey: string;
  mode: AimcInputMode;
};

function getDurationOptions(model?: VideoModelInfo): number[] {
  const schemaDurations = getSchemaEnum<number>(model, "duration");
  if (schemaDurations.length) return schemaDurations.sort((a, b) => a - b);

  const allowedDurations = model?.limits?.allowedDurations;
  if (allowedDurations?.length) {
    return [...allowedDurations].sort((a, b) => a - b);
  }

  const maxDuration = model?.limits?.maxDuration;
  if (!maxDuration) return [4, 5, 6, 8];

  const options = FALLBACK_DURATION_OPTIONS.filter(
    (value) => value <= maxDuration,
  );
  return options.length ? options : [maxDuration];
}

function getResolutionOptions(model?: VideoModelInfo): VideoResolution[] {
  const schemaResolutions = getSchemaEnum<string>(model, "resolution").filter(
    (value): value is VideoResolution =>
      RESOLUTION_OPTIONS.includes(value as VideoResolution),
  );
  if (schemaResolutions.length) return schemaResolutions;

  const maxResolution = model?.limits?.maxResolution;
  if (!maxResolution) return ["720p", "1080p"];
  const normalizedMax = maxResolution === "2160p" ? "4k" : maxResolution;
  const maxIndex = RESOLUTION_OPTIONS.indexOf(normalizedMax as VideoResolution);
  if (maxIndex < 0) return [...RESOLUTION_OPTIONS];
  return RESOLUTION_OPTIONS.slice(0, maxIndex + 1);
}

function getAspectRatioOptions(model?: VideoModelInfo): string[] {
  const schemaRatios = getSchemaEnum<string>(model, "aspectRatio");
  return schemaRatios.length ? schemaRatios : [...ASPECT_RATIOS];
}

function getSchemaEnum<T extends string | number>(
  model: VideoModelInfo | undefined,
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

function getInputModes(model?: VideoModelInfo): AimcInputMode[] {
  const modes = model?.schema?.["x-aimc-ui"]?.inputModes ?? [];
  if (modes.length) return modes;
  if (!model) {
    return [
      {
        id: "keyframes",
        labelKey: "tools.schema.inputModes.keyframes",
        videoMode: "keyframes",
        minImages: 1,
        maxImages: 2,
        slots: ["firstFrame", "lastFrame"],
      },
      {
        id: "text",
        labelKey: "tools.schema.inputModes.text",
        maxImages: 0,
      },
    ];
  }
  if (
    model?.capabilities?.imageToVideo &&
    (model.limits?.maxInputImages ?? 0) > 1
  ) {
    return [
      {
        id: "keyframes",
        labelKey: "tools.schema.inputModes.keyframes",
        videoMode: "keyframes",
        minImages: 1,
        maxImages: model.limits?.maxInputImages ?? 2,
        slots: ["firstFrame", "lastFrame"],
      },
      {
        id: "text",
        labelKey: "tools.schema.inputModes.text",
        maxImages: 0,
      },
    ];
  }
  if (model?.capabilities?.imageToVideo) {
    return [
      {
        id: "image",
        labelKey: "tools.schema.inputModes.image",
        minImages: 1,
        maxImages: 1,
        slots: ["firstFrame"],
      },
      {
        id: "text",
        labelKey: "tools.schema.inputModes.text",
        maxImages: 0,
      },
    ];
  }
  return [
    {
      id: "text",
      labelKey: "tools.schema.inputModes.text",
      maxImages: 0,
    },
  ];
}

function isInputModeSupported(
  modes: readonly { id: string }[],
  mode: VideoInputModeId,
) {
  return modes.some((item) => item.id === mode);
}

function getDefaultInputMode(
  modes: readonly { id: string }[],
): VideoInputModeId {
  return (modes[0]?.id as VideoInputModeId | undefined) ?? "text";
}

function getModeById(modes: readonly AimcInputMode[], id: string) {
  return modes.find((item) => item.id === id);
}

function getKeyframeMode(modes: readonly AimcInputMode[]) {
  return (
    getModeById(modes, "keyframes") ??
    getModeById(modes, "image") ??
    getModeById(modes, "multivideo")
  );
}

function getVideoModeOptions(
  modes: readonly AimcInputMode[],
): VideoModeOption[] {
  const keyframeMode = getKeyframeMode(modes);
  const referenceMode = getModeById(modes, "reference");
  return [
    ...(keyframeMode
      ? [
          {
            id: "keyframes" as const,
            labelKey: "tools.schema.inputModes.keyframes",
            mode: keyframeMode,
          },
        ]
      : []),
    ...(referenceMode
      ? [
          {
            id: "reference" as const,
            labelKey: "tools.schema.inputModes.reference",
            mode: referenceMode,
          },
        ]
      : []),
  ];
}

function getModeMaxImages(mode?: AimcInputMode) {
  return mode?.maxImages ?? 0;
}

function supportsImageCount(mode: AimcInputMode | undefined, count: number) {
  if (!mode) return false;
  if (mode.minImages !== undefined && count < mode.minImages) return false;
  if (mode.maxImages !== undefined && count > mode.maxImages) return false;
  return true;
}

function resolveSubmissionVideoMode(
  modes: readonly AimcInputMode[],
  selectedOption: VideoModeOption | undefined,
  imageCount: number,
) {
  if (!selectedOption || imageCount === 0) return undefined;
  if (
    selectedOption.id === "keyframes" &&
    !supportsImageCount(selectedOption.mode, imageCount)
  ) {
    const imageMode = getModeById(modes, "image");
    if (supportsImageCount(imageMode, imageCount)) return imageMode?.videoMode;
  }
  return selectedOption.mode.videoMode;
}

function normalizeStoredInputMode(mode: VideoGeneratorData["inputMode"]) {
  if (
    mode === "text" ||
    mode === "image" ||
    mode === "keyframes" ||
    mode === "reference" ||
    mode === "multivideo" ||
    mode === "video"
  ) {
    return mode;
  }
  return "text";
}

function normalizeDuration(duration: number, options: number[]) {
  return options.includes(duration) ? duration : (options[0] ?? duration);
}

function normalizeResolution(resolution: string, options: VideoResolution[]) {
  return options.includes(resolution as VideoResolution)
    ? resolution
    : (options.at(-1) ?? resolution);
}

function FrameUploadTile({
  label,
  inputLabel,
  previewLabel,
  uploadingLabel,
  removeLabel,
  frame,
  loading,
  disabled,
  inputRef,
  onUpload,
  onClear,
}: {
  label: string;
  inputLabel: string;
  previewLabel: string;
  uploadingLabel: string;
  removeLabel: string;
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
              alt={previewLabel}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-1 text-center text-[11px] font-medium text-foreground backdrop-blur">
              {label}
            </div>
          </>
        ) : loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
            <span className="whitespace-nowrap">{uploadingLabel}</span>
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
          aria-label={removeLabel}
          title={removeLabel}
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
  hidden = false,
  onClose,
}: VideoGeneratorPanelProps) {
  const { t } = useAppTranslation("canvas");
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [duration, setDuration] = useState(data.duration);
  const [resolution, setResolution] = useState(data.resolution);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showParamsPopover, setShowParamsPopover] = useState(false);
  const [inputMode, setInputMode] = useState<VideoInputModeId>(
    () =>
      videoInputModeMemory.get(elementId) ??
      normalizeStoredInputMode(data.inputMode),
  );
  const [firstFrame, setFirstFrame] = useState<FrameData | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameData | null>(null);
  const [referenceFrame, setReferenceFrame] = useState<FrameData | null>(null);
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
  }, []);

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
      if (isExcalidrawContextMenuTarget(e.target)) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
        setShowModelDropdown(false);
        setShowParamsPopover(false);
        if (isExcalidrawCanvasTarget(e.target)) return;
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
    setInputMode(
      videoInputModeMemory.get(elementId) ??
        normalizeStoredInputMode(data.inputMode),
    );
  }, [data.inputMode, elementId]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  });

  const panelPosition = calculateCenteredGeneratorPanelPosition({
    elementBounds,
    canvasScrollZoom,
    panelWidth: PANEL_WIDTH,
  });

  const currentModel = models.find((item) => item.id === model);
  const inputModes = useMemo(() => getInputModes(currentModel), [currentModel]);
  const modeOptions = useMemo(
    () => getVideoModeOptions(inputModes),
    [inputModes],
  );
  const selectedModeOption =
    modeOptions.find((option) => option.mode.id === inputMode) ??
    modeOptions[0];
  const selectedMode = selectedModeOption?.mode;
  const aspectRatioOptions = useMemo(
    () => getAspectRatioOptions(currentModel),
    [currentModel],
  );
  const durationOptions = useMemo(
    () => getDurationOptions(currentModel),
    [currentModel],
  );
  const resolutionOptions = useMemo(
    () => getResolutionOptions(currentModel),
    [currentModel],
  );

  useEffect(() => {
    if (!currentModel) return;
    const nextDuration = normalizeDuration(duration, durationOptions);
    const nextResolution = normalizeResolution(resolution, resolutionOptions);
    const nextAspectRatio = aspectRatioOptions.includes(aspectRatio)
      ? aspectRatio
      : (aspectRatioOptions[0] ?? aspectRatio);
    if (
      nextDuration === duration &&
      nextResolution === resolution &&
      nextAspectRatio === aspectRatio
    ) {
      return;
    }

    if (nextDuration !== duration) setDuration(nextDuration);
    if (nextResolution !== resolution) setResolution(nextResolution);
    if (nextAspectRatio !== aspectRatio) setAspectRatio(nextAspectRatio);

    updateVideoGeneratorElement(excalidrawApi, elementId, {
      ...(nextDuration !== duration ? { duration: nextDuration } : {}),
      ...(nextResolution !== resolution ? { resolution: nextResolution } : {}),
      ...(nextAspectRatio !== aspectRatio
        ? { aspectRatio: nextAspectRatio }
        : {}),
    });
  }, [
    aspectRatio,
    aspectRatioOptions,
    currentModel,
    duration,
    durationOptions,
    excalidrawApi,
    elementId,
    resolution,
    resolutionOptions,
  ]);

  useEffect(() => {
    if (modeOptions.length > 0) {
      if (modeOptions.some((option) => option.mode.id === inputMode)) return;
      const nextMode = modeOptions[0]?.mode.id as VideoInputModeId;
      videoInputModeMemory.set(elementId, nextMode);
      setInputMode(nextMode);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        inputMode: nextMode,
      });
      setFirstFrame(null);
      setLastFrame(null);
      setReferenceFrame(null);
      return;
    }
    if (isInputModeSupported(inputModes, inputMode)) return;
    const nextMode = getDefaultInputMode(inputModes);
    videoInputModeMemory.set(elementId, nextMode);
    setInputMode(nextMode);
    updateVideoGeneratorElement(excalidrawApi, elementId, {
      inputMode: nextMode,
    });
    setFirstFrame(null);
    setLastFrame(null);
    setReferenceFrame(null);
  }, [excalidrawApi, elementId, inputModes, inputMode, modeOptions]);

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
      setShowModeDropdown(false);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        model: nextModel,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleInputModeChange = useCallback(
    (nextMode: VideoInputModeId) => {
      videoInputModeMemory.set(elementId, nextMode);
      setInputMode(nextMode);
      setShowModeDropdown(false);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        inputMode: nextMode,
      });
      if (nextMode !== "keyframes") setLastFrame(null);
      if (nextMode !== "reference") setReferenceFrame(null);
      if (nextMode === "text" || nextMode === "reference") setFirstFrame(null);
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
          setError(t("tools.videoPanel.imageUploadFailed"));
        };
        reader.readAsDataURL(file);
        e.target.value = "";
      };
    },
    [t],
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
      const selectedOption = selectedModeOption;
      if (selectedOption?.id === "keyframes") {
        if (firstFrame) inputImages.push(firstFrame.dataUrl);
        if (lastFrame) inputImages.push(lastFrame.dataUrl);
      } else if (selectedOption?.id === "reference") {
        if (referenceFrame) inputImages.push(referenceFrame.dataUrl);
      }
      const videoMode = resolveSubmissionVideoMode(
        inputModes,
        selectedOption,
        inputImages.length,
      );
      const submittedInputImages =
        inputImages.length > 0 && isAgnesModel(model)
          ? await normalizeImageDataUrlsToTarget(
              inputImages,
              videoTargetForAspectRatio(aspectRatio, resolution),
            )
          : inputImages;

      const result = await generateVideoDirect(prompt.trim(), {
        model,
        duration,
        resolution,
        aspectRatio,
        ...(submittedInputImages.length
          ? { inputImages: submittedInputImages }
          : {}),
        ...(videoMode ? { videoMode } : {}),
        enableAudio: false,
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
        (el) => el.id === elementId,
      );
      if (!generatorElement || generatorElement.isDeleted) return;

      const { convertToExcalidrawElements } = await import(
        "@excalidraw/excalidraw"
      );
      if (controller.signal.aborted) return;

      const videoUrl =
        normalizeLocalAssetStorageUrl(result.url, result.assetId) ?? result.url;
      const videoElement = {
        type: "rectangle",
        link: null,
        x: elementBounds.x,
        y: elementBounds.y,
        width: elementBounds.width,
        height: elementBounds.height,
        strokeColor: "#111827",
        backgroundColor: "#000000",
        fillStyle: "solid",
        roughness: 0,
        customData: {
          isVideo: true,
          assetId: result.assetId,
          mimeType: result.mimeType,
          durationSeconds: result.durationSeconds,
          title: prompt.trim().slice(0, 60),
          prompt: prompt.trim(),
          videoUrl,
          model,
          aspectRatio,
          resolution,
        },
      } as unknown as NonNullable<
        Parameters<typeof convertToExcalidrawElements>[0]
      >[number];
      const newElements = convertToExcalidrawElements([videoElement]);

      const elements = currentElements.map((el) =>
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
        setError(t("tools.videoPanel.generationFailed"));
      }
      if (mountedRef.current) {
        setLoading(false);
      }
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        status: "error",
        errorMessage: t("tools.generateFailed"),
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
    referenceFrame,
    selectedModeOption,
    inputModes,
    projectId,
    canvasId,
    excalidrawApi,
    elementId,
    elementBounds,
    onClose,
    handleGenerationError,
    t,
  ]);

  const paramsLabel = `${aspectRatio} · ${duration}s`;
  const showModePicker = modeOptions.length > 1;
  const keyframeMaxImages =
    selectedModeOption?.id === "keyframes" ? getModeMaxImages(selectedMode) : 0;
  const showFirstFrame = selectedModeOption?.id === "keyframes";
  const showLastFrame = showFirstFrame && keyframeMaxImages > 1;
  const showReferenceFrame = selectedModeOption?.id === "reference";

  return createPortal(
    <div
      ref={panelRef}
      data-aimc-generator-panel="video"
      style={{ left: panelPosition.left, top: panelPosition.top }}
      className={`fixed z-[100] w-[640px] max-w-[calc(100vw-32px)] rounded-[24px] border border-border bg-card/95 shadow-card backdrop-blur-lg transition-opacity duration-150 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="px-5 pb-3 pt-4">
        {(showFirstFrame || showLastFrame || showReferenceFrame) && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2.5">
              {showFirstFrame && (
                <FrameUploadTile
                  label={t("tools.videoPanel.firstFrame")}
                  inputLabel={t("tools.videoPanel.uploadFirstFrame")}
                  previewLabel={t("tools.videoPanel.firstFramePreview")}
                  uploadingLabel={t("tools.videoPanel.firstFrameUploading")}
                  removeLabel={t("tools.videoPanel.removeFrame")}
                  frame={firstFrame}
                  loading={frameLoading.first}
                  disabled={loading}
                  inputRef={firstFrameInputRef}
                  onUpload={handleFrameUpload("first", setFirstFrame)}
                  onClear={() => setFirstFrame(null)}
                />
              )}
              {showLastFrame && (
                <FrameUploadTile
                  label={t("tools.videoPanel.lastFrame")}
                  inputLabel={t("tools.videoPanel.uploadLastFrame")}
                  previewLabel={t("tools.videoPanel.lastFramePreview")}
                  uploadingLabel={t("tools.videoPanel.lastFrameUploading")}
                  removeLabel={t("tools.videoPanel.removeFrame")}
                  frame={lastFrame}
                  loading={frameLoading.last}
                  disabled={loading}
                  inputRef={lastFrameInputRef}
                  onUpload={handleFrameUpload("last", setLastFrame)}
                  onClear={() => setLastFrame(null)}
                />
              )}
              {showReferenceFrame && (
                <FrameUploadTile
                  label={t("tools.videoPanel.referenceImage")}
                  inputLabel={t("tools.videoPanel.uploadReferenceImage")}
                  previewLabel={t("tools.videoPanel.referenceImagePreview")}
                  uploadingLabel={t("tools.videoPanel.referenceImageUploading")}
                  removeLabel={t("tools.videoPanel.removeFrame")}
                  frame={referenceFrame}
                  loading={frameLoading.first}
                  disabled={loading}
                  inputRef={firstFrameInputRef}
                  onUpload={handleFrameUpload("first", setReferenceFrame)}
                  onClear={() => setReferenceFrame(null)}
                />
              )}
            </div>
          </div>
        )}

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
          placeholder={t("tools.videoPanel.placeholder")}
          disabled={loading}
          style={{ scrollbarWidth: "none" }}
          className="min-h-[88px] max-h-[140px] w-full resize-none border-none bg-transparent p-0 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-scrollbar]:hidden"
        />

        {error && (
          <div className="mt-3 rounded-2xl border border-destructive/15 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div
          data-aimc-video-panel-bottom-row="true"
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3"
        >
          <div className="flex min-w-0 flex-1 basis-[420px] items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <button
                type="button"
                onClick={() => {
                  setShowModelDropdown((value) => !value);
                  setShowModeDropdown(false);
                  setShowParamsPopover(false);
                }}
                className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {currentModel
                    ? `${currentModel.displayName} · ${formatProviderLabel(currentModel.provider)}`
                    : model}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

            {selectedModeOption && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setShowModeDropdown((value) => !value);
                    setShowModelDropdown(false);
                    setShowParamsPopover(false);
                  }}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="truncate max-w-[120px]">
                    {t(selectedModeOption.labelKey)}
                  </span>
                  {showModePicker && (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                {showModeDropdown && showModePicker && (
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-[200px] overflow-hidden rounded-2xl border border-border bg-popover shadow-card">
                    <div className="py-1">
                      {modeOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            handleInputModeChange(
                              option.mode.id as VideoInputModeId,
                            )
                          }
                          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                        >
                          <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                            {selectedModeOption.id === option.id && (
                              <Check className="h-4 w-4" />
                            )}
                          </span>
                          <span>{t(option.labelKey)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowParamsPopover((value) => !value);
                  setShowModeDropdown(false);
                  setShowModelDropdown(false);
                }}
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
                        {t("tools.videoPanel.aspectRatio")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {aspectRatioOptions.map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => handleAspectRatioChange(ratio)}
                            className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
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
                        {t("tools.videoPanel.duration")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {durationOptions.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleDurationChange(value)}
                            className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
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
                        {t("tools.videoPanel.resolution")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {resolutionOptions.map((value) => (
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
                            className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
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
            className="ml-auto inline-flex h-10 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t("tools.generating") : t("tools.videoPanel.generate")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
