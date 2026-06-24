import type { ManagedFileAssetMetadata } from "@aimc/shared";

type TuttiFileUploadProgress = {
  loadedBytes: number;
  totalBytes?: number;
  ratio?: number;
};

type TuttiFileUploadOptions = {
  purpose: "app-asset";
  name: string;
  mimeType: string;
  onProgress?: (progress: TuttiFileUploadProgress) => void;
  signal?: AbortSignal;
};

type TuttiFilesBridge = {
  upload?: (
    file: Blob,
    options: TuttiFileUploadOptions,
  ) => Promise<ManagedFileAssetMetadata>;
};

type TuttiFileUploadBridgeWindow = Window & {
  tuttiExternal?: {
    files?: TuttiFilesBridge;
  };
};

export type UploadAppAssetOptions = {
  name: string;
  mimeType: string;
  onProgress?: (progress: TuttiFileUploadProgress) => void;
  signal?: AbortSignal;
};

function getTuttiFileUploadBridge() {
  if (typeof window === "undefined") return undefined;
  return (window as TuttiFileUploadBridgeWindow).tuttiExternal?.files?.upload;
}

export function hasTuttiFileUploadBridge() {
  return typeof getTuttiFileUploadBridge() === "function";
}

export async function uploadTuttiAppAsset(
  file: Blob,
  options: UploadAppAssetOptions,
): Promise<ManagedFileAssetMetadata> {
  const upload = getTuttiFileUploadBridge();
  if (typeof upload !== "function") {
    throw new Error("Tutti file upload bridge is unavailable.");
  }

  return upload(file, {
    purpose: "app-asset",
    name: options.name,
    mimeType: options.mimeType,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
