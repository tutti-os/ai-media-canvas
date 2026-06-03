import { createAgnesClient } from "agnes-ai-cli";

import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const ICON_AGNES = "https://github.com/jomeswang.png";
const DEFAULT_AGNES_MEDIA_TTL = "1h" as const;
const AGNES_IMAGE_MODEL_IDS = [
  "agnes-image-2.1-flash",
  "agnes-image-2.0-flash",
] as const;
type AgnesImageModelId = (typeof AGNES_IMAGE_MODEL_IDS)[number];

const AGNES_IMAGE_MODELS: readonly ModelInfo[] = [
  {
    id: "agnes-image/agnes-image-2.1-flash",
    displayName: "Agnes Image 2.1 Flash",
    description: "Agnes high-fidelity image generation and editing route.",
    iconUrl: ICON_AGNES,
  },
  {
    id: "agnes-image/agnes-image-2.0-flash",
    displayName: "Agnes Image 2.0 Flash",
    description: "Agnes image route with compose and edit support.",
    iconUrl: ICON_AGNES,
  },
];

function resolveAgnesImageModel(modelId: string): AgnesImageModelId {
  const normalized = modelId.includes("/")
    ? modelId.split("/").pop() ?? modelId
    : modelId;
  if (
    AGNES_IMAGE_MODEL_IDS.includes(normalized as AgnesImageModelId)
  ) {
    return normalized as AgnesImageModelId;
  }
  throw new GenerationError(
    "agnes-image",
    "model_not_found",
    `Unsupported Agnes image model: ${modelId}`,
  );
}

function resolveImageDimensions(size: string, fallbackAspectRatio: string) {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) {
    return {
      width: Number.parseInt(match[1]!, 10),
      height: Number.parseInt(match[2]!, 10),
    };
  }
  return aspectRatioToDimensions(fallbackAspectRatio);
}

export class AgnesImageProvider implements ImageProvider {
  readonly name = "agnes-image";
  readonly models = AGNES_IMAGE_MODELS;
  private client: ReturnType<typeof createAgnesClient>;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = createAgnesClient({
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    });
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const aspectRatio = params.aspectRatio ?? "1:1";
    const { width, height } = aspectRatioToDimensions(aspectRatio);
    const size = params.size ?? `${width}x${height}`;
    const outputDimensions = resolveImageDimensions(size, aspectRatio);
    const model = resolveAgnesImageModel(params.model);

    try {
      const inputImages = params.inputImages ?? [];
      const result =
        inputImages.length === 0
          ? await this.client.image.generate({
              mode: "text2img",
              model,
              prompt: params.prompt,
              size,
              ...(params.seed !== undefined ? { seed: params.seed } : {}),
            })
          : inputImages.length === 1
            ? await this.client.image.generate({
                mode: "img2img",
                model,
                image: inputImages[0]!,
                prompt: params.prompt,
                size,
                ttl: DEFAULT_AGNES_MEDIA_TTL,
                ...(params.seed !== undefined ? { seed: params.seed } : {}),
              })
            : await this.client.image.generate({
                mode: "compose",
                model,
                images: inputImages,
                prompt: params.prompt,
                size,
                ttl: DEFAULT_AGNES_MEDIA_TTL,
                ...(params.seed !== undefined ? { seed: params.seed } : {}),
              });

      return {
        url: result.url,
        mimeType: "image/png",
        width: outputDimensions.width,
        height: outputDimensions.height,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        this.name,
        "api_error",
        error instanceof Error ? error.message : "Unknown Agnes image error",
      );
    }
  }
}
