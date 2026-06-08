import type { BackgroundJob, VideoGenerationPayload } from "@aimc/shared";

import type { ServerEnv } from "../../../config/env.js";
import { refreshGenerationProviders } from "../../settings/settings-service.js";
import { loadGeneratedAsset } from "../../../generation/generated-asset.js";
import { generateVideo } from "../../../generation/video-generation.js";
import { resolveVideoProviderName } from "../../../generation/providers/registry.js";
import { GenerationError } from "../../../generation/utils.js";
import type { LocalStore } from "../../../local/store.js";

const DEFAULT_VIDEO_MODEL = "google-official/veo-3.1-generate-preview";

export async function executeVideoGenerationJob(
  store: LocalStore,
  job: BackgroundJob,
  env?: ServerEnv,
) {
  if (env) {
    refreshGenerationProviders(env);
  }
  const payload = job.payload as VideoGenerationPayload;
  const model = payload.model ?? DEFAULT_VIDEO_MODEL;
  const provider = resolveVideoProviderName(model);
  const generated = await generateVideo(provider, {
    prompt: payload.prompt,
    model,
    ...(payload.duration ? { duration: payload.duration } : {}),
    ...(payload.resolution
      ? { resolution: payload.resolution as "480p" | "720p" | "1080p" }
      : {}),
    ...(payload.aspect_ratio ? { aspectRatio: payload.aspect_ratio } : {}),
    ...(payload.input_images ? { inputImages: payload.input_images } : {}),
    ...(payload.input_video ? { inputVideo: payload.input_video } : {}),
    ...(payload.video_mode ? { videoMode: payload.video_mode } : {}),
    ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
    ...(payload.negative_prompt
      ? { negativePrompt: payload.negative_prompt }
      : {}),
    ...(payload.frame_rate !== undefined
      ? { frameRate: payload.frame_rate }
      : {}),
    ...(payload.num_frames !== undefined ? { numFrames: payload.num_frames } : {}),
    ...(payload.enable_audio !== undefined
      ? { enableAudio: payload.enable_audio }
      : {}),
  });

  const { buffer, mimeType } = await loadGeneratedAsset(
    generated.url,
    generated.mimeType || "video/mp4",
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
    duration_seconds: generated.durationSeconds,
    mime_type: stored.asset.mimeType ?? mimeType,
  };
}

export function isRetryableVideoGenerationError(error: unknown) {
  return error instanceof GenerationError
    ? ![
        "provider_not_found",
        "model_not_found",
        "invalid_input",
        "input_fetch_error",
        "safety_filter",
        "poll_timeout",
      ].includes(error.code)
    : true;
}
