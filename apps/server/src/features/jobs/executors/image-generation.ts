import type { BackgroundJob, ImageGenerationPayload } from "@aimc/shared";

import { generateImage } from "../../../generation/image-generation.js";
import { loadGeneratedAsset } from "../../../generation/generated-asset.js";
import { resolveImageProviderName } from "../../../generation/providers/registry.js";
import { GenerationError } from "../../../generation/utils.js";
import type { LocalStore } from "../../../local/store.js";

const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux-kontext-pro";

export async function executeImageGenerationJob(
  store: LocalStore,
  job: BackgroundJob,
) {
  const payload = job.payload as ImageGenerationPayload;
  const model = payload.model ?? DEFAULT_IMAGE_MODEL;
  const provider = resolveImageProviderName(model);
  const generated = await generateImage(provider, {
    prompt: payload.prompt,
    model,
    ...(payload.aspect_ratio ? { aspectRatio: payload.aspect_ratio } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
        ...(payload.input_images ? { inputImages: payload.input_images } : {}),
  });

  const { buffer, mimeType } = await loadGeneratedAsset(
    generated.url,
    generated.mimeType || "image/png",
  );
  const stored = store.uploadFile({
    bucket: "project-assets",
    fileName: `${provider}-${Date.now()}`,
    fileBuffer: buffer,
    mimeType,
    ...(job.project_id ? { projectId: job.project_id } : {}),
  });
  return {
    asset_id: stored.asset.id,
    signed_url: stored.url,
    object_path: stored.asset.objectPath,
    width: generated.width,
    height: generated.height,
    mime_type: stored.asset.mimeType ?? mimeType,
  };
}

export function isRetryableImageGenerationError(error: unknown) {
  return error instanceof GenerationError
    ? ![
        "provider_not_found",
        "model_not_found",
        "invalid_input",
        "input_fetch_error",
        "safety_filter",
      ].includes(error.code)
    : true;
}
