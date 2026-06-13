import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
  OutputFormat,
} from "../types.js";
import { GenerationError, aspectRatioToDimensions } from "../utils.js";
import {
  KieClient,
  type KieMarketCreateTaskPayload,
  type KieMarketTaskRecord,
  getFirstKieMarketResultUrl,
} from "./kie-client.js";

const ICON_KIE = "https://kie.ai/favicon.ico";
const DEFAULT_KIE_IMAGE_POLL_INTERVAL_MS = 3_000;
const DEFAULT_KIE_IMAGE_POLL_TIMEOUT_MS = 15 * 60_000;

export type KieImageProviderOptions = {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

type KieImageModelId =
  | "kie/z-image"
  | "kie/seedream-5-lite"
  | "kie/gpt-image-2"
  | "kie/qwen2"
  | "kie/nano-banana-pro"
  | "kie/nano-banana";

const KIE_IMAGE_MODELS: readonly ModelInfo[] = [
  {
    id: "kie/z-image",
    displayName: "Z-Image",
    description: "Kie Market Z-Image text-to-image generation.",
    iconUrl: ICON_KIE,
  },
  {
    id: "kie/seedream-5-lite",
    displayName: "Seedream 5.0 Lite",
    description:
      "Kie Market Seedream 5.0 Lite text-to-image and image editing.",
    iconUrl: ICON_KIE,
  },
  {
    id: "kie/gpt-image-2",
    displayName: "GPT Image 2",
    description: "Kie Market GPT Image 2 text-to-image and image-to-image.",
    iconUrl: ICON_KIE,
  },
  {
    id: "kie/qwen2",
    displayName: "Qwen2",
    description: "Kie Market Qwen2 image generation and editing.",
    iconUrl: ICON_KIE,
  },
  {
    id: "kie/nano-banana-pro",
    displayName: "Nano Banana Pro",
    description:
      "Kie Market Nano Banana Pro text and reference image generation.",
    iconUrl: ICON_KIE,
  },
  {
    id: "kie/nano-banana",
    displayName: "Nano Banana",
    description: "Kie Market Google Nano Banana generation and editing.",
    iconUrl: ICON_KIE,
  },
];

export type KieImageRequest = KieMarketCreateTaskPayload & {
  outputFormat: "png" | "jpg";
  width: number;
  height: number;
};

export function resolveKieImageRequest(
  params: ImageGenerateParams,
): KieImageRequest {
  const model = resolveKieImageModel(params.model);
  const inputImages = params.inputImages ?? [];
  const aspectRatio = params.aspectRatio ?? "1:1";
  const dimensions = aspectRatioToDimensions(aspectRatio);
  const outputFormat = resolveKieImageOutputFormat(params.outputFormat);
  const baseInput = { prompt: params.prompt };

  if (model === "kie/z-image") {
    if (inputImages.length > 0) {
      throw new GenerationError(
        "kie-image",
        "invalid_input",
        "z-image does not support image inputs.",
      );
    }
    return {
      model: "z-image",
      input: {
        ...baseInput,
        aspect_ratio: aspectRatio,
        nsfw_checker: true,
      },
      outputFormat,
      ...dimensions,
    };
  }

  if (model === "kie/seedream-5-lite") {
    return {
      model:
        inputImages.length === 0
          ? "seedream/5-lite-text-to-image"
          : "seedream/5-lite-image-to-image",
      input: {
        ...baseInput,
        ...(inputImages.length > 0 ? { image_urls: inputImages } : {}),
        aspect_ratio: aspectRatio,
        quality: resolveSeedreamQuality(params.quality),
        nsfw_checker: true,
      },
      outputFormat,
      ...dimensions,
    };
  }

  if (model === "kie/gpt-image-2") {
    return {
      model:
        inputImages.length === 0
          ? "gpt-image-2-text-to-image"
          : "gpt-image-2-image-to-image",
      input: {
        ...baseInput,
        ...(inputImages.length > 0 ? { input_urls: inputImages } : {}),
        aspect_ratio: aspectRatio,
      },
      outputFormat,
      ...dimensions,
    };
  }

  if (model === "kie/qwen2") {
    return {
      model:
        inputImages.length === 0 ? "qwen2/text-to-image" : "qwen2/image-edit",
      input: {
        ...baseInput,
        ...(inputImages.length > 0
          ? { image_url: requireSingleInputImage("qwen2", inputImages) }
          : {}),
        image_size: aspectRatio,
        output_format: outputFormat,
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
      },
      outputFormat,
      ...dimensions,
    };
  }

  if (model === "kie/nano-banana") {
    return {
      model:
        inputImages.length === 0
          ? "google/nano-banana"
          : "google/nano-banana-edit",
      input: {
        ...baseInput,
        ...(inputImages.length > 0 ? { image_urls: inputImages } : {}),
        output_format: outputFormat,
        aspect_ratio: aspectRatio,
      },
      outputFormat,
      ...dimensions,
    };
  }

  return {
    model: "nano-banana-pro",
    input: {
      ...baseInput,
      image_input: inputImages,
      aspect_ratio: aspectRatio,
      resolution: resolveKieImageResolution(params.quality),
      output_format: outputFormat,
    },
    outputFormat,
    ...dimensions,
  };
}

export class KieImageProvider implements ImageProvider {
  readonly name = "kie-image";
  readonly models = KIE_IMAGE_MODELS;
  private readonly client: KieClient;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;

  constructor(
    apiKey: string,
    baseUrl?: string,
    options: KieImageProviderOptions = {},
  ) {
    this.client = new KieClient(apiKey, {
      ...(baseUrl ? { apiBase: baseUrl } : {}),
    });
    this.pollIntervalMs =
      options.pollIntervalMs ?? DEFAULT_KIE_IMAGE_POLL_INTERVAL_MS;
    this.pollTimeoutMs =
      options.pollTimeoutMs ?? DEFAULT_KIE_IMAGE_POLL_TIMEOUT_MS;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const request = resolveKieImageRequest(params);

    try {
      const taskId = await this.client.createMarketTask({
        model: request.model,
        input: request.input,
      });
      const record = await this.pollTask(taskId);
      const url = getFirstKieMarketResultUrl(record);
      if (!url) {
        throw new GenerationError(
          this.name,
          "api_error",
          `Kie image task ${taskId} completed without an image URL.`,
        );
      }

      return {
        url,
        mimeType: getMimeType(request.outputFormat),
        width: request.width,
        height: request.height,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        this.name,
        "api_error",
        error instanceof Error ? error.message : "Unknown Kie image error",
      );
    }
  }

  private async pollTask(taskId: string): Promise<KieMarketTaskRecord> {
    const startedAt = Date.now();

    for (;;) {
      const record = await this.client.queryMarketTask(taskId);
      const state = record.state?.toLowerCase();
      if (state === "success") return record;
      if (state === "fail") {
        throw new GenerationError(
          this.name,
          "api_error",
          record.failMsg ||
            record.failCode ||
            `Kie image task ${taskId} failed.`,
        );
      }
      if (Date.now() - startedAt >= this.pollTimeoutMs) {
        throw new GenerationError(
          this.name,
          "poll_timeout",
          `Kie image task ${taskId} did not finish within ${Math.round(
            this.pollTimeoutMs / 1_000,
          )} seconds.`,
        );
      }
      await delay(this.pollIntervalMs);
    }
  }
}

function resolveKieImageModel(modelId: string): KieImageModelId {
  if (KIE_IMAGE_MODELS.some((model) => model.id === modelId)) {
    return modelId as KieImageModelId;
  }
  throw new GenerationError(
    "kie-image",
    "model_not_found",
    `Unsupported Kie image model: ${modelId}`,
  );
}

function resolveKieImageOutputFormat(
  outputFormat: OutputFormat | undefined,
): "png" | "jpg" {
  return outputFormat === "jpg" ? "jpg" : "png";
}

function resolveSeedreamQuality(
  quality: ImageGenerateParams["quality"] | undefined,
): "basic" | "high" {
  return quality === "standard" ? "basic" : "high";
}

function resolveKieImageResolution(
  quality: ImageGenerateParams["quality"] | undefined,
): "1K" | "2K" | "4K" {
  if (quality === "standard") return "1K";
  if (quality === "ultra") return "4K";
  return "2K";
}

function requireSingleInputImage(model: string, inputImages: string[]): string {
  const [image] = inputImages;
  if (inputImages.length === 1 && image) return image;
  throw new GenerationError(
    "kie-image",
    "invalid_input",
    `${model} supports exactly one image input.`,
  );
}

function getMimeType(outputFormat: "png" | "jpg") {
  return outputFormat === "jpg" ? "image/jpeg" : "image/png";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
