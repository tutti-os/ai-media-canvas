type CanvasElement = Record<string, unknown>;
type CanvasFile = Record<string, unknown>;

type CanvasContent = {
  elements: CanvasElement[];
  appState: Record<string, unknown>;
  files: Record<string, CanvasFile>;
};

export type PendingCanvasFileUrl = {
  fileId: string;
  meta: CanvasFile;
  url: string;
};

export function prepareCanvasImageFiles(content: CanvasContent): {
  elements: CanvasElement[];
  files: Record<string, CanvasFile>;
  inlineFiles: Record<string, CanvasFile>;
  pendingUrls: PendingCanvasFileUrl[];
} {
  const inlineFiles: Record<string, CanvasFile> = {};
  const pendingUrls: PendingCanvasFileUrl[] = [];
  const recoveredFiles = { ...content.files };

  for (const element of content.elements) {
    if (element.type !== "image" || typeof element.fileId !== "string") {
      continue;
    }
    const customData = asRecord(element.customData);
    const storageUrl = stringValue(customData?.storageUrl);
    if (!storageUrl) continue;

    const existing = recoveredFiles[element.fileId] ?? { id: element.fileId };
    recoveredFiles[element.fileId] = {
      ...existing,
      storageUrl: stringValue(existing.storageUrl) ?? storageUrl,
      ...(stringValue(customData?.objectPath)
        ? { objectPath: stringValue(customData?.objectPath) }
        : {}),
    };
  }

  for (const [fileId, fileData] of Object.entries(recoveredFiles)) {
    const storageUrl = stringValue(fileData.storageUrl);
    if (storageUrl) {
      pendingUrls.push({ fileId, url: storageUrl, meta: fileData });
    } else {
      inlineFiles[fileId] = fileData;
    }
  }

  const loadableFileIds = new Set([
    ...Object.keys(inlineFiles),
    ...pendingUrls.map((item) => item.fileId),
  ]);
  const elements = content.elements.map((element) => {
    if (
      element.type === "image" &&
      typeof element.fileId === "string" &&
      loadableFileIds.has(element.fileId) &&
      element.status === "error"
    ) {
      return { ...element, status: "saved" };
    }
    return element;
  });

  return { elements, files: recoveredFiles, inlineFiles, pendingUrls };
}

export function serializeExcalidrawFiles(
  rawFiles: Record<string, CanvasFile>,
  fallbackFiles: Record<string, CanvasFile>,
): Record<string, CanvasFile> {
  const files: Record<string, CanvasFile> = {};
  for (const [id, file] of Object.entries(rawFiles)) {
    const fallback = fallbackFiles[id] ?? {};
    files[id] = {
      id: file.id ?? fallback.id ?? id,
      dataURL: file.dataURL ?? fallback.dataURL,
      mimeType: file.mimeType ?? fallback.mimeType,
      created: file.created ?? fallback.created,
      ...((stringValue(file.storageUrl) ?? stringValue(fallback.storageUrl))
        ? {
            storageUrl:
              stringValue(file.storageUrl) ?? stringValue(fallback.storageUrl),
          }
        : {}),
      ...((stringValue(file.objectPath) ?? stringValue(fallback.objectPath))
        ? {
            objectPath:
              stringValue(file.objectPath) ?? stringValue(fallback.objectPath),
          }
        : {}),
    };
  }
  return files;
}

export async function resolveCanvasImageFiles(
  content: CanvasContent,
  fetchDataURL: (url: string) => Promise<string>,
): Promise<{
  elements: CanvasElement[];
  files: Record<string, CanvasFile>;
}> {
  const prepared = prepareCanvasImageFiles(content);
  const files: Record<string, CanvasFile> = { ...prepared.inlineFiles };

  await Promise.all(
    prepared.pendingUrls.map(async ({ fileId, meta, url }) => {
      const dataURL = await fetchDataURL(url);
      files[fileId] = {
        id: meta.id ?? fileId,
        dataURL,
        mimeType:
          meta.mimeType ?? /^data:([^;]+)/.exec(dataURL)?.[1] ?? "image/png",
        created: meta.created ?? Date.now(),
        ...((stringValue(meta.storageUrl) ?? url)
          ? { storageUrl: stringValue(meta.storageUrl) ?? url }
          : {}),
        ...(stringValue(meta.objectPath)
          ? { objectPath: stringValue(meta.objectPath) }
          : {}),
      };
    }),
  );

  return { elements: prepared.elements, files };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
