"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  createExcalidrawImageElement,
  fetchAsDataURL,
} from "../lib/canvas-elements";
import { isImageGeneratorElement } from "../lib/canvas-image-generator";
import { withNormalizedCanvasElementIndices } from "../lib/canvas-normalize";
import { isVideoGeneratorElement } from "../lib/canvas-video-generator";
import {
  type GenerationJobSubscription,
  generationJobService,
} from "../lib/generation-job-service";
import { normalizeLocalAssetStorageUrl } from "../lib/local-assets";

export type CanvasRecoveryElement = Record<string, unknown> & {
  customData?: Record<string, unknown>;
  height?: number;
  id?: string;
  isDeleted?: boolean;
  width?: number;
  x?: number;
  y?: number;
};

export type CanvasGenerationRecoveryApi = {
  addFiles(files: Record<string, unknown>[]): void;
  getSceneElements(): readonly CanvasRecoveryElement[];
  onChange(
    handler: (
      elements: CanvasRecoveryElement[],
      appState: Record<string, unknown>,
    ) => void,
  ): () => void;
  updateScene(scene: {
    captureUpdate?: string;
    elements: Record<string, unknown>[];
  }): void;
};

function generateRecoveryFileId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

function hasRecoveryApi(
  excalidrawApi: CanvasGenerationRecoveryApi | null,
): excalidrawApi is CanvasGenerationRecoveryApi {
  return (
    !!excalidrawApi &&
    typeof excalidrawApi.getSceneElements === "function" &&
    typeof excalidrawApi.onChange === "function" &&
    typeof excalidrawApi.updateScene === "function"
  );
}

async function replaceRecoveredImageGenerator(
  excalidrawApi: CanvasGenerationRecoveryApi,
  element: CanvasRecoveryElement,
  result: Record<string, unknown>,
  jobId: string,
) {
  const url = result.signed_url;
  const assetId = result.asset_id;
  const mimeType = result.mime_type;
  const width = result.width;
  const height = result.height;
  if (
    typeof url !== "string" ||
    typeof mimeType !== "string" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return;
  }

  const current = excalidrawApi
    .getSceneElements()
    .find((item) => item.id === element.id);
  if (
    !current ||
    current.isDeleted ||
    current.customData?.jobId !== jobId ||
    current.customData?.status !== "generating"
  ) {
    return;
  }

  const dataURL = await fetchAsDataURL(url);
  const fileId = generateRecoveryFileId();
  excalidrawApi.addFiles([
    {
      id: fileId,
      dataURL,
      mimeType,
      created: Date.now(),
      ...(typeof assetId === "string" ? { assetId } : {}),
      storageUrl:
        normalizeLocalAssetStorageUrl(
          url,
          typeof assetId === "string" ? assetId : null,
        ) ?? url,
    },
  ]);

  const imageElement = createExcalidrawImageElement({
    ...(typeof assetId === "string" ? { assetId } : {}),
    fileId,
    x: current.x ?? 0,
    y: current.y ?? 0,
    width: current.width ?? width,
    height: current.height ?? height,
    title: String(current.customData?.prompt ?? "").slice(0, 60),
    source: "generated",
    storageUrl:
      normalizeLocalAssetStorageUrl(
        url,
        typeof assetId === "string" ? assetId : null,
      ) ?? url,
  });
  const elements = excalidrawApi
    .getSceneElements()
    .map((item) =>
      item.id === current.id ? { ...item, isDeleted: true } : item,
    );
  excalidrawApi.updateScene({
    elements: withNormalizedCanvasElementIndices([...elements, imageElement]),
    captureUpdate: "IMMEDIATELY",
  });
}

async function replaceRecoveredVideoGenerator(
  excalidrawApi: CanvasGenerationRecoveryApi,
  element: CanvasRecoveryElement,
  result: Record<string, unknown>,
  jobId: string,
) {
  const url = result.signed_url;
  const assetId = result.asset_id;
  const mimeType = result.mime_type;
  const width = result.width;
  const height = result.height;
  if (
    typeof url !== "string" ||
    typeof mimeType !== "string" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return;
  }

  const current = excalidrawApi
    .getSceneElements()
    .find((item) => item.id === element.id);
  if (
    !current ||
    current.isDeleted ||
    current.customData?.jobId !== jobId ||
    current.customData?.status !== "generating"
  ) {
    return;
  }

  const { convertToExcalidrawElements } = await import(
    "@excalidraw/excalidraw"
  );
  const durationSeconds = result.duration_seconds;
  const newElements = convertToExcalidrawElements([
    {
      type: "rectangle",
      link: null,
      x: current.x ?? 0,
      y: current.y ?? 0,
      width: current.width ?? width,
      height: current.height ?? height,
      strokeColor: "#111827",
      backgroundColor: "#000000",
      fillStyle: "solid",
      roughness: 0,
      customData: {
        isVideo: true,
        ...(typeof assetId === "string" ? { assetId } : {}),
        mimeType,
        ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
        title: String(current.customData?.prompt ?? "").slice(0, 60),
        prompt: current.customData?.prompt,
        videoUrl:
          normalizeLocalAssetStorageUrl(
            url,
            typeof assetId === "string" ? assetId : null,
          ) ?? url,
      },
    } as unknown as never,
  ]);
  const elements = excalidrawApi
    .getSceneElements()
    .map((item) =>
      item.id === current.id ? { ...item, isDeleted: true } : item,
    );
  excalidrawApi.updateScene({
    elements: withNormalizedCanvasElementIndices([...elements, ...newElements]),
    captureUpdate: "IMMEDIATELY",
  });
}

