import { getViewportCenter } from "./canvas-elements";
import { withNormalizedCanvasElementIndices } from "./canvas-normalize";

const RATIO_DIMENSIONS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1024, h: 576 },
  "9:16": { w: 576, h: 1024 },
};
const VIDEO_GENERATOR_STROKE = "#D1D5DB";
const VIDEO_GENERATOR_BACKGROUND = "#F3F4F6";
const VIDEO_GENERATOR_ERROR_STROKE = "#FCA5A5";
const VIDEO_GENERATOR_ERROR_BACKGROUND = "#FDECEE";

export type VideoGeneratorStatus =
  | "idle"
  | "generating"
  | "completed"
  | "error";
export type VideoGeneratorInputMode =
  | "text"
  | "image"
  | "keyframes"
  | "reference"
  | "multivideo"
  | "video";

export type VideoGeneratorData = {
  type: "video-generator";
  status: VideoGeneratorStatus;
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  inputMode?: VideoGeneratorInputMode;
  inputImages?: string[];
  jobId?: string;
  errorMessage?: string;
};

type ViewportAppState = Parameters<typeof getViewportCenter>[0];
type PartialViewportAppState = {
  height?: number;
  scrollX?: number;
  scrollY?: number;
  width?: number;
  zoom?: { value?: number };
};
type VideoGeneratorElement = Record<string, unknown> & {
  backgroundColor?: string;
  customData?: Partial<VideoGeneratorData>;
  height?: number;
  id?: string;
  isDeleted?: boolean;
  strokeColor?: string;
  updated?: number;
  version?: number;
  versionNonce?: number;
  width?: number;
  x?: number;
  y?: number;
};
type VideoGeneratorSceneApi = {
  getSceneElements: () => readonly VideoGeneratorElement[];
  updateScene: (scene: {
    elements: VideoGeneratorElement[];
    captureUpdate?: string;
  }) => void;
};
type VideoGeneratorCreateApi = VideoGeneratorSceneApi & {
  getAppState: () => PartialViewportAppState;
};

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

export function getDisplayDimensions(
  aspectRatio: string,
  displayMaxSize = 400,
): { width: number; height: number } {
  const dims = RATIO_DIMENSIONS[aspectRatio] ??
    RATIO_DIMENSIONS["16:9"] ?? { w: 1024, h: 576 };
  const scale = Math.min(displayMaxSize / dims.w, displayMaxSize / dims.h);
  return {
    width: Math.round(dims.w * scale),
    height: Math.round(dims.h * scale),
  };
}

export function createVideoGeneratorElement(
  api: VideoGeneratorCreateApi,
  options?: {
    aspectRatio?: string;
    model?: string;
    duration?: number;
    resolution?: string;
  },
): string {
  const aspectRatio = options?.aspectRatio ?? "16:9";
  const { width, height } = getDisplayDimensions(aspectRatio);
  const appState = api.getAppState();
  const center = getViewportCenter({
    scrollX: appState.scrollX ?? 0,
    scrollY: appState.scrollY ?? 0,
    width: appState.width ?? 0,
    height: appState.height ?? 0,
    zoom: { value: appState.zoom?.value ?? 1 },
  });

  const customData: VideoGeneratorData = {
    type: "video-generator",
    status: "idle",
    prompt: "",
    model: options?.model ?? "google-official/veo-3.1-generate-preview",
    aspectRatio,
    duration: options?.duration ?? 5,
    resolution: options?.resolution ?? "720p",
  };

  const id = generateId();
  const element: Record<string, unknown> = {
    type: "rectangle",
    id,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    angle: 0,
    strokeColor: VIDEO_GENERATOR_STROKE,
    backgroundColor: VIDEO_GENERATOR_BACKGROUND,
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: { type: 3 },
    boundElements: null,
    frameId: null,
    index: null,
    seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false,
    updated: Date.now(),
    link: null,
    locked: false,
    customData,
  };

  api.updateScene({
    elements: withNormalizedCanvasElementIndices([
      ...api.getSceneElements(),
      element,
    ]),
    captureUpdate: "IMMEDIATELY",
  });

  return id;
}

export function isVideoGeneratorElement(
  element: unknown,
): element is VideoGeneratorElement & { customData: VideoGeneratorData } {
  if (!element || typeof element !== "object") return false;
  const item = element as { customData?: { type?: unknown } };
  return item.customData?.type === "video-generator";
}

export function getVideoGeneratorData(
  element: unknown,
): VideoGeneratorData | null {
  if (!isVideoGeneratorElement(element)) return null;
  return element.customData as VideoGeneratorData;
}

export function updateVideoGeneratorElement(
  api: VideoGeneratorSceneApi,
  elementId: string,
  updates: Partial<VideoGeneratorData>,
): void {
  const elements = api.getSceneElements().map((el) => {
    if (el.id !== elementId || !isVideoGeneratorElement(el)) return el;
    return {
      ...el,
      strokeColor:
        updates.status === "error"
          ? VIDEO_GENERATOR_ERROR_STROKE
          : VIDEO_GENERATOR_STROKE,
      backgroundColor:
        updates.status === "error"
          ? VIDEO_GENERATOR_ERROR_BACKGROUND
          : VIDEO_GENERATOR_BACKGROUND,
      customData: { ...el.customData, ...updates },
      version: ((el.version as number | undefined) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function resizeVideoGeneratorElement(
  api: VideoGeneratorSceneApi,
  elementId: string,
  aspectRatio: string,
): void {
  const { width, height } = getDisplayDimensions(aspectRatio);
  const elements = api.getSceneElements().map((el) => {
    if (el.id !== elementId) return el;
    const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
    const cy = (el.y ?? 0) + (el.height ?? 0) / 2;
    return {
      ...el,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      strokeColor: VIDEO_GENERATOR_STROKE,
      backgroundColor: VIDEO_GENERATOR_BACKGROUND,
      customData: { ...el.customData, aspectRatio },
      version: ((el.version as number | undefined) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function deleteVideoGeneratorElement(
  api: VideoGeneratorSceneApi,
  elementId: string,
): void {
  const elements = api.getSceneElements().map((el) => {
    if (el.id !== elementId) return el;
    return { ...el, isDeleted: true };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}
