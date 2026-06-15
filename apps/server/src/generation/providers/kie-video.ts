import type {
  GeneratedVideo,
  VideoGenerateParams,
  VideoModelInfo,
  VideoProvider,
} from "../types.js";
import { GenerationError, fetchAsBase64 } from "../utils.js";
import {
  KieClient,
  type KieMarketTaskRecord,
  type KieRunwayTaskRecord,
  type KieVeoTaskRecord,
  getFirstKieMarketResultUrl,
  getFirstKieRunwayResultUrl,
  getFirstKieVeoResultUrl,
} from "./kie-client.js";

const ICON_KIE = "https://kie.ai/favicon.ico";
const DEFAULT_KIE_VIDEO_POLL_INTERVAL_MS = 5_000;
const DEFAULT_KIE_VIDEO_POLL_TIMEOUT_MS = 30 * 60_000;

type KieVideoModelId =
  | "kie/runway"
  | "kie/grok-imagine"
  | "kie/hailuo"
  | "kie/veo-3.1"
  | "kie/kling-2.6"
  | "kie/seedance-2"
  | "kie/happyhorse-1";

type KieVideoRemoteMetadata = {
  onRemoteTaskCreated?: (task: {
    provider: string;
    taskId: string;
    status?: string;
    raw?: unknown;
  }) => void | Promise<void>;
  onRemoteTaskStatus?: (task: {
    provider: string;
    taskId: string;
    status?: string;
    raw?: unknown;
  }) => void | Promise<void>;
};

export type KieVideoProviderOptions = {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

export type KieVideoRequest = {
  kind: "market" | "runway" | "veo";
  model?: string;
  input?: Record<string, unknown>;
  payload: Record<string, unknown>;
  width: number;
  height: number;
  durationSeconds: number;
};

const KIE_VIDEO_MODELS: readonly VideoModelInfo[] = [
  {
    id: "kie/runway",
    displayName: "Runway",
    description: "Kie Runway text-to-video and image-to-video generation.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 10,
      allowedDurations: [5, 10],
      maxResolution: "1080p",
      maxInputImages: 1,
    },
  },
  {
    id: "kie/grok-imagine",
    displayName: "Grok Imagine",
    description: "Kie Market Grok Imagine text-to-video and image-to-video.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 6,
      allowedDurations: [6],
      maxResolution: "480p",
      maxInputImages: 1,
    },
  },
  {
    id: "kie/hailuo",
    displayName: "Hailuo",
    description: "Kie Market Hailuo Pro text-to-video and image-to-video.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 6,
      maxResolution: "1080p",
      maxInputImages: 2,
    },
  },
  {
    id: "kie/veo-3.1",
    displayName: "Veo 3.1",
    description: "Kie Veo 3.1 text-to-video and image-to-video generation.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: true,
    },
    limits: {
      maxDuration: 8,
      maxResolution: "1080p",
      maxInputImages: 2,
    },
  },
  {
    id: "kie/kling-2.6",
    displayName: "Kling 2.6",
    description: "Kie Market Kling 2.6 text-to-video and image-to-video.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: true,
    },
    limits: {
      maxDuration: 10,
      allowedDurations: [5, 10],
      maxResolution: "1080p",
      maxInputImages: 1,
    },
  },
  {
    id: "kie/seedance-2",
    displayName: "Seedance 2.0",
    description: "Kie Market Bytedance Seedance 2.0 text and image video.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: true,
    },
    limits: {
      maxDuration: 15,
      allowedDurations: [5, 10, 15],
      maxResolution: "1080p",
      maxInputImages: 2,
    },
  },
  {
    id: "kie/happyhorse-1",
    displayName: "HappyHorse 1.0",
    description: "Kie Market HappyHorse text-to-video and image-to-video.",
    iconUrl: ICON_KIE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 5,
      allowedDurations: [5],
      maxResolution: "1080p",
      maxInputImages: 1,
    },
  },
];

