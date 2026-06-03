import type { ImageArtifact, VideoArtifact } from "@aimc/shared";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov"];
const AUTO_PLACEMENT_GAP = 40;

type Rect = { x: number; y: number; width: number; height: number };

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const pathname = new URL(url, "https://placeholder").pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    const lower = url.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => lower.includes(ext));
  }
}

/**
 * Scale dimensions to fit within maxSize while preserving aspect ratio.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }
  const ratio = Math.min(maxSize / width, maxSize / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Compute the center of the current Excalidraw viewport.
 */
export function getViewportCenter(appState: {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: { value: number };
}): { x: number; y: number } {
  const zoom = appState.zoom?.value ?? 1;
  return {
    x: -appState.scrollX + appState.width / (2 * zoom),
    y: -appState.scrollY + appState.height / (2 * zoom),
  };
}

function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function elementToRect(el: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): Rect {
  return {
    x: el.x ?? 0,
    y: el.y ?? 0,
    width: el.width ?? 0,
    height: el.height ?? 0,
  };
}

function firstOpenPlacement(
  existingElements: readonly any[],
  desired: Rect,
): Rect {
  const existingRects = existingElements
    .filter((el: any) => !el.isDeleted)
    .map((el: any) => elementToRect(el));

  if (!existingRects.some((rect) => rectsOverlap(desired, rect))) {
    return desired;
  }

  const candidates: Rect[] = [desired];
  for (const rect of existingRects) {
    candidates.push(
      {
        x: rect.x + rect.width + AUTO_PLACEMENT_GAP,
        y: rect.y,
        width: desired.width,
        height: desired.height,
      },
      {
        x: rect.x,
        y: rect.y + rect.height + AUTO_PLACEMENT_GAP,
        width: desired.width,
        height: desired.height,
      },
      {
        x: rect.x - desired.width - AUTO_PLACEMENT_GAP,
        y: rect.y,
        width: desired.width,
        height: desired.height,
      },
      {
        x: rect.x,
        y: rect.y - desired.height - AUTO_PLACEMENT_GAP,
        width: desired.width,
        height: desired.height,
      },
    );
  }

  for (const candidate of candidates) {
    if (!existingRects.some((rect) => rectsOverlap(candidate, rect))) {
      return candidate;
    }
  }

  const maxRight = Math.max(...existingRects.map((rect) => rect.x + rect.width));
  return {
    x: maxRight + AUTO_PLACEMENT_GAP,
    y: desired.y,
    width: desired.width,
    height: desired.height,
  };
}

/**
 * Create an Excalidraw image element with all required fields.
 */
