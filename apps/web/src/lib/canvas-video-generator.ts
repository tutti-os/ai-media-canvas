import { getViewportCenter } from "./canvas-elements";

const RATIO_DIMENSIONS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1024, h: 576 },
  "9:16": { w: 576, h: 1024 },
};

export type VideoGeneratorStatus =
  | "idle"
  | "generating"
  | "completed"
  | "error";

export type VideoGeneratorData = {
  type: "video-generator";
  status: VideoGeneratorStatus;
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  inputImages?: string[];
  errorMessage?: string;
};

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

export function getDisplayDimensions(
  aspectRatio: string,
  displayMaxSize = 400,
): { width: number; height: number } {
  const dims = RATIO_DIMENSIONS[aspectRatio] ?? RATIO_DIMENSIONS["16:9"]!;
  const scale = Math.min(displayMaxSize / dims.w, displayMaxSize / dims.h);
  return {
    width: Math.round(dims.w * scale),
    height: Math.round(dims.h * scale),
  };
}

export function createVideoGeneratorElement(
  api: {
    getAppState: () => any;
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  options?: {
    aspectRatio?: string;
    model?: string;
    duration?: number;
    resolution?: string;
  },
): string {
  const aspectRatio = options?.aspectRatio ?? "16:9";
  const { width, height } = getDisplayDimensions(aspectRatio);
  const center = getViewportCenter(api.getAppState());

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
    strokeColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
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
    elements: [...api.getSceneElements(), element],
    captureUpdate: "IMMEDIATELY",
  });

  return id;
}

export function isVideoGeneratorElement(
  element: any,
): element is { customData: VideoGeneratorData } & Record<string, unknown> {
  return element?.customData?.type === "video-generator";
}

export function getVideoGeneratorData(element: any): VideoGeneratorData | null {
  if (!isVideoGeneratorElement(element)) return null;
  return element.customData as VideoGeneratorData;
}

export function updateVideoGeneratorElement(
  api: {
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  elementId: string,
  updates: Partial<VideoGeneratorData>,
): void {
  const elements = api.getSceneElements().map((el: any) => {
    if (el.id !== elementId || !isVideoGeneratorElement(el)) return el;
    return {
      ...el,
      customData: { ...el.customData, ...updates },
      version: ((el.version as number | undefined) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function resizeVideoGeneratorElement(
  api: {
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  elementId: string,
  aspectRatio: string,
): void {
  const { width, height } = getDisplayDimensions(aspectRatio);
  const elements = api.getSceneElements().map((el: any) => {
    if (el.id !== elementId) return el;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return {
      ...el,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      customData: { ...el.customData, aspectRatio },
      version: (el.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function deleteVideoGeneratorElement(
  api: {
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  elementId: string,
): void {
  const elements = api.getSceneElements().map((el: any) => {
    if (el.id !== elementId) return el;
    return { ...el, isDeleted: true };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}
