import type { BackgroundJob, ImageGenerationPayload } from "@aimc/shared";

import type { ServerEnv } from "../../../config/env.js";
import { FALLBACK_IMAGE_MODEL } from "../../../generation/default-models.js";
import { loadGeneratedAsset } from "../../../generation/generated-asset.js";
import { generateImage } from "../../../generation/image-generation.js";
import { resolveImageProviderName } from "../../../generation/providers/registry.js";
import { GenerationError } from "../../../generation/utils.js";
import type { LocalStore } from "../../../local/store.js";
import { refreshGenerationProviders } from "../../settings/settings-service.js";

export async function executeImageGenerationJob(
  store: LocalStore,
  job: BackgroundJob,
  env?: ServerEnv,
) {
  if (env) {
    refreshGenerationProviders(env);
  }
  const payload = job.payload as ImageGenerationPayload;
  const model = payload.model ?? FALLBACK_IMAGE_MODEL;
  const provider = resolveImageProviderName(model);
  const generated = await generateImage(provider, {
    prompt: payload.prompt,
    model,
    ...(payload.aspect_ratio ? { aspectRatio: payload.aspect_ratio } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
    ...(payload.input_images ? { inputImages: payload.input_images } : {}),
    ...(payload.size ? { size: payload.size } : {}),
    ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
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
