"use client";

type FileSystemWritable = {
  close: () => Promise<void> | void;
  write: (data: Blob) => Promise<void> | void;
};

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ accept: Record<string, string[]> }>;
}) => Promise<{
  createWritable: () => Promise<FileSystemWritable>;
}>;

export type ImageDownloadResult = "cancelled" | "saved" | "started";

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|webp|gif|svg)$/i;
const INVALID_FILENAME_CHAR_PATTERN = /[<>:"/\\|?*]/g;

export function createPngDownloadFilename({
  name,
  fallbackBaseName,
}: {
  name?: string | null;
  fallbackBaseName: string;
}) {
  const candidate = sanitizeFilenameBase(name);
  const fallback = sanitizeFilenameBase(fallbackBaseName);
  return `${candidate || fallback || "ai-media-canvas-image"}.png`;
}

function sanitizeFilenameBase(value?: string | null) {
  return (value ?? "")
    .trim()
    .replace(IMAGE_EXTENSION_PATTERN, "")
    .replace(INVALID_FILENAME_CHAR_PATTERN, "-")
    .replace(/./g, (char) => (char.charCodeAt(0) < 32 ? "-" : char))
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/g, "")
    .slice(0, 120);
}

function getSaveFilePicker() {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  return typeof picker === "function" ? picker.bind(window) : null;
}

function triggerBrowserDownload(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function isSavePickerAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function blobFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to read image data.");
  }
  return await response.blob();
}

export async function downloadPngFile({
  filename,
  source,
}: {
  filename: string;
  source: Blob | string;
}): Promise<ImageDownloadResult> {
  const saveFilePicker = getSaveFilePicker();
  if (saveFilePicker) {
    try {
      const handle = await saveFilePicker({
        suggestedName: filename,
        types: [{ accept: { "image/png": [".png"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(
        typeof source === "string" ? await blobFromUrl(source) : source,
      );
      await writable.close();
      return "saved";
    } catch (error) {
      if (isSavePickerAbort(error)) return "cancelled";
      throw error;
    }
  }

  if (typeof source === "string") {
    triggerBrowserDownload(source, filename);
    return "started";
  }

  const url = URL.createObjectURL(source);
  triggerBrowserDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return "started";
}
