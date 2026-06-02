import OpenAI from "openai";

import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const ICON_OPENAI = "https://github.com/openai.png";

const OPENAI_IMAGE_MODELS: readonly ModelInfo[] = [
  {
    id: "gpt-image-1.5",
    displayName: "GPT Image 1.5",
    description:
      "OpenAI's highest-quality image model for generation and editing.",
    iconUrl: ICON_OPENAI,
  },
  {
    id: "gpt-image-1",
    displayName: "GPT Image 1",
    description:
      "OpenAI's general-purpose image generation and editing model.",
    iconUrl: ICON_OPENAI,
  },
  {
    id: "gpt-image-1-mini",
    displayName: "GPT Image 1 Mini",
    description:
      "A lower-cost GPT Image variant for faster image generation tasks.",
    iconUrl: ICON_OPENAI,
  },
];

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly models = OPENAI_IMAGE_MODELS;
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = aspectRatioToDimensions(params.aspectRatio ?? "1:1");
    const size = `${width}x${height}`;

    try {
      const response = await this.client.images.generate({
        model: params.model,
        prompt: params.prompt,
        size: size as "1024x1024",
        n: 1,
      });

      const url = response.data?.[0]?.url;
      if (!url) {
        throw new GenerationError("openai", "no_output", "OpenAI returned no image URL");
      }

      return { url, mimeType: "image/png", width, height };
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
