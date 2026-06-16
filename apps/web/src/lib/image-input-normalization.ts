type ImageTargetSize = {
  width: number;
  height: number;
};

const IMAGE_LOAD_TIMEOUT_MS = 10_000;

export function isAgnesModel(modelId: string): boolean {
  return modelId.startsWith("agnes-");
}

export function imageTargetForAspectRatio(
  aspectRatio: string,
): ImageTargetSize {
  switch (aspectRatio) {
    case "16:9":
      return { width: 1024, height: 576 };
    case "9:16":
      return { width: 576, height: 1024 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    default:
      return { width: 1024, height: 1024 };
  }
}

export function videoTargetForAspectRatio(
  aspectRatio: string,
  resolution: string,
): ImageTargetSize {
  const base =
    resolution === "1080p"
      ? { width: 1920, height: 1080 }
      : resolution === "480p"
        ? { width: 854, height: 480 }
        : { width: 1280, height: 720 };

  return aspectRatio === "9:16"
    ? { width: base.height, height: base.width }
    : base;
}

export async function normalizeImageDataUrlToTarget(
  dataUrl: string,
  target: ImageTargetSize,
): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return dataUrl;

  const targetRatio = target.width / target.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    cropHeight = sourceWidth / targetRatio;
    sourceY = (sourceHeight - cropHeight) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    target.width,
    target.height,
  );
  return canvas.toDataURL("image/png");
}

export async function normalizeImageDataUrlsToTarget(
  dataUrls: string[],
  target: ImageTargetSize,
): Promise<string[]> {
  return Promise.all(
    dataUrls.map((dataUrl) => normalizeImageDataUrlToTarget(dataUrl, target)),
  );
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      reject(new Error("Image input normalization timed out."));
    }, IMAGE_LOAD_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Image input normalization failed."));
    };
    image.src = dataUrl;
  });
}
