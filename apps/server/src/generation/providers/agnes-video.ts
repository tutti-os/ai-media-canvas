import { createAgnesClient } from "agnes-ai-cli";

import type {
  GeneratedVideo,
  VideoGenerateParams,
  VideoModelInfo,
  VideoProvider,
} from "../types.js";
import { GenerationError } from "../utils.js";

const ICON_AGNES = "https://agnes-cdn.kiwiar.com/logo/agnes-icon-400x400.jpg";
const DEFAULT_FRAME_RATE = 24;
const DEFAULT_AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";
const DEFAULT_AGNES_MEDIA_TTL = "1h" as const;
const AGNES_VIDEO_POLL_INTERVAL_SECONDS = 10;
const AGNES_VIDEO_POLL_TIMEOUT_SECONDS = 7_200;
const AGNES_VIDEO_MODEL_IDS = ["agnes-video-v2.0"] as const;
const AGNES_VIDEO_ASPECT_RATIOS = ["16:9", "9:16"] as const;
const MAX_AGNES_NUM_FRAMES = 441;
type AgnesVideoModelId = (typeof AGNES_VIDEO_MODEL_IDS)[number];
type AgnesVideoAspectRatio = (typeof AGNES_VIDEO_ASPECT_RATIOS)[number];
type AgnesVideoResolution = "480p" | "720p" | "1080p";
type AgnesRemoteTaskMetadata = {
  onRemoteTaskCreated?: (task: {
    provider: string;
    taskId: string;
    videoId?: string;
    status?: string;
    raw?: unknown;
  }) => void | Promise<void>;
  onRemoteTaskStatus?: (task: {
    provider: string;
    taskId: string;
    videoId?: string;
    status?: string;
    raw?: unknown;
  }) => void | Promise<void>;
};
type AgnesVideoTaskResponse = {
  completed_at?: number | string | null;
  error?: unknown;
  id?: string;
  progress?: number;
  raw?: unknown;
  seconds?: number | string | null;
  status?: string;
  task_id?: string;
  taskId?: string;
  url?: string;
  video_id?: string;
  video_url?: string;
  videoId?: string;
  videoUrl?: string;
};

const AGNES_VIDEO_MODELS: readonly VideoModelInfo[] = [
  {
    id: "agnes-video/agnes-video-v2.0",
    displayName: "Agnes Video v2.0",
    description:
      "Agnes text, image, multi-image, and keyframe-guided video generation.",
    iconUrl: ICON_AGNES,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 18,
      maxResolution: "1080p",
      maxInputImages: 8,
    },
  },
];

function getVideoDimensions(
  resolution: AgnesVideoResolution | undefined,
  aspectRatio: AgnesVideoAspectRatio,
) {
  const landscapeBase =
    resolution === "1080p"
      ? { width: 1920, height: 1080 }
      : resolution === "480p"
        ? { width: 854, height: 480 }
        : { width: 1280, height: 720 };

  if (aspectRatio === "9:16") {
    return { width: landscapeBase.height, height: landscapeBase.width };
  }
  return landscapeBase;
}

function resolveAgnesResolution(
  resolution: VideoGenerateParams["resolution"] | "4k" | undefined,
): AgnesVideoResolution | undefined {
  if (
    resolution === undefined ||
    resolution === "480p" ||
    resolution === "720p" ||
    resolution === "1080p"
  ) {
    return resolution;
  }
  throw new GenerationError(
    "agnes-video",
    "invalid_input",
    `Unsupported Agnes video resolution: ${resolution}. Use 480p, 720p, or 1080p.`,
  );
}

function resolveAgnesAspectRatio(
  aspectRatio: string | undefined,
): AgnesVideoAspectRatio {
  const resolvedAspectRatio = aspectRatio ?? "16:9";
  if (
    AGNES_VIDEO_ASPECT_RATIOS.includes(
      resolvedAspectRatio as AgnesVideoAspectRatio,
    )
  ) {
    return resolvedAspectRatio as AgnesVideoAspectRatio;
  }
  throw new GenerationError(
    "agnes-video",
    "invalid_input",
    `Unsupported Agnes video aspect ratio: ${resolvedAspectRatio}. Use 16:9 or 9:16.`,
  );
}

