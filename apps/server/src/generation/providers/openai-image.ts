import OpenAI from "openai";

import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { GenerationError, aspectRatioToDimensions } from "../utils.js";

const ICON_OPENAI = "https://github.com/openai.png";

const OPENAI_IMAGE_MODELS: readonly ModelInfo[] = [
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    description:
      "OpenAI's state-of-the-art model for fast, high-quality image generation and editing.",
    iconUrl: ICON_OPENAI,
  },
  {
    id: "gpt-image-1.5",
    displayName: "GPT Image 1.5",
    description:
      "OpenAI's highest-quality image model for generation and editing.",
    iconUrl: ICON_OPENAI,
  },
];

const OPENAI_QUALITY_BY_SEMANTIC = {
  standard: "low",
  hd: "medium",
  ultra: "high",
} as const;

const OPENAI_OUTPUT_FORMAT = {
  png: "png",
  jpg: "jpeg",
  webp: "webp",
} as const;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngDimensions(base64: string) {
  const buffer = Buffer.from(base64, "base64");
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return undefined;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function resolveOpenAIImageDimensions(
  model: string,
  aspectRatio: string,
): { width: number; height: number } {
  if (model !== "gpt-image-2" && !model.startsWith("gpt-image-2-")) {
    const { width, height } = aspectRatioToDimensions(aspectRatio);
    if (width === height) return { width: 1024, height: 1024 };
    return width > height
      ? { width: 1536, height: 1024 }
      : { width: 1024, height: 1536 };
  }

  const [widthPart, heightPart] = aspectRatio.split(":");
  const ratio = Number(widthPart) / Number(heightPart);
  if (!Number.isFinite(ratio) || ratio < 1 / 3 || ratio > 3) {
    return { width: 1024, height: 1024 };
  }
  if (ratio === 1) return { width: 1024, height: 1024 };

  const longEdge = 1536;
  const roundTo16 = (value: number) => Math.round(value / 16) * 16;
  return ratio > 1
    ? { width: longEdge, height: roundTo16(longEdge / ratio) }
    : { width: roundTo16(longEdge * ratio), height: longEdge };
}

export function isValidOpenAIImageBaseURL(
  baseURL: string | undefined,
): boolean {
  if (!baseURL) return true;

  try {
    const url = new URL(baseURL);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly models = OPENAI_IMAGE_MODELS;
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = resolveOpenAIImageDimensions(
      params.model,
      params.aspectRatio ?? "1:1",
    );
    const size = `${width}x${height}`;
    const outputFormat = OPENAI_OUTPUT_FORMAT[params.outputFormat ?? "png"];

    try {
      const response = await this.client.images.generate({
        model: params.model,
        prompt: params.prompt,
        size,
        n: 1,
        output_format: outputFormat,
        ...(params.quality
          ? { quality: OPENAI_QUALITY_BY_SEMANTIC[params.quality] }
          : {}),
      });

      const image = response.data?.[0];
      const url = image?.url;
      const base64 = image?.b64_json;
      if (!url && !base64) {
        throw new GenerationError(
          "openai",
          "no_output",
          "OpenAI returned no image data",
        );
      }

      const mimeType =
        outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
      const actualDimensions =
        base64 && outputFormat === "png"
          ? readPngDimensions(base64)
          : undefined;
      return {
        url: url ?? `data:${mimeType};base64,${base64}`,
        mimeType,
        width: actualDimensions?.width ?? width,
        height: actualDimensions?.height ?? height,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        "openai",
        "api_error",
        error instanceof Error ? error.message : "Unknown OpenAI error",
      );
    }
  }
}
