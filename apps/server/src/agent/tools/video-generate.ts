import { tool } from "langchain";
import { z } from "zod";

import {
  type AvailableModel,
  getAvailableVideoModels,
  resolveVideoProviderName,
} from "../../generation/providers/registry.js";
import { generateVideo } from "../../generation/video-generation.js";
import type { CanvasLayoutInspectionState } from "./inspect-canvas.js";

const DEFAULT_MODEL = "google-official/veo-3.1-generate-preview";
const AGNES_VIDEO_MODEL_PREFIX = "agnes-video/";

function validateAgnesVideoInput(input: {
  model: string;
  aspectRatio?: string | undefined;
  frameRate?: number | undefined;
  numFrames?: number | undefined;
  resolution?: string | undefined;
}) {
  if (!input.model.startsWith(AGNES_VIDEO_MODEL_PREFIX)) {
    return;
  }

  if (
    input.aspectRatio &&
    input.aspectRatio !== "16:9" &&
    input.aspectRatio !== "9:16"
  ) {
    throw new Error(
      "Agnes video currently supports only 16:9 or 9:16 aspect ratios.",
    );
  }

  if (
    input.resolution &&
    input.resolution !== "480p" &&
    input.resolution !== "720p" &&
    input.resolution !== "1080p"
  ) {
    throw new Error(
      "Agnes video currently supports only 480p, 720p, or 1080p output.",
    );
  }

  if (
    input.frameRate !== undefined &&
    (!Number.isInteger(input.frameRate) ||
      input.frameRate < 1 ||
      input.frameRate > 60)
  ) {
    throw new Error(
      "Agnes video frameRate must be an integer between 1 and 60.",
    );
  }

  if (input.numFrames !== undefined) {
    if (!Number.isInteger(input.numFrames) || input.numFrames <= 0) {
      throw new Error("Agnes video numFrames must be a positive integer.");
    }
    if (input.numFrames > 441) {
      throw new Error("Agnes video numFrames cannot exceed 441.");
    }
    if ((input.numFrames - 1) % 8 !== 0) {
      throw new Error("Agnes video numFrames must follow the 8n + 1 rule.");
    }
  }
}

// ── Submit function type ───────────────────────────────────────────────────

export type SubmitVideoJobFn = (input: {
  title: string;
  prompt: string;
  model: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  inputImages?: string[];
  inputVideo?: string;
  videoMode?: "multivideo" | "keyframes" | "reference";
  seed?: number;
  negativePrompt?: string;
  frameRate?: number;
  numFrames?: number;
  enableAudio?: boolean;
  placementX?: number;
  placementY?: number;
  placementWidth?: number;
  placementHeight?: number;
}) => Promise<{
  jobId: string;
  elementId?: string;
  videoUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  mimeType?: string;
  error?: string;
  status?: "generating";
}>;

// ── Dynamic schema builder ─────────────────────────────────────────────────