function resolveAgnesFrameRate(frameRate: number | undefined) {
  const resolvedFrameRate = frameRate ?? DEFAULT_FRAME_RATE;
  if (
    !Number.isInteger(resolvedFrameRate) ||
    resolvedFrameRate < 1 ||
    resolvedFrameRate > 60
  ) {
    throw new GenerationError(
      "agnes-video",
      "invalid_input",
      `Invalid Agnes frameRate: ${resolvedFrameRate}. Use an integer between 1 and 60.`,
    );
  }
  return resolvedFrameRate;
}

function alignAgnesNumFrames(durationSeconds: number, frameRate: number) {
  const targetFrameCount = durationSeconds * frameRate;
  const alignedSteps = Math.max(1, Math.round(targetFrameCount / 8));
  return alignedSteps * 8 + 1;
}

function resolveAgnesNumFrames(
  durationSeconds: number,
  frameRate: number,
  numFrames: number | undefined,
) {
  if (numFrames !== undefined) {
    if (!Number.isInteger(numFrames) || numFrames <= 0) {
      throw new GenerationError(
        "agnes-video",
        "invalid_input",
        `Invalid Agnes numFrames: ${numFrames}. Use a positive integer.`,
      );
    }
    if (numFrames > MAX_AGNES_NUM_FRAMES) {
      throw new GenerationError(
        "agnes-video",
        "invalid_input",
        `Invalid Agnes numFrames: ${numFrames}. Maximum supported value is ${MAX_AGNES_NUM_FRAMES}.`,
      );
    }
    if ((numFrames - 1) % 8 !== 0) {
      throw new GenerationError(
        "agnes-video",
        "invalid_input",
        `Invalid Agnes numFrames: ${numFrames}. Agnes requires 8n + 1 frames.`,
      );
    }
    return numFrames;
  }

  const derivedNumFrames = alignAgnesNumFrames(durationSeconds, frameRate);
  if (derivedNumFrames > MAX_AGNES_NUM_FRAMES) {
    throw new GenerationError(
      "agnes-video",
      "invalid_input",
      `Requested duration (${durationSeconds}s) and frameRate (${frameRate}) exceed Agnes limits. Reduce frameRate or duration.`,
    );
  }
  return derivedNumFrames;
}

function resolveAgnesVideoModel(modelId: string): AgnesVideoModelId {
  const normalized = modelId.includes("/")
    ? (modelId.split("/").pop() ?? modelId)
    : modelId;
  if (AGNES_VIDEO_MODEL_IDS.includes(normalized as AgnesVideoModelId)) {
    return normalized as AgnesVideoModelId;
  }
  throw new GenerationError(
    "agnes-video",
    "model_not_found",
    `Unsupported Agnes video model: ${modelId}`,
  );
}

function resolveAgnesVideoMode(params: VideoGenerateParams) {
  const inputImages = params.inputImages ?? [];
  if (inputImages.length === 0) return "text2video" as const;
  if (inputImages.length === 1) return "img2video" as const;
  if (params.videoMode === "keyframes") return "keyframes" as const;
  return "multivideo" as const;
}

function getFirstAgnesInputImage(inputImages: string[]) {
  const [image] = inputImages;
  if (image) return image;
  throw new GenerationError(
    "agnes-video",
    "invalid_input",
    "Agnes img2video requires exactly one image.",
  );
}

function getAgnesRemoteTaskMetadata(
  params: VideoGenerateParams,
): AgnesRemoteTaskMetadata {
  return params.metadata ?? {};
}

function resolveAgnesVideoRequest(params: VideoGenerateParams) {
  if (params.inputVideo) {
    throw new GenerationError(
      "agnes-video",
      "invalid_input",
      "Agnes video does not support inputVideo in AIMC yet.",
    );
  }

  const aspectRatio = resolveAgnesAspectRatio(params.aspectRatio);
  const resolution = resolveAgnesResolution(
    params.resolution as VideoGenerateParams["resolution"] | "4k" | undefined,
  );
  const { width, height } = getVideoDimensions(resolution, aspectRatio);
  const frameRate = resolveAgnesFrameRate(params.frameRate);
  const durationSeconds = params.duration ?? 5;
  const numFrames = resolveAgnesNumFrames(
    durationSeconds,
    frameRate,
    params.numFrames,
  );
  const inputImages = params.inputImages ?? [];
  const mode = resolveAgnesVideoMode(params);
  resolveAgnesVideoModel(params.model);

  return {
    durationSeconds,
    frameRate,
    height,
    inputImages,
    mode,
    numFrames,
    width,
  };
}