function markRecoveredGeneratorFailed(
  excalidrawApi: CanvasGenerationRecoveryApi,
  elementId: string,
  jobId: string,
) {
  const elements = excalidrawApi.getSceneElements().map((item) => {
    if (item.id !== elementId) return item;
    if (
      item.customData?.jobId !== jobId ||
      item.customData?.status !== "generating"
    ) {
      return item;
    }
    return {
      ...item,
      strokeColor: "#FCA5A5",
      backgroundColor: "#FDECEE",
      customData: {
        ...item.customData,
        status: "error",
        errorMessage: "生成失败",
      },
    };
  });
  excalidrawApi.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

export function useCanvasGenerationJobRecovery(
  excalidrawApi: CanvasGenerationRecoveryApi | null,
) {
  const watchedGenerationJobIdsRef = useRef(new Set<string>());
  const recoverySubscriptionsRef = useRef<GenerationJobSubscription[]>([]);

  const recoverGeneratingJobs = useCallback(
    (elements: readonly CanvasRecoveryElement[]) => {
      if (!hasRecoveryApi(excalidrawApi) || elements.length === 0) return;

      for (const element of elements) {
        if (element.isDeleted || element.customData?.status !== "generating") {
          continue;
        }
        const jobId = element.customData?.jobId;
        if (typeof jobId !== "string") continue;
        if (watchedGenerationJobIdsRef.current.has(jobId)) continue;
        const isVideo = isVideoGeneratorElement(element);
        const isImage = isImageGeneratorElement(element);
        if (!isVideo && !isImage) continue;
        watchedGenerationJobIdsRef.current.add(jobId);

        const subscription = generationJobService.watch(jobId, {
          jobType: isVideo ? "video_generation" : "image_generation",
          onSucceeded: (result) => {
            const recovery = isVideo
              ? replaceRecoveredVideoGenerator(
                  excalidrawApi,
                  element,
                  result,
                  jobId,
                )
              : replaceRecoveredImageGenerator(
                  excalidrawApi,
                  element,
                  result,
                  jobId,
                );
            void recovery.catch((error) => {
              console.warn(
                "[canvas-generation-recovery] recovered generation replacement failed:",
                error,
              );
              watchedGenerationJobIdsRef.current.delete(jobId);
              if (typeof element.id === "string") {
                markRecoveredGeneratorFailed(excalidrawApi, element.id, jobId);
              }
            });
          },
          onFailed: (error) => {
            console.warn(
              "[canvas-generation-recovery] recovered generation failed:",
              error,
            );
            watchedGenerationJobIdsRef.current.delete(jobId);
            if (typeof element.id === "string") {
              markRecoveredGeneratorFailed(excalidrawApi, element.id, jobId);
            }
          },
        });
        void subscription.promise.catch(() => {
          // Failure is handled through onFailed so the generation node can stay visible.
        });
        recoverySubscriptionsRef.current.push(subscription);
      }
    },
    [excalidrawApi],
  );

  useEffect(() => {
    watchedGenerationJobIdsRef.current.clear();
    for (const subscription of recoverySubscriptionsRef.current) {
      subscription.unsubscribe();
    }
    recoverySubscriptionsRef.current = [];
    if (!hasRecoveryApi(excalidrawApi)) return;

    const api = excalidrawApi;
    recoverGeneratingJobs(api.getSceneElements());
    const unsubscribe = api.onChange((elements) => {
      recoverGeneratingJobs(elements);
    });
    const remoteSyncTimers = new Set<number>();
    const handleRemoteSync = () => {
      const timer = window.setTimeout(() => {
        remoteSyncTimers.delete(timer);
        recoverGeneratingJobs(api.getSceneElements());
      }, 0);
      remoteSyncTimers.add(timer);
    };
    window.addEventListener("aimc:canvas-remote-sync", handleRemoteSync);

    return () => {
      window.removeEventListener("aimc:canvas-remote-sync", handleRemoteSync);
      for (const timer of remoteSyncTimers) {
        window.clearTimeout(timer);
      }
      unsubscribe();
      for (const subscription of recoverySubscriptionsRef.current) {
        subscription.unsubscribe();
      }
      recoverySubscriptionsRef.current = [];
      watchedGenerationJobIdsRef.current.clear();
    };
  }, [excalidrawApi, recoverGeneratingJobs]);
}