export function resolveKieVideoRequest(
  params: VideoGenerateParams,
): KieVideoRequest {
  if (params.inputVideo) {
    throw new GenerationError(
      "kie-video",
      "invalid_input",
      "Kie video does not support inputVideo in AIMC yet.",
    );
  }

  const model = resolveKieVideoModel(params.model);
  const aspectRatio = params.aspectRatio ?? "16:9";
  const resolution = params.resolution ?? "720p";
  const durationSeconds = params.duration ?? getDefaultDuration(model);
  const inputImages = params.inputImages ?? [];
  const dimensions = getVideoDimensions(resolution, aspectRatio);

  if (model === "kie/runway") {
    if (durationSeconds === 10 && resolution === "1080p") {
      throw new GenerationError(
        "kie-video",
        "invalid_input",
        "Runway does not support 10-second videos at 1080p.",
      );
    }
    return {
      kind: "runway",
      payload: {
        prompt: params.prompt,
        ...(inputImages.length > 0
          ? { imageUrl: requireSingleInputImage("runway", inputImages) }
          : {}),
        duration: String(durationSeconds),
        quality: resolution,
        aspectRatio,
      },
      durationSeconds,
      ...dimensions,
    };
  }

  if (model === "kie/veo-3.1") {
    const referenceMode = params.videoMode === "reference";
    const imageUrls = requireAtMostInputImages(
      "veo-3.1",
      inputImages,
      referenceMode ? 1 : 2,
    );
    return {
      kind: "veo",
      payload: {
        prompt: params.prompt,
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
        model: "veo3_fast",
        aspect_ratio: aspectRatio,
        enableFallback: false,
        enableTranslation: true,
        generationType:
          imageUrls.length === 0
            ? "TEXT_2_VIDEO"
            : referenceMode
              ? "REFERENCE_2_VIDEO"
              : "FIRST_AND_LAST_FRAMES_2_VIDEO",
      },
      durationSeconds,
      ...dimensions,
    };
  }

  if (model === "kie/grok-imagine") {
    const grokResolution = "480p";
    return marketVideoRequest(
      inputImages.length === 0
        ? "grok-imagine/text-to-video"
        : "grok-imagine/image-to-video",
      {
        prompt: params.prompt,
        ...(inputImages.length > 0
          ? {
              image_urls: requireAtMostInputImages(
                "grok-imagine",
                inputImages,
                1,
              ),
            }
          : {}),
        aspect_ratio: aspectRatio,
        mode: "normal",
        duration: String(durationSeconds),
        resolution: grokResolution,
      },
      getVideoDimensions(grokResolution, aspectRatio),
      durationSeconds,
    );
  }

  if (model === "kie/hailuo") {
    const images = requireAtMostInputImages("hailuo", inputImages, 2);
    return marketVideoRequest(
      images.length === 0
        ? "hailuo/02-text-to-video-pro"
        : "hailuo/02-image-to-video-pro",
      {
        prompt: params.prompt,
        ...(images.length > 0
          ? {
              image_url: images[0],
              end_image_url: images[1] ?? "",
            }
          : {}),
        prompt_optimizer: true,
      },
      dimensions,
      durationSeconds,
    );
  }

  if (model === "kie/kling-2.6") {
    const images = requireAtMostInputImages("kling-2.6", inputImages, 1);
    return marketVideoRequest(
      images.length === 0
        ? "kling-2.6/text-to-video"
        : "kling-2.6/image-to-video",
      {
        prompt: params.prompt,
        ...(images.length > 0 ? { image_urls: images } : {}),
        sound: params.enableAudio === true,
        ...(images.length === 0 ? { aspect_ratio: aspectRatio } : {}),
        duration: String(durationSeconds),
      },
      dimensions,
      durationSeconds,
    );
  }

  if (model === "kie/seedance-2") {
    const referenceMode = params.videoMode === "reference";
    const images = requireAtMostInputImages(
      "seedance-2",
      inputImages,
      referenceMode ? 8 : 2,
    );
    return marketVideoRequest(
      "bytedance/seedance-2",
      {
        prompt: params.prompt,
        ...(referenceMode
          ? { reference_image_urls: images }
          : {
              ...(images[0] ? { first_frame_url: images[0] } : {}),
              ...(images[1] ? { last_frame_url: images[1] } : {}),
            }),
        generate_audio: params.enableAudio === true,
        resolution,
        aspect_ratio: aspectRatio,
        duration: durationSeconds,
        web_search: false,
      },
      dimensions,
      durationSeconds,
    );
  }

  const happyHorseReferenceMode = params.videoMode === "reference";
  const happyHorseImages = requireAtMostInputImages(
    "happyhorse-1",
    inputImages,
    happyHorseReferenceMode ? 4 : 1,
  );
  return marketVideoRequest(
    happyHorseReferenceMode
      ? "happyhorse/reference-to-video"
      : happyHorseImages.length === 0
        ? "happyhorse/text-to-video"
        : "happyhorse/image-to-video",
    {
      prompt: params.prompt,
      ...(happyHorseReferenceMode
        ? { reference_image: happyHorseImages }
        : happyHorseImages.length > 0
          ? { image_urls: happyHorseImages }
          : { aspect_ratio: aspectRatio }),
      resolution,
      duration: durationSeconds,
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
    },
    dimensions,
    durationSeconds,
  );
}