export class AgnesVideoProvider implements VideoProvider {
  readonly name = "agnes-video";
  readonly models = AGNES_VIDEO_MODELS;
  private client: ReturnType<typeof createAgnesClient>;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_AGNES_BASE_URL).replace(/\/$/, "");
    this.client = createAgnesClient({
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    });
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const request = resolveAgnesVideoRequest(params);
    const metadata = getAgnesRemoteTaskMetadata(params);

    try {
      const task =
        request.mode === "text2video"
          ? await this.client.video.generate({
              mode: request.mode,
              prompt: params.prompt,
              width: request.width,
              height: request.height,
              numFrames: request.numFrames,
              frameRate: request.frameRate,
              ...(params.seed !== undefined ? { seed: params.seed } : {}),
              ...(params.negativePrompt
                ? { negativePrompt: params.negativePrompt }
                : {}),
            })
          : request.mode === "img2video"
            ? await this.client.video.generate({
                mode: request.mode,
                image: getFirstAgnesInputImage(request.inputImages),
                prompt: params.prompt,
                width: request.width,
                height: request.height,
                numFrames: request.numFrames,
                frameRate: request.frameRate,
                ttl: DEFAULT_AGNES_MEDIA_TTL,
                ...(params.seed !== undefined ? { seed: params.seed } : {}),
                ...(params.negativePrompt
                  ? { negativePrompt: params.negativePrompt }
                  : {}),
              })
            : await this.client.video.generate({
                mode: request.mode,
                images: request.inputImages,
                prompt: params.prompt,
                width: request.width,
                height: request.height,
                numFrames: request.numFrames,
                frameRate: request.frameRate,
                ttl: DEFAULT_AGNES_MEDIA_TTL,
                ...(params.seed !== undefined ? { seed: params.seed } : {}),
                ...(params.negativePrompt
                  ? { negativePrompt: params.negativePrompt }
                  : {}),
              });

      await metadata.onRemoteTaskCreated?.({
        provider: this.name,
        taskId: task.taskId,
        ...(task.videoId ? { videoId: task.videoId } : {}),
        ...(typeof task.status === "string" ? { status: task.status } : {}),
        raw: task.raw,
      });

      return await this.pollTask(
        task.videoId ?? task.taskId,
        request,
        metadata,
      );
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (isAgnesPollTimeoutError(error)) {
        throw new GenerationError(
          this.name,
          "poll_timeout",
          "Agnes video polling timed out after the remote task was created.",
        );
      }
      throw new GenerationError(
        this.name,
        "api_error",
        error instanceof Error ? error.message : "Unknown Agnes video error",
      );
    }
  }

  async resume(
    remoteTaskId: string,
    params: VideoGenerateParams,
  ): Promise<GeneratedVideo> {
    const request = resolveAgnesVideoRequest(params);
    const metadata = getAgnesRemoteTaskMetadata(params);
    try {
      return await this.pollTask(remoteTaskId, request, metadata);
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (isAgnesPollTimeoutError(error)) {
        throw new GenerationError(
          this.name,
          "poll_timeout",
          "Agnes video polling timed out after the remote task was created.",
        );
      }
      throw new GenerationError(
        this.name,
        "api_error",
        error instanceof Error ? error.message : "Unknown Agnes video error",
      );
    }
  }

  private async pollTask(
    initialPollId: string,
    request: ReturnType<typeof resolveAgnesVideoRequest>,
    metadata: AgnesRemoteTaskMetadata,
  ): Promise<GeneratedVideo> {
    const startedAt = Date.now();
    let pollId = initialPollId;

    for (;;) {
      const task = await this.fetchVideoTask(pollId);
      const status = normalizeAgnesVideoStatus(task.status);
      const videoId = extractAgnesVideoId(task, pollId);
      const remoteTaskId =
        videoId ?? extractAgnesTaskId(task, pollId) ?? pollId;
      await metadata.onRemoteTaskStatus?.({
        provider: this.name,
        taskId: remoteTaskId,
        ...(videoId ? { videoId } : {}),
        ...(status ? { status } : {}),
        raw: task.raw ?? task,
      });

      if (status === "completed" || task.completed_at) {
        const videoUrl = task.video_url ?? task.videoUrl ?? task.url;
        if (!videoUrl) {
          throw new GenerationError(
            this.name,
            "api_error",
            "Agnes video task completed without a video URL.",
          );
        }
        return {
          url: videoUrl,
          mimeType: "video/mp4",
          width: request.width,
          height: request.height,
          durationSeconds:
            coerceSeconds(task.seconds) ??
            request.durationSeconds ??
            Math.round((request.numFrames - 1) / request.frameRate),
        };
      }

      if (status === "failed" || status === "canceled") {
        throw new GenerationError(
          this.name,
          status === "canceled" ? "canceled" : "api_error",
          getAgnesTaskErrorMessage(task.error, status),
        );
      }

      if (videoId) {
        pollId = videoId;
      }

      if (Date.now() - startedAt >= AGNES_VIDEO_POLL_TIMEOUT_SECONDS * 1_000) {
        throw new GenerationError(
          this.name,
          "poll_timeout",
          `Agnes video task ${pollId} did not finish within ${AGNES_VIDEO_POLL_TIMEOUT_SECONDS} seconds.`,
        );
      }

      await delay(AGNES_VIDEO_POLL_INTERVAL_SECONDS * 1_000);
    }
  }

  private async fetchVideoTask(
    pollId: string,
  ): Promise<AgnesVideoTaskResponse> {
    const response = await fetch(buildAgnesVideoPollUrl(this.baseUrl, pollId), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const text = await response.text();
    const body = parseAgnesJson(text);
    if (!response.ok) {
      throw new GenerationError(
        this.name,
        "api_error",
        getAgnesTaskErrorMessage(
          typeof body === "object" && body !== null && "error" in body
            ? (body as { error?: unknown }).error
            : body,
          `HTTP ${response.status}`,
        ),
      );
    }
    return typeof body === "object" && body !== null
      ? (body as AgnesVideoTaskResponse)
      : { raw: body };
  }
}