export function createExcalidrawImageElement(opts: {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  source?: "generated" | "uploaded";
  storageUrl?: string;
}): Record<string, unknown> {
  const element: Record<string, unknown> = {
    type: "image",
    id: generateId(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    angle: 0,
    fileId: opts.fileId,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: null,
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
    status: "saved",
    scale: [1, 1],
    crop: null,
  };
  if (opts.title || opts.source || opts.storageUrl) {
    element.customData = {
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      ...(opts.storageUrl ? { storageUrl: opts.storageUrl } : {}),
    };
  }
  return element;
}

/**
 * Fetch an image URL and convert it to a data URL string.
 * Routes through the server proxy to bypass browser CORS restrictions.
 */
export async function fetchAsDataURL(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error("Failed to convert image to data URL"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Insert an image artifact onto the Excalidraw canvas.
 */
export async function insertImageOnCanvas(
  api: {
    addFiles: (
      files: { id: any; dataURL: any; mimeType: string; created: number }[],
    ) => void;
    getSceneElements: () => readonly any[];
    getAppState: () => any;
    updateScene: (scene: {
      elements: any[];
      captureUpdate?: string;
    }) => void;
  },
  artifact: ImageArtifact,
): Promise<void> {
  const dataURL = await fetchAsDataURL(artifact.url);
  const fileId = generateId();

  api.addFiles([
    {
      id: fileId as any,
      dataURL: dataURL as any,
      mimeType: artifact.mimeType,
      created: Date.now(),
    },
  ]);

  let x: number;
  let y: number;
  let width: number;
  let height: number;
  const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);

  if (artifact.placement) {
    width = artifact.placement.width;
    height = artifact.placement.height;
    const placement = firstOpenPlacement(elements, {
      x: artifact.placement.x,
      y: artifact.placement.y,
      width,
      height,
    });
    x = placement.x;
    y = placement.y;
  } else {
    const scaled = scaleToFit(artifact.width, artifact.height, 600);
    width = scaled.width;
    height = scaled.height;

    if (elements.length === 0) {
      const center = getViewportCenter(api.getAppState());
      x = center.x - width / 2;
      y = center.y - height / 2;
    } else {
      let maxRight = -Infinity;
      let rightEdgeY = 0;

      for (const el of elements) {
        const elRight = (el.x ?? 0) + (el.width ?? 0);
        if (elRight > maxRight) {
          maxRight = elRight;
          // Vertically align center of new image with center of rightmost element
          rightEdgeY = (el.y ?? 0) + (el.height ?? 0) / 2;
        }
      }

      const placement = firstOpenPlacement(elements, {
        x: maxRight + AUTO_PLACEMENT_GAP,
        y: rightEdgeY - height / 2,
        width,
        height,
      });
      x = placement.x;
      y = placement.y;
    }
  }

  const element = createExcalidrawImageElement({
    fileId,
    x,
    y,
    width,
    height,
    ...(artifact.title ? { title: artifact.title } : {}),
    source: "generated",
    storageUrl: artifact.url,
  });

  api.updateScene({
    elements: [...api.getSceneElements(), element],
    captureUpdate: "IMMEDIATELY",
  });
}

export async function insertVideoOnCanvas(
  api: {
    getSceneElements: () => readonly any[];
    getAppState: () => any;
    updateScene: (scene: {
      elements: any[];
      captureUpdate?: string;
    }) => void;
  },
  artifact: VideoArtifact,
): Promise<void> {
  const width = artifact.placement?.width ?? scaleToFit(artifact.width, artifact.height, 640).width;
  const height = artifact.placement?.height ?? scaleToFit(artifact.width, artifact.height, 640).height;
  const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);

  let x: number;
  let y: number;

  if (artifact.placement) {
    const placement = firstOpenPlacement(elements, {
      x: artifact.placement.x,
      y: artifact.placement.y,
      width,
      height,
    });
    x = placement.x;
    y = placement.y;
  } else {
    if (elements.length === 0) {
      const center = getViewportCenter(api.getAppState());
      x = center.x - width / 2;
      y = center.y - height / 2;
    } else {
      let maxRight = -Infinity;
      let rightEdgeY = 0;
      for (const el of elements) {
        const elRight = (el.x ?? 0) + (el.width ?? 0);
        if (elRight > maxRight) {
          maxRight = elRight;
          rightEdgeY = (el.y ?? 0) + (el.height ?? 0) / 2;
        }
      }
      const placement = firstOpenPlacement(elements, {
        x: maxRight + AUTO_PLACEMENT_GAP,
        y: rightEdgeY - height / 2,
        width,
        height,
      });
      x = placement.x;
      y = placement.y;
    }
  }

  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const newElements = convertToExcalidrawElements([
    {
      type: "embeddable",
      link: artifact.url,
      x,
      y,
      width,
      height,
      customData: {
        isVideo: true,
        mimeType: artifact.mimeType,
        ...(artifact.durationSeconds != null
          ? { durationSeconds: artifact.durationSeconds }
          : {}),
        ...(artifact.title ? { title: artifact.title } : {}),
      },
    } as any,
  ]);

  api.updateScene({
    elements: [...api.getSceneElements(), ...newElements],
    captureUpdate: "IMMEDIATELY",
  });
}

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}
