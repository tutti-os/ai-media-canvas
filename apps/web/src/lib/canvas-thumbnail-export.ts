import { createExcalidrawImageElement } from "./canvas-elements";
import { toRuntimeAssetUrl } from "./local-assets";

type ThumbnailElement = Record<string, unknown> & {
  customData?: Record<string, unknown>;
  height?: number;
  id?: string;
  type?: string;
  width?: number;
  x?: number;
  y?: number;
};

type ThumbnailFile = Record<string, unknown>;

type CaptureVideoFrame = (
  videoUrl: string,
  assetId?: string,
) => Promise<string | null>;

export async function prepareThumbnailExportScene({
  elements,
  files,
  captureVideoFrame = captureVideoFrameAsDataURL,
}: {
  elements: readonly ThumbnailElement[];
  files: Record<string, ThumbnailFile>;
  captureVideoFrame?: CaptureVideoFrame;
}): Promise<{
  elements: ThumbnailElement[];
  files: Record<string, ThumbnailFile>;
}> {
  const nextFiles = { ...files };
  const nextElements = await Promise.all(
    elements.map(async (element) => {
      const videoUrl =
        typeof element.customData?.videoUrl === "string"
          ? element.customData.videoUrl
          : null;
      if (!videoUrl || element.customData?.isVideo !== true) return element;

      const assetId =
        typeof element.customData.assetId === "string"
          ? element.customData.assetId
          : undefined;
      const frameDataURL = await captureVideoFrame(videoUrl, assetId).catch(
        () => null,
      );
      if (!frameDataURL) return element;

      const fileId = `thumbnail-frame-${element.id ?? crypto.randomUUID()}`;
      nextFiles[fileId] = {
        id: fileId,
        dataURL: frameDataURL,
        mimeType: "image/webp",
        created: Date.now(),
      };

      return createExcalidrawImageElement({
        ...(assetId ? { assetId } : {}),
        fileId,
        x: element.x ?? 0,
        y: element.y ?? 0,
        width: element.width ?? 1,
        height: element.height ?? 1,
        ...(typeof element.customData.title === "string"
          ? { title: element.customData.title }
          : {}),
        source: "generated",
        storageUrl: videoUrl,
      }) as ThumbnailElement;
    }),
  );

  return { elements: nextElements, files: nextFiles };
}

async function captureVideoFrameAsDataURL(
  videoUrl: string,
  assetId?: string,
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const timeout = window.setTimeout(() => finish(null), 3000);

    const finish = (dataURL: string | null) => {
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      resolve(dataURL);
    };

    const drawFrame = () => {
      try {
        const width = video.videoWidth || 1;
        const height = video.videoHeight || 1;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          finish(null);
          return;
        }
        context.drawImage(video, 0, 0, width, height);
        finish(canvas.toDataURL("image/webp", 0.82));
      } catch {
        finish(null);
      }
    };

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("error", () => finish(null), { once: true });
    video.addEventListener(
      "loadeddata",
      () => {
        const seekTarget =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(0.1, video.duration / 10)
            : 0;
        if (seekTarget > 0) {
          video.addEventListener("seeked", drawFrame, { once: true });
          try {
            video.currentTime = seekTarget;
          } catch {
            drawFrame();
          }
        } else {
          drawFrame();
        }
      },
      { once: true },
    );
    video.src = toRuntimeAssetUrl(videoUrl, assetId);
    video.load();
  });
}