function buildAgnesVideoPollUrl(baseUrl: string, pollId: string): string {
  if (pollId.startsWith("task_")) {
    return `${baseUrl}/videos/${encodeURIComponent(pollId)}`;
  }
  const url = new URL("/agnesapi", new URL(baseUrl));
  url.searchParams.set("video_id", pollId);
  return url.toString();
}

function extractAgnesVideoId(
  task: AgnesVideoTaskResponse,
  fallbackId: string,
): string | undefined {
  if (typeof task.video_id === "string") return task.video_id;
  if (typeof task.videoId === "string") return task.videoId;
  if (typeof task.id === "string" && task.id.startsWith("video_")) {
    return task.id;
  }
  return fallbackId.startsWith("video_") ? fallbackId : undefined;
}

function extractAgnesTaskId(
  task: AgnesVideoTaskResponse,
  fallbackId: string,
): string | undefined {
  if (typeof task.task_id === "string") return task.task_id;
  if (typeof task.taskId === "string") return task.taskId;
  if (typeof task.id === "string" && task.id.startsWith("task_")) {
    return task.id;
  }
  return fallbackId.startsWith("task_") ? fallbackId : undefined;
}

function normalizeAgnesVideoStatus(status: string | undefined) {
  if (!status) return undefined;
  const normalized = status.toLowerCase();
  if (normalized === "succeeded") return "completed";
  if (normalized === "cancelled") return "canceled";
  return normalized;
}

function parseAgnesJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function coerceSeconds(seconds: number | string | null | undefined) {
  if (typeof seconds === "number") return seconds;
  if (typeof seconds === "string") {
    const parsed = Number(seconds);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getAgnesTaskErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return `Agnes video task ${fallback}.`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAgnesPollTimeoutError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "POLL_TIMEOUT"
  );
}