export class KieVideoProvider implements VideoProvider {
  readonly name = "kie-video";
  readonly models = KIE_VIDEO_MODELS;
  private readonly client: KieClient;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;

  constructor(
    apiKey: string,
    baseUrl?: string,
    options: KieVideoProviderOptions = {},
  ) {
    this.client = new KieClient(apiKey, {
      ...(baseUrl ? { apiBase: baseUrl } : {}),
    });
    this.pollIntervalMs =
      options.pollIntervalMs ?? DEFAULT_KIE_VIDEO_POLL_INTERVAL_MS;
    this.pollTimeoutMs =
      options.pollTimeoutMs ?? DEFAULT_KIE_VIDEO_POLL_TIMEOUT_MS;
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const inputImages = await prepareKieInputImages(
      this.client,
      params.inputImages,
    );
    const request = resolveKieVideoRequest({
      ...params,
      ...(inputImages ? { inputImages } : {}),
    });
    const metadata = getKieVideoRemoteMetadata(params);

    try {
      const taskId =
        request.kind === "runway"
          ? await this.client.createRunwayTask(request.payload)
          : request.kind === "veo"
            ? await this.client.createVeoTask(request.payload)
            : await this.client.createMarketTask(
                getMarketVideoTaskPayload(request),
              );

      await metadata.onRemoteTaskCreated?.({
        provider: this.name,
        taskId,
        status: "created",
      });

      return await this.pollTask(taskId, request, metadata);
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        this.name,
        "api_error",
        error instanceof Error ? error.message : "Unknown Kie video error",
      );
    }
  }

  async resume(
    remoteTaskId: string,
    params: VideoGenerateParams,
  ): Promise<GeneratedVideo> {
    const request = resolveKieVideoRequest(params);
    return this.pollTask(
      remoteTaskId,
      request,
      getKieVideoRemoteMetadata(params),
    );
  }

  private async pollTask(
    taskId: string,
    request: KieVideoRequest,
    metadata: KieVideoRemoteMetadata,
  ): Promise<GeneratedVideo> {
    const startedAt = Date.now();

    for (;;) {
      if (request.kind === "runway") {
        const record = await this.client.queryRunwayTask(taskId);
        await this.notifyStatus(metadata, taskId, record.state, record);
        const result = this.resolveRunwayRecord(taskId, record, request);
        if (result) return result;
      } else if (request.kind === "veo") {
        const record = await this.client.queryVeoTask(taskId);
        await this.notifyStatus(
          metadata,
          taskId,
          String(record.successFlag),
          record,
        );
        const result = this.resolveVeoRecord(taskId, record, request);
        if (result) return result;
      } else {
        const record = await this.client.queryMarketTask(taskId);
        await this.notifyStatus(metadata, taskId, record.state, record);
        const result = this.resolveMarketRecord(taskId, record, request);
        if (result) return result;
      }

      if (Date.now() - startedAt >= this.pollTimeoutMs) {
        throw new GenerationError(
          this.name,
          "poll_timeout",
          `Kie video task ${taskId} did not finish within ${Math.round(
            this.pollTimeoutMs / 1_000,
          )} seconds.`,
        );
      }
      await delay(this.pollIntervalMs);
    }
  }

  private async notifyStatus(
    metadata: KieVideoRemoteMetadata,
    taskId: string,
    status: string | undefined,
    raw: unknown,
  ) {
    await metadata.onRemoteTaskStatus?.({
      provider: this.name,
      taskId,
      ...(status ? { status } : {}),
      raw,
    });
  }

  private resolveMarketRecord(
    taskId: string,
    record: KieMarketTaskRecord,
    request: KieVideoRequest,
  ): GeneratedVideo | undefined {
    const state = record.state?.toLowerCase();
    if (state === "success") {
      const url = getFirstKieMarketResultUrl(record);
      if (!url) {
        throw new GenerationError(
          this.name,
          "api_error",
          `Kie video task ${taskId} completed without a video URL.`,
        );
      }
      return videoResult(url, request);
    }
    if (state === "fail") {
      throw new GenerationError(
        this.name,
        "api_error",
        record.failMsg || record.failCode || `Kie video task ${taskId} failed.`,
      );
    }
    return undefined;
  }

  private resolveRunwayRecord(
    taskId: string,
    record: KieRunwayTaskRecord,
    request: KieVideoRequest,
  ): GeneratedVideo | undefined {
    const state = record.state?.toLowerCase();
    if (state === "success") {
      const url = getFirstKieRunwayResultUrl(record);
      if (!url) {
        throw new GenerationError(
          this.name,
          "api_error",
          `Kie Runway task ${taskId} completed without a video URL.`,
        );
      }
      return videoResult(url, request);
    }
    if (state === "fail") {
      throw new GenerationError(
        this.name,
        "api_error",
        record.failMsg ||
          record.failCode ||
          `Kie Runway task ${taskId} failed.`,
      );
    }
    return undefined;
  }

  private resolveVeoRecord(
    taskId: string,
    record: KieVeoTaskRecord,
    request: KieVideoRequest,
  ): GeneratedVideo | undefined {
    if (record.successFlag === 1) {
      const url = getFirstKieVeoResultUrl(record);
      if (!url) {
        throw new GenerationError(
          this.name,
          "api_error",
          `Kie Veo task ${taskId} completed without a video URL.`,
        );
      }
      return videoResult(url, request);
    }
    if (record.successFlag === 2 || record.successFlag === 3) {
      throw new GenerationError(
        this.name,
        "api_error",
        record.errorMessage ||
          record.errorCode ||
          `Kie Veo task ${taskId} failed.`,
      );
    }
    return undefined;
  }
}