function buildVideoGenerateSchema(models: AvailableModel[]) {
  const modelIds = models.map((m) => m.id);
  const defaultModel = modelIds.includes(DEFAULT_MODEL)
    ? DEFAULT_MODEL
    : (modelIds[0] ?? DEFAULT_MODEL);

  const modelDescription = models.length
    ? `Video model to use. Available:\n${models.map((m) => `- ${m.id}: ${m.description}`).join("\n")}`
    : "Model identifier (no video providers currently registered)";

  const modelField =
    modelIds.length >= 1
      ? z
          .enum(modelIds as [string, ...string[]])
          .default(defaultModel as (typeof modelIds)[number])
          .describe(modelDescription)
      : z.string().default(DEFAULT_MODEL).describe(modelDescription);

  return z.object({
    title: z
      .string()
      .min(1)
      .describe(
        "Short descriptive title for the generated video, used as metadata so the video content is understood without re-analysis (e.g. 'Autumn forest bus scene', '恐龙追逐镜头')",
      ),
    prompt: z
      .string()
      .min(1)
      .describe(
        "Detailed video generation prompt. Be specific about motion, camera angles, lighting, mood, action, and scene transitions.",
      ),
    model: modelField,
    duration: z
      .number()
      .int()
      .min(3)
      .max(16)
      .optional()
      .default(5)
      .describe(
        "Video duration in seconds. Valid range depends on model (see model descriptions). Google Veo supports 4/6/8, Replicate models support 3-16.",
      ),
    resolution: z
      .enum(["480p", "720p", "1080p", "4k"])
      .optional()
      .default("720p")
      .describe(
        "Output resolution. 720p recommended for balance of quality and speed. 1080p/4k supported by Google Veo official models (8s duration required).",
      ),
    aspectRatio: z
      .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
      .optional()
      .default("16:9")
      .describe(
        "Video aspect ratio. 16:9 for landscape, 9:16 for portrait/mobile.",
      ),
    inputImages: z
      .array(z.string())
      .max(7)
      .optional()
      .describe(
        "Reference image URLs for image-to-video. First image used as first frame. Only for models with I2V capability.",
      ),
    inputVideo: z
      .string()
      .optional()
      .describe(
        "Source video URL for video-to-video editing. Only for Kling O1.",
      ),
    videoMode: z
      .enum(["multivideo", "keyframes", "reference"])
      .optional()
      .describe(
        "When using input images, choose multivideo blending, explicit first/last keyframes, or reference image conditioning.",
      ),
    seed: z
      .number()
      .int()
      .optional()
      .describe(
        "Optional deterministic seed for providers that support reproducible video generations.",
      ),
    negativePrompt: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional negative prompt for suppressing unwanted motion, objects, or styles.",
      ),
    frameRate: z
      .number()
      .int()
      .positive()
      .max(60)
      .optional()
      .describe(
        "Optional explicit frame rate for Agnes phase-2 style controls.",
      ),
    numFrames: z
      .number()
      .int()
      .positive()
      .max(441)
      .optional()
      .describe(
        "Optional explicit frame count for Agnes phase-2 style controls. Agnes expects 8n + 1.",
      ),
    enableAudio: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Generate synchronized audio (dialogue, sound effects, ambient). Not all models support this — ignored for models without audio capability.",
      ),
    placementX: z
      .number()
      .optional()
      .describe(
        "Canvas X coordinate for video placement. Use inspect_canvas to find a good position.",
      ),
    placementY: z
      .number()
      .optional()
      .describe(
        "Canvas Y coordinate for video placement. Use inspect_canvas to find a good position.",
      ),
    placementWidth: z
      .number()
      .optional()
      .describe("Width on canvas (default: 640)"),
    placementHeight: z
      .number()
      .optional()
      .describe("Height on canvas (default: 360)"),
  });
}

// ── Result type ────────────────────────────────────────────────────────────

// Infer input type from schema — includes the new `title` field
type VideoGenerateInput = z.infer<ReturnType<typeof buildVideoGenerateSchema>>;

type VideoGenerateResult = {
  summary: string;
  title?: string;
  prompt?: string;
  elementId?: string;
  videoUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  placement?: { x: number; y: number; width: number; height: number };
  error?: string;
  jobId?: string;
  jobType?: "video_generation";
  status?: "generating";
};

// ── Run function ───────────────────────────────────────────────────────────

