import { z } from "zod";

import {
  canvasIdSchema,
  identifierSchema,
  projectIdSchema,
  sessionIdSchema,
  timestampSchema,
  userIdSchema,
} from "./contracts.js";

export const backgroundJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "dead_letter",
]);
export type BackgroundJobStatus = z.infer<typeof backgroundJobStatusSchema>;

export const backgroundJobTypeSchema = z.enum([
  "image_generation",
  "video_generation",
]);
export type BackgroundJobType = z.infer<typeof backgroundJobTypeSchema>;

export const imageGenerationPayloadSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  aspect_ratio: z.string().min(1).optional(),
  quality: z.enum(["standard", "hd", "ultra"]).optional(),
  input_images: z.array(z.string().min(1)).optional(),
  size: z.string().min(1).optional(),
  seed: z.number().int().optional(),
});
export type ImageGenerationPayload = z.infer<typeof imageGenerationPayloadSchema>;

export const videoGenerationPayloadSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  duration: z.number().int().min(1).optional(),
  resolution: z.string().min(1).optional(),
  aspect_ratio: z.string().min(1).optional(),
  input_images: z.array(z.string().min(1)).optional(),
  input_video: z.string().min(1).optional(),
  video_mode: z.enum(["multivideo", "keyframes"]).optional(),
  seed: z.number().int().optional(),
  negative_prompt: z.string().min(1).optional(),
  frame_rate: z.number().int().positive().optional(),
  num_frames: z.number().int().positive().optional(),
  enable_audio: z.boolean().optional(),
});
export type VideoGenerationPayload = z.infer<typeof videoGenerationPayloadSchema>;

export const createImageJobRequestSchema = z.object({
  project_id: projectIdSchema.optional(),
  canvas_id: canvasIdSchema.optional(),
  session_id: sessionIdSchema.optional(),
  thread_id: identifierSchema.optional(),
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  aspect_ratio: z.string().min(1).optional(),
  quality: z.enum(["standard", "hd", "ultra"]).optional(),
  input_images: z.array(z.string().min(1)).optional(),
  size: z.string().min(1).optional(),
  seed: z.number().int().optional(),
});
export type CreateImageJobRequest = z.infer<typeof createImageJobRequestSchema>;

export const createVideoJobRequestSchema = z.object({
  project_id: projectIdSchema.optional(),
  canvas_id: canvasIdSchema.optional(),
  session_id: sessionIdSchema.optional(),
  thread_id: identifierSchema.optional(),
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  duration: z.number().int().min(1).optional(),
  resolution: z.string().min(1).optional(),
  aspect_ratio: z.string().min(1).optional(),
  input_images: z.array(z.string().min(1)).optional(),
  input_video: z.string().min(1).optional(),
  video_mode: z.enum(["multivideo", "keyframes"]).optional(),
  seed: z.number().int().optional(),
  negative_prompt: z.string().min(1).optional(),
  frame_rate: z.number().int().positive().optional(),
  num_frames: z.number().int().positive().optional(),
  enable_audio: z.boolean().optional(),
});
export type CreateVideoJobRequest = z.infer<typeof createVideoJobRequestSchema>;

export const backgroundJobSchema = z.object({
  id: identifierSchema,
  workspace_id: identifierSchema,
  project_id: projectIdSchema.nullable(),
  canvas_id: canvasIdSchema.nullable(),
  session_id: sessionIdSchema.nullable(),
  thread_id: identifierSchema.nullable(),
  queue_name: z.string().min(1),
  job_type: backgroundJobTypeSchema,
  status: backgroundJobStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  attempt_count: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  created_by: userIdSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  started_at: timestampSchema.nullable(),
  completed_at: timestampSchema.nullable(),
  failed_at: timestampSchema.nullable(),
  canceled_at: timestampSchema.nullable(),
  remote_provider: z.string().nullable().optional(),
  remote_task_id: z.string().nullable().optional(),
  remote_status: z.string().nullable().optional(),
  remote_updated_at: timestampSchema.nullable().optional(),
});
export type BackgroundJob = z.infer<typeof backgroundJobSchema>;

export const jobResponseSchema = z.object({
  job: backgroundJobSchema,
});
export type JobResponse = z.infer<typeof jobResponseSchema>;

export const jobListResponseSchema = z.object({
  jobs: z.array(backgroundJobSchema),
});
export type JobListResponse = z.infer<typeof jobListResponseSchema>;
