import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  type CanvasContent,
  canvasGetResponseSchema,
  canvasSaveResponseSchema,
} from "@aimc/shared";

import type { AuthenticatedUser } from "../auth/types.js";
import {
  type CanvasClient,
  type Placement,
  insertImageElement,
  insertVideoElement,
} from "../features/canvas/canvas-element-writer.js";
import type { CanvasService } from "../features/canvas/canvas-service.js";
import type { UploadService } from "../features/uploads/upload-service.js";

const MAX_CLI_MEDIA_IMPORT_BYTES = 500 * 1024 * 1024;
const DEFAULT_VIDEO_WIDTH = 1280;
const DEFAULT_VIDEO_HEIGHT = 720;
const IMPORTABLE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const IMPORTABLE_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type CanvasOperations = ReturnType<typeof createCanvasOperations>;

export function createCanvasOperations(options: {
  localUser: AuthenticatedUser;
  canvasService: CanvasService;
  canvasClient?: CanvasClient;
  uploadService?: UploadService;
}) {
  return {
    async getCanvas(canvasId: string) {
      const canvas = await options.canvasService.getCanvas(
        options.localUser,
        canvasId,
      );
      return canvasGetResponseSchema.parse({ canvas });
    },
    async saveCanvas(
      canvasId: string,
      content: CanvasContent,
      saveOptions: { baseRevision?: number } = {},
    ) {
      const result = await options.canvasService.saveCanvasContent(
        options.localUser,
        canvasId,
        content,
        saveOptions,
      );
      return canvasSaveResponseSchema.parse({
        ok: true,
        revision: result.revision,
      });
    },
    async importImageFile(input: {
      canvasId: string;
      filePath: string;
      height?: number;
      mimeType?: string;
      placement?: Partial<Placement>;
      projectId?: string;
      title?: string;
      width?: number;
    }) {
      if (!options.canvasClient || !options.uploadService) {
        throw new CanvasImportError(
          "canvas_import_unavailable",
          "Canvas image import is unavailable in this runtime.",
          501,
        );
      }

      const filePath = resolve(input.filePath);
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Image file was not found.",
          400,
        );
      }
      if (fileStat.size > MAX_CLI_MEDIA_IMPORT_BYTES) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Media file is too large to import.",
          413,
        );
      }

      const fileBuffer = await readFile(filePath);
      const mimeType =
        normalizeMimeType(input.mimeType) ??
        inferImageMimeType(filePath, fileBuffer);
      if (!mimeType || !IMPORTABLE_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Unsupported image file type.",
          400,
        );
      }

      const dimensions = readImageDimensions(fileBuffer, mimeType);
      const width = positiveNumber(input.width) ?? dimensions?.width;
      const height = positiveNumber(input.height) ?? dimensions?.height;
      if (!width || !height) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Image dimensions could not be determined. Pass width and height.",
          400,
        );
      }

      const uploaded = await options.uploadService.uploadFile(
        options.localUser,
        {
          bucket: "project-assets",
          fileName: basename(filePath),
          fileBuffer,
          mimeType,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
      );
      const placement = completePlacement(input.placement);
      const { elementId } = await insertImageElement(
        options.canvasClient,
        {
          assetId: uploaded.asset.id,
          canvasId: input.canvasId,
          height,
          mimeType,
          objectPath: uploaded.asset.objectPath,
          signedUrl: uploaded.url,
          ...(input.title ? { title: input.title } : {}),
          width,
        },
        placement,
      );

      return {
        elementId,
        assetId: uploaded.asset.id,
        url: uploaded.url,
        objectPath: uploaded.asset.objectPath,
        mimeType,
        width,
        height,
      };
    },
    async importVideoFile(input: {
      canvasId: string;
      durationSeconds?: number;
      filePath: string;
      height?: number;
      mimeType?: string;
      placement?: Partial<Placement>;
      projectId?: string;
      title?: string;
      width?: number;
    }) {
      if (!options.canvasClient || !options.uploadService) {
        throw new CanvasImportError(
          "canvas_import_unavailable",
          "Canvas video import is unavailable in this runtime.",
          501,
        );
      }

      const filePath = resolve(input.filePath);
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Video file was not found.",
          400,
        );
      }
      if (fileStat.size > MAX_CLI_MEDIA_IMPORT_BYTES) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Media file is too large to import.",
          413,
        );
      }

      const fileBuffer = await readFile(filePath);
      const mimeType =
        normalizeMimeType(input.mimeType) ??
        inferVideoMimeType(filePath, fileBuffer);
      if (!mimeType || !IMPORTABLE_VIDEO_MIME_TYPES.has(mimeType)) {
        throw new CanvasImportError(
          "canvas_import_failed",
          "Unsupported video file type.",
          400,
        );
      }

      const width = positiveNumber(input.width) ?? DEFAULT_VIDEO_WIDTH;
      const height = positiveNumber(input.height) ?? DEFAULT_VIDEO_HEIGHT;
      const uploaded = await options.uploadService.uploadFile(
        options.localUser,
        {
          bucket: "project-assets",
          fileName: basename(filePath),
          fileBuffer,
          mimeType,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
      );
      const placement = completePlacement(input.placement);
      const { elementId } = await insertVideoElement(
        options.canvasClient,
        {
          assetId: uploaded.asset.id,
          canvasId: input.canvasId,
          ...(input.durationSeconds !== undefined
            ? { durationSeconds: input.durationSeconds }
            : {}),
          height,
          mimeType,
          prompt: input.title ?? basename(filePath),
          signedUrl: uploaded.url,
          ...(input.title ? { title: input.title } : {}),
          width,
        },
        placement,
      );

      return {
        elementId,
        assetId: uploaded.asset.id,
        url: uploaded.url,
        objectPath: uploaded.asset.objectPath,
        mimeType,
        width,
        height,
        ...(input.durationSeconds !== undefined
          ? { durationSeconds: input.durationSeconds }
          : {}),
      };
    },
  };
}

class CanvasImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "CanvasImportError";
  }
}

function normalizeMimeType(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized;
}

function inferImageMimeType(filePath: string, buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString("ascii") === "PNG"
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }

  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return undefined;
}

function inferVideoMimeType(filePath: string, buffer: Buffer) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4";
  }
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return "video/webm";
  }
  return undefined;
}

function readImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | undefined {
  if (mimeType === "image/png") return readPngDimensions(buffer);
  if (mimeType === "image/jpeg") return readJpegDimensions(buffer);
  if (mimeType === "image/webp") return readWebpDimensions(buffer);
  if (mimeType === "image/gif") return readGifDimensions(buffer);
  if (mimeType === "image/svg+xml") return readSvgDimensions(buffer);
  return undefined;
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24) return undefined;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") return undefined;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (isJpegStartOfFrame(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return undefined;
}

function isJpegStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readWebpDimensions(buffer: Buffer) {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return undefined;
  }
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    return {
      width: 1 + readUInt24LE(buffer, 24),
      height: 1 + readUInt24LE(buffer, 27),
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b0 = buffer[21] ?? 0;
    const b1 = buffer[22] ?? 0;
    const b2 = buffer[23] ?? 0;
    const b3 = buffer[24] ?? 0;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return undefined;
}

function readGifDimensions(buffer: Buffer) {
  if (buffer.length < 10) return undefined;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readSvgDimensions(buffer: Buffer) {
  const text = buffer.subarray(0, 4096).toString("utf8");
  const width = svgNumberAttribute(text, "width");
  const height = svgNumberAttribute(text, "height");
  if (width && height) return { width, height };
  const viewBox = text.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  const parts = viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));
  if (parts?.length === 4 && parts.every((part) => Number.isFinite(part))) {
    const [, , viewBoxWidth, viewBoxHeight] = parts;
    if (viewBoxWidth && viewBoxHeight) {
      return { width: viewBoxWidth, height: viewBoxHeight };
    }
  }
  return undefined;
}

function svgNumberAttribute(text: string, name: "height" | "width") {
  const value = text.match(new RegExp(`\\b${name}=["']([0-9.]+)`, "i"))?.[1];
  const number = value ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  );
}

function completePlacement(
  placement: Partial<Placement> | undefined,
): Placement | undefined {
  if (!placement) return undefined;
  const x = finiteNumber(placement.x);
  const y = finiteNumber(placement.y);
  const width = positiveNumber(placement.width);
  const height = positiveNumber(placement.height);
  if (x === undefined || y === undefined || !width || !height) {
    throw new CanvasImportError(
      "canvas_import_failed",
      "Placement requires x, y, width, and height.",
      400,
    );
  }
  return { x, y, width, height };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}