export async function runVideoGenerate(
  input: VideoGenerateInput,
  submitVideoJob?: SubmitVideoJobFn,
): Promise<VideoGenerateResult> {
  let effectiveInput = input;
  const t0 = Date.now();
  const lap = (label: string, extra?: Record<string, unknown>) => {
    console.log(
      `[generate_video] ${label} +${Date.now() - t0}ms`,
      extra ? JSON.stringify(extra) : "",
    );
  };

  // Filter invalid image references
  if (effectiveInput.inputImages?.length) {
    const validImages = effectiveInput.inputImages.filter(
      (img) =>
        img.startsWith("http://") ||
        img.startsWith("https://") ||
        img.startsWith("data:"),
    );
    effectiveInput = {
      ...effectiveInput,
      inputImages: validImages.length > 0 ? validImages : undefined,
    };
  }

  validateAgnesVideoInput(effectiveInput);

  // Job mode: submit to PGMQ. The runtime may return immediately with a
  // canvas generation node while the frontend polls for completion.
  if (submitVideoJob) {
    try {
      lap("job_submit", { model: effectiveInput.model });
      const jobResult = await submitVideoJob({
        title: effectiveInput.title,
        prompt: effectiveInput.prompt,
        model: effectiveInput.model,
        duration: effectiveInput.duration,
        resolution: effectiveInput.resolution,
        aspectRatio: effectiveInput.aspectRatio,
        ...(effectiveInput.inputImages
          ? { inputImages: effectiveInput.inputImages }
          : {}),
        ...(effectiveInput.inputVideo
          ? { inputVideo: effectiveInput.inputVideo }
          : {}),
        ...(effectiveInput.videoMode
          ? { videoMode: effectiveInput.videoMode }
          : {}),
        ...(effectiveInput.seed !== undefined
          ? { seed: effectiveInput.seed }
          : {}),
        ...(effectiveInput.negativePrompt
          ? { negativePrompt: effectiveInput.negativePrompt }
          : {}),
        ...(effectiveInput.frameRate !== undefined
          ? { frameRate: effectiveInput.frameRate }
          : {}),
        ...(effectiveInput.numFrames !== undefined
          ? { numFrames: effectiveInput.numFrames }
          : {}),
        enableAudio: effectiveInput.enableAudio,
        ...(effectiveInput.placementX !== undefined
          ? { placementX: effectiveInput.placementX }
          : {}),
        ...(effectiveInput.placementY !== undefined
          ? { placementY: effectiveInput.placementY }
          : {}),
        ...(effectiveInput.placementWidth !== undefined
          ? { placementWidth: effectiveInput.placementWidth }
          : {}),
        ...(effectiveInput.placementHeight !== undefined
          ? { placementHeight: effectiveInput.placementHeight }
          : {}),
      });

      if (jobResult.error) {
        lap("job_failed", { error: jobResult.error });
        return {
          summary: `Video generation failed with model ${effectiveInput.model}: ${jobResult.error}. Consider trying a different model or simplifying the prompt.`,
          error: jobResult.error,
          jobId: jobResult.jobId,
          ...(jobResult.elementId != null
            ? { elementId: jobResult.elementId }
            : {}),
          jobType: "video_generation" as const,
        };
      }
      if (jobResult.status === "generating") {
        lap("job_generating", { jobId: jobResult.jobId });
        return {
          summary:
            "Video generation has started. It will automatically appear on the canvas once ready.",
          title: effectiveInput.title,
          prompt: effectiveInput.prompt,
          jobId: jobResult.jobId,
          ...(jobResult.elementId != null
            ? { elementId: jobResult.elementId }
            : {}),
          jobType: "video_generation" as const,
          status: "generating",
        };
      }
      lap("job_complete", { jobId: jobResult.jobId });

      const result: VideoGenerateResult = {
        summary: `Generated ${jobResult.durationSeconds ?? effectiveInput.duration}s video (${jobResult.width ?? 0}x${jobResult.height ?? 0}) via ${effectiveInput.model}`,
        title: effectiveInput.title,
        prompt: effectiveInput.prompt,
        ...(jobResult.elementId != null
          ? { elementId: jobResult.elementId }
          : {}),
        mimeType: jobResult.mimeType ?? "video/mp4",
        ...(jobResult.videoUrl != null ? { videoUrl: jobResult.videoUrl } : {}),
        ...(jobResult.width != null ? { width: jobResult.width } : {}),
        ...(jobResult.height != null ? { height: jobResult.height } : {}),
        ...(jobResult.durationSeconds != null
          ? { durationSeconds: jobResult.durationSeconds }
          : {}),
      };
      if (
        effectiveInput.placementX != null &&
        effectiveInput.placementY != null
      ) {
        result.placement = {
          x: effectiveInput.placementX,
          y: effectiveInput.placementY,
          width: effectiveInput.placementWidth ?? 640,
          height: effectiveInput.placementHeight ?? 360,
        };
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        summary: `Video generation failed with model ${effectiveInput.model}: ${message}`,
        error: message,
      };
    }
  }

  // Direct mode: call provider directly
  try {
    lap("direct_generate_start", { model: effectiveInput.model });
    const providerName = resolveVideoProviderName(effectiveInput.model);
    const result = await generateVideo(providerName, {
      prompt: effectiveInput.prompt,
      model: effectiveInput.model,
      duration: effectiveInput.duration,
      aspectRatio: effectiveInput.aspectRatio,
      ...(effectiveInput.resolution
        ? { resolution: effectiveInput.resolution as "480p" | "720p" | "1080p" }
        : {}),
      ...(effectiveInput.inputImages
        ? { inputImages: effectiveInput.inputImages }
        : {}),
      ...(effectiveInput.inputVideo
        ? { inputVideo: effectiveInput.inputVideo }
        : {}),
      ...(effectiveInput.videoMode
        ? { videoMode: effectiveInput.videoMode }
        : {}),
      ...(effectiveInput.seed !== undefined
        ? { seed: effectiveInput.seed }
        : {}),
      ...(effectiveInput.negativePrompt
        ? { negativePrompt: effectiveInput.negativePrompt }
        : {}),
      ...(effectiveInput.frameRate !== undefined
        ? { frameRate: effectiveInput.frameRate }
        : {}),
      ...(effectiveInput.numFrames !== undefined
        ? { numFrames: effectiveInput.numFrames }
        : {}),
      ...(effectiveInput.enableAudio != null
        ? { enableAudio: effectiveInput.enableAudio }
        : {}),
    });
    lap("direct_generate_done");

    const directResult: VideoGenerateResult = {
      summary: `Generated ${result.durationSeconds}s video (${result.width}x${result.height}) via ${effectiveInput.model}`,
      title: effectiveInput.title,
      prompt: effectiveInput.prompt,
      videoUrl: result.url,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      durationSeconds: result.durationSeconds,
    };
    if (
      effectiveInput.placementX != null &&
      effectiveInput.placementY != null
    ) {
      directResult.placement = {
        x: effectiveInput.placementX,
        y: effectiveInput.placementY,
        width: effectiveInput.placementWidth ?? 640,
        height: effectiveInput.placementHeight ?? 360,
      };
    }
    return directResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Video generation failed: ${message}`,
      error: message,
    };
  }
}

// ── Tool factory ───────────────────────────────────────────────────────────

export function createVideoGenerateTool(deps?: {
  submitVideoJob?: SubmitVideoJobFn;
  layoutInspectionState?: CanvasLayoutInspectionState;
  availableModels?: AvailableModel[];
}) {
  const models = deps?.availableModels ?? getAvailableVideoModels();

  const modelSummary = models.length
    ? models.map((m) => `${m.displayName} (${m.id})`).join(", ")
    : "No video models available";

  return tool(
    async (input: VideoGenerateInput) => {
      const result = await runVideoGenerate(input, deps?.submitVideoJob);
      if (!result.error && deps?.layoutInspectionState) {
        deps.layoutInspectionState.canvasId = undefined;
        deps.layoutInspectionState.inspectedAt = undefined;
      }
      return result;
    },
    {
      name: "generate_video",
      description: `Generate a video using AI. Available models: ${modelSummary}. Supports text-to-video, image-to-video, and video editing. Returns the generated video URL.`,
      schema: buildVideoGenerateSchema(models),
    },
  );
}
