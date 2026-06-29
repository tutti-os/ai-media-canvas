import {
  getAvailableImageModels,
  getAvailableVideoModels,
} from "./providers/registry.js";

export const FALLBACK_IMAGE_MODEL = "codex/gpt-image-2";
export const FALLBACK_VIDEO_MODEL = "google-official/veo-3.1-generate-preview";

export function getDefaultImageModelId() {
  return getAvailableImageModels()[0]?.id ?? FALLBACK_IMAGE_MODEL;
}

export function getDefaultVideoModelId() {
  return getAvailableVideoModels()[0]?.id ?? FALLBACK_VIDEO_MODEL;
}
