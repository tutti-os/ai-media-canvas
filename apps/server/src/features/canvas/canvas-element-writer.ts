import type { CanvasContent } from "@aimc/shared";

type CanvasClient = {
  from(table: "canvases"): {
    select(columns: string): unknown;
  };
};

type Placement = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type CanvasElement = Record<string, unknown>;

const AUTO_PLACEMENT_GAP = 40;
const DEFAULT_VIEWPORT = {
  height: 720,
  scrollX: 0,
  scrollY: 0,
  width: 1280,
  zoom: 1,
};

export async function insertImageElement(
  client: CanvasClient,
  input: {
    canvasId: string;
    height: number;
    mimeType: string;
    objectPath: string;
    signedUrl?: string;
    title?: string;
    width: number;
  },
  placement?: Placement,
): Promise<{ elementId: string }> {
  const content = await readCanvasContent(client, input.canvasId);
  const elements = [...(content.elements ?? [])];
  const files = { ...(content.files ?? {}) };
  const display =
    placement ??
    autoPlacement(
      elements,
      scaleToFit(input.width, input.height, 600),
      content.appState,
    );
  const fileId = generateId();
  const elementId = generateId();
  const storageUrl = input.signedUrl ?? input.objectPath;

  files[fileId] = {
    id: fileId,
    mimeType: input.mimeType,
    created: Date.now(),
    storageUrl,
    objectPath: input.objectPath,
  };

  elements.push({
    ...createElementBase(elementId),
    type: "image",
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
    customData: {
      source: "generated",
      storageUrl,
      objectPath: input.objectPath,
      ...(input.title ? { title: input.title } : {}),
    },
  });

  await writeCanvasContent(client, input.canvasId, {
    ...content,
    elements,
    files,
  });

  return { elementId };
}

export async function insertVideoElement(
  client: CanvasClient,
  input: {
    canvasId: string;
    durationSeconds?: number;
    height: number;
    mimeType: string;
    prompt: string;
    signedUrl: string;
    title?: string;
    width: number;
  },
  placement?: Placement,
): Promise<{ elementId: string }> {
  const content = await readCanvasContent(client, input.canvasId);
  const elements = [...(content.elements ?? [])];
  const display =
    placement ??
    autoPlacement(
      elements,
      scaleToFit(input.width, input.height, 640),
      content.appState,
    );
  const elementId = generateId();

  elements.push({
    ...createElementBase(elementId),
    type: "embeddable",
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
    link: input.signedUrl,
    customData: {
      isVideo: true,
      mimeType: input.mimeType,
      prompt: input.prompt,
      ...(input.title ? { title: input.title } : {}),
      ...(input.durationSeconds != null
        ? { durationSeconds: input.durationSeconds }
        : {}),
    },
  });

  await writeCanvasContent(client, input.canvasId, {
    ...content,
    elements,
  });

  return { elementId };
}

async function readCanvasContent(
  client: CanvasClient,
  canvasId: string,
): Promise<CanvasContent> {
  const query = client.from("canvases").select("content") as {
    eq(
      column: string,
      value: string,
    ): {
      single(): Promise<{
        data: { content?: CanvasContent } | null;
        error: { message: string } | null;
      }>;
    };
  };
  const { data, error } = await query.eq("id", canvasId).single();
  if (error || !data?.content) {
    throw new Error(error?.message ?? "Canvas not found.");
  }
  return {
    elements: data.content.elements ?? [],
    appState: data.content.appState ?? {},
    files: data.content.files ?? {},
  };
}

async function writeCanvasContent(
  client: CanvasClient,
  canvasId: string,
  content: CanvasContent,
) {
  const query = client.from("canvases") as unknown as {
    update(payload: { content: CanvasContent }): {
      eq(
        column: string,
        value: string,
      ): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
  const { error } = await query.update({ content }).eq("id", canvasId);
  if (error) {
    throw new Error(`Failed to save canvas: ${error.message}`);
  }
}

function createElementBase(id: string): CanvasElement {
  return {
    id,
    angle: 0,
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
  };
}

function scaleToFit(width: number, height: number, maxSize: number): Placement {
  if (width <= maxSize && height <= maxSize) {
    return { x: 0, y: 0, width, height };
  }
  const ratio = Math.min(maxSize / width, maxSize / height);
  return {
    x: 0,
    y: 0,
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function autoPlacement(
  elements: CanvasElement[],
  size: Placement,
  appState?: Record<string, unknown>,
): Placement {
  const active = elements.filter((el) => !el.isDeleted);
  if (active.length === 0) {
    return centerInViewport(size, appState) ?? size;
  }

  let maxRight = Number.NEGATIVE_INFINITY;
  let centerY = 0;
  for (const el of active) {
    const right = numberOrZero(el.x) + numberOrZero(el.width);
    if (right > maxRight) {
      maxRight = right;
      centerY = numberOrZero(el.y) + numberOrZero(el.height) / 2;
    }
  }

  return {
    ...size,
    x: maxRight + AUTO_PLACEMENT_GAP,
    y: centerY - size.height / 2,
  };
}

function centerInViewport(
  size: Placement,
  appState?: Record<string, unknown>,
): Placement | null {
  const width = finiteNumber(appState?.width) ?? DEFAULT_VIEWPORT.width;
  const height = finiteNumber(appState?.height) ?? DEFAULT_VIEWPORT.height;

  const zoomRecord =
    appState?.zoom && typeof appState.zoom === "object"
      ? (appState.zoom as Record<string, unknown>)
      : undefined;
  const zoom = finiteNumber(zoomRecord?.value) ?? DEFAULT_VIEWPORT.zoom;
  const scrollX = finiteNumber(appState?.scrollX) ?? DEFAULT_VIEWPORT.scrollX;
  const scrollY = finiteNumber(appState?.scrollY) ?? DEFAULT_VIEWPORT.scrollY;

  return {
    ...size,
    x: -scrollX + width / (2 * zoom) - size.width / 2,
    y: -scrollY + height / (2 * zoom) - size.height / 2,
  };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}