function marketVideoRequest(
  model: string,
  input: Record<string, unknown>,
  dimensions: { width: number; height: number },
  durationSeconds: number,
): KieVideoRequest {
  return {
    kind: "market",
    model,
    input,
    payload: { model, input },
    durationSeconds,
    ...dimensions,
  };
}

function resolveKieVideoModel(modelId: string): KieVideoModelId {
  if (KIE_VIDEO_MODELS.some((model) => model.id === modelId)) {
    return modelId as KieVideoModelId;
  }
  throw new GenerationError(
    "kie-video",
    "model_not_found",
    `Unsupported Kie video model: ${modelId}`,
  );
}

function getDefaultDuration(model: KieVideoModelId) {
  if (model === "kie/grok-imagine") return 6;
  if (model === "kie/veo-3.1") return 8;
  return 5;
}

function getVideoDimensions(
  resolution: VideoGenerateParams["resolution"],
  aspectRatio: string,
) {
  const base =
    resolution === "1080p"
      ? { width: 1920, height: 1080 }
      : resolution === "480p"
        ? { width: 854, height: 480 }
        : { width: 1280, height: 720 };
  if (aspectRatio === "9:16") return { width: base.height, height: base.width };
  if (aspectRatio === "1:1") return { width: base.height, height: base.height };
  return base;
}

function requireSingleInputImage(model: string, inputImages: string[]): string {
  const [image] = inputImages;
  if (inputImages.length === 1 && image) return image;
  if (inputImages.length === 0) {
    throw new GenerationError(
      "kie-video",
      "invalid_input",
      `${model} requires one image input.`,
    );
  }
  throw new GenerationError(
    "kie-video",
    "invalid_input",
    `${model} supports exactly one image input.`,
  );
}

function requireAtMostInputImages(
  model: string,
  inputImages: string[],
  maxImages: number,
): string[] {
  if (inputImages.length <= maxImages) return inputImages;
  throw new GenerationError(
    "kie-video",
    "invalid_input",
    `${model} supports at most ${maxImages} image inputs.`,
  );
}

function getMarketVideoTaskPayload(request: KieVideoRequest) {
  if (request.kind !== "market" || !request.model || !request.input) {
    throw new GenerationError(
      "kie-video",
      "invalid_input",
      "Expected a Kie Market video request.",
    );
  }
  return {
    model: request.model,
    input: request.input,
  };
}

function getKieVideoRemoteMetadata(
  params: VideoGenerateParams,
): KieVideoRemoteMetadata {
  return params.metadata ?? {};
}

function videoResult(url: string, request: KieVideoRequest): GeneratedVideo {
  return {
    url,
    mimeType: "video/mp4",
    width: request.width,
    height: request.height,
    durationSeconds: request.durationSeconds,
  };
}

async function prepareKieInputImages(
  client: KieClient,
  inputImages: string[] | undefined,
) {
  if (!inputImages?.length) return inputImages;
  return Promise.all(
    inputImages.map(async (image, index) => {
      if (isKieReachableUrl(image)) return image;
      const { data, mimeType } = await fetchAsBase64("kie-video", image);
      const extension = mimeType.includes("jpeg")
        ? "jpg"
        : (mimeType.split("/")[1] ?? "png");
      return client.uploadBase64File({
        base64Data: `data:${mimeType};base64,${data}`,
        fileName: `aimc-kie-video-${Date.now()}-${index}.${extension}`,
      });
    }),
  );
}

function isKieReachableUrl(value: string) {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return false;
  }
  try {
    const url = new URL(value);
    return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
