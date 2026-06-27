import type { SubmitImageJobFn } from "./tools/image-generate.js";
import type { SubmitVideoJobFn } from "./tools/video-generate.js";

export function buildAgentImageJobPayload(
  input: Parameters<SubmitImageJobFn>[0],
) {
  return {
    prompt: input.prompt,
    title: input.title,
    model: input.model,
    aspect_ratio: input.aspectRatio,
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(input.inputImages ? { input_images: input.inputImages } : {}),
  };
}

export function buildAgentVideoJobPayload(
  input: Parameters<SubmitVideoJobFn>[0],
) {
  return {
    prompt: input.prompt,
    title: input.title,
    model: input.model,
    ...(input.duration != null ? { duration: input.duration } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    ...(input.inputImages ? { input_images: input.inputImages } : {}),
    ...(input.inputVideo ? { input_video: input.inputVideo } : {}),
    ...(input.videoMode ? { video_mode: input.videoMode } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    ...(input.frameRate !== undefined ? { frame_rate: input.frameRate } : {}),
    ...(input.numFrames !== undefined ? { num_frames: input.numFrames } : {}),
    ...(input.enableAudio != null ? { enable_audio: input.enableAudio } : {}),
  };
}
