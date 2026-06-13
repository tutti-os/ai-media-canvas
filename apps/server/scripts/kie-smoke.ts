import { writeFileSync } from "node:fs";

import {
  KieClient,
  type KieMarketTaskRecord,
  getFirstKieMarketResultUrl,
  getFirstKieRunwayResultUrl,
  getFirstKieVeoResultUrl,
} from "../src/generation/providers/kie-client.js";
import { resolveKieImageRequest } from "../src/generation/providers/kie-image.js";
import { resolveKieVideoRequest } from "../src/generation/providers/kie-video.js";
import type {
  ImageGenerateParams,
  VideoGenerateParams,
} from "../src/generation/types.js";

const IMAGE_REFERENCE_URL =
  "https://file.aiquickdraw.com/custom-page/akr/section-images/1756223420389w8xa2jfe.png";
const VIDEO_REFERENCE_URL =
  "https://file.aiquickdraw.com/custom-page/akr/section-images/17585210783150ispzfo7.png";

type SmokeCase =
  | {
      id: string;
      kind: "image";
      params: ImageGenerateParams;
    }
  | {
      id: string;
      kind: "video";
      params: VideoGenerateParams;
    };

type SmokeResult = {
  id: string;
  kind: SmokeCase["kind"];
  model: string;
  taskId: string;
  state: string;
  url: string;
};

const imageCases: SmokeCase[] = [
  imageCase("image-z-image-t2i", "kie/z-image"),
  imageCase("image-seedream-5-lite-t2i", "kie/seedream-5-lite"),
  imageCase("image-seedream-5-lite-i2i", "kie/seedream-5-lite", [
    IMAGE_REFERENCE_URL,
  ]),
  imageCase("image-gpt-image-2-t2i", "kie/gpt-image-2"),
  imageCase("image-gpt-image-2-i2i", "kie/gpt-image-2", [IMAGE_REFERENCE_URL]),
  imageCase("image-qwen2-t2i", "kie/qwen2"),
  imageCase("image-qwen2-i2i", "kie/qwen2", [IMAGE_REFERENCE_URL]),
  imageCase("image-nano-banana-pro-t2i", "kie/nano-banana-pro"),
  imageCase("image-nano-banana-pro-i2i", "kie/nano-banana-pro", [
    IMAGE_REFERENCE_URL,
  ]),
  imageCase("image-nano-banana-t2i", "kie/nano-banana"),
  imageCase("image-nano-banana-i2i", "kie/nano-banana", [IMAGE_REFERENCE_URL]),
];

const videoCases: SmokeCase[] = [
  videoCase("video-runway-t2v", "kie/runway"),
  videoCase("video-runway-i2v", "kie/runway", [VIDEO_REFERENCE_URL]),
  videoCase("video-grok-imagine-t2v", "kie/grok-imagine", [], {
    duration: 6,
    resolution: "480p",
  }),
  videoCase(
    "video-grok-imagine-i2v",
    "kie/grok-imagine",
    [VIDEO_REFERENCE_URL],
    {
      duration: 6,
      resolution: "480p",
    },
  ),
  videoCase("video-hailuo-t2v", "kie/hailuo"),
  videoCase("video-hailuo-i2v", "kie/hailuo", [VIDEO_REFERENCE_URL]),
  videoCase("video-veo-3-1-t2v", "kie/veo-3.1", [], {
    duration: 8,
    resolution: "1080p",
  }),
  videoCase("video-veo-3-1-i2v", "kie/veo-3.1", [VIDEO_REFERENCE_URL], {
    duration: 8,
    resolution: "1080p",
  }),
  videoCase("video-kling-2-6-t2v", "kie/kling-2.6"),
  videoCase("video-kling-2-6-i2v", "kie/kling-2.6", [VIDEO_REFERENCE_URL]),
  videoCase("video-seedance-2-t2v", "kie/seedance-2"),
  videoCase("video-seedance-2-i2v", "kie/seedance-2", [VIDEO_REFERENCE_URL]),
  videoCase("video-happyhorse-1-t2v", "kie/happyhorse-1"),
  videoCase("video-happyhorse-1-i2v", "kie/happyhorse-1", [
    VIDEO_REFERENCE_URL,
  ]),
];

const apiKey = process.env.AIMC_KIE_API_KEY ?? process.env.KIE_API_KEY;
if (!apiKey) {
  throw new Error(
    "Set AIMC_KIE_API_KEY or KIE_API_KEY before running this smoke.",
  );
}

const apiBase = process.env.AIMC_KIE_BASE_URL ?? process.env.KIE_BASE_URL;
const client = new KieClient(apiKey, {
  ...(apiBase ? { apiBase } : {}),
});

const filter = process.env.KIE_SMOKE_CASES?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const cases = [...imageCases, ...videoCases].filter(
  (testCase) => !filter?.length || filter.includes(testCase.id),
);
const pollIntervalMs = Number(process.env.KIE_SMOKE_POLL_INTERVAL_MS ?? 10_000);
const timeoutMs = Number(process.env.KIE_SMOKE_TIMEOUT_MS ?? 30 * 60_000);
const reportPath = process.env.KIE_SMOKE_REPORT_PATH;

console.log(`Running ${cases.length} Kie smoke case(s).`);

const results: SmokeResult[] = [];
const failures: Array<{ id: string; message: string }> = [];

for (const testCase of cases) {
  try {
    const result =
      testCase.kind === "image"
        ? await runImageCase(testCase)
        : await runVideoCase(testCase);
    results.push(result);
    console.log(
      `[PASS] ${result.id} task=${result.taskId} state=${result.state} url=${result.url}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: testCase.id, message });
    console.error(`[FAIL] ${testCase.id} ${message}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  results,
  failures,
};

if (reportPath) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}

async function runImageCase(testCase: Extract<SmokeCase, { kind: "image" }>) {
  const request = resolveKieImageRequest(testCase.params);
  console.log(`[START] ${testCase.id} model=${request.model}`);
  const taskId = await client.createMarketTask({
    model: request.model,
    input: request.input,
  });
  const record = await pollMarketTask(taskId);
  const url = getFirstKieMarketResultUrl(record);
  if (!url) throw new Error(`task ${taskId} completed without a result URL`);
  return {
    id: testCase.id,
    kind: testCase.kind,
    model: request.model,
    taskId,
    state: record.state ?? "success",
    url,
  };
}

async function runVideoCase(testCase: Extract<SmokeCase, { kind: "video" }>) {
  const request = resolveKieVideoRequest(testCase.params);
  console.log(
    `[START] ${testCase.id} kind=${request.kind} model=${request.model ?? "dedicated"}`,
  );
  const taskId =
    request.kind === "runway"
      ? await client.createRunwayTask(request.payload)
      : request.kind === "veo"
        ? await client.createVeoTask(request.payload)
        : await client.createMarketTask(getMarketPayload(request));

  if (request.kind === "runway") {
    const record = await pollRunwayTask(taskId);
    const url = getFirstKieRunwayResultUrl(record);
    if (!url) throw new Error(`task ${taskId} completed without a result URL`);
    return {
      id: testCase.id,
      kind: testCase.kind,
      model: "runway",
      taskId,
      state: record.state ?? "success",
      url,
    };
  }

  if (request.kind === "veo") {
    const record = await pollVeoTask(taskId);
    const url = getFirstKieVeoResultUrl(record);
    if (!url) throw new Error(`task ${taskId} completed without a result URL`);
    return {
      id: testCase.id,
      kind: testCase.kind,
      model: "veo3_fast",
      taskId,
      state: String(record.successFlag ?? 1),
      url,
    };
  }

  const record = await pollMarketTask(taskId);
  const url = getFirstKieMarketResultUrl(record);
  if (!url) throw new Error(`task ${taskId} completed without a result URL`);
  return {
    id: testCase.id,
    kind: testCase.kind,
    model: getMarketPayload(request).model,
    taskId,
    state: record.state ?? "success",
    url,
  };
}

async function pollMarketTask(taskId: string): Promise<KieMarketTaskRecord> {
  const startedAt = Date.now();
  for (;;) {
    const record = await client.queryMarketTask(taskId);
    const state = record.state?.toLowerCase();
    if (state === "success") return record;
    if (state === "fail") {
      throw new Error(
        record.failMsg || record.failCode || `task ${taskId} failed`,
      );
    }
    assertNotTimedOut(taskId, startedAt);
    await delay(pollIntervalMs);
  }
}

async function pollRunwayTask(taskId: string) {
  const startedAt = Date.now();
  for (;;) {
    const record = await client.queryRunwayTask(taskId);
    const state = record.state?.toLowerCase();
    if (state === "success") return record;
    if (state === "fail") {
      throw new Error(
        record.failMsg || record.failCode || `task ${taskId} failed`,
      );
    }
    assertNotTimedOut(taskId, startedAt);
    await delay(pollIntervalMs);
  }
}

async function pollVeoTask(taskId: string) {
  const startedAt = Date.now();
  for (;;) {
    const record = await client.queryVeoTask(taskId);
    if (record.successFlag === 1) return record;
    if (record.successFlag === 2 || record.successFlag === 3) {
      throw new Error(
        record.errorMessage || record.errorCode || `task ${taskId} failed`,
      );
    }
    assertNotTimedOut(taskId, startedAt);
    await delay(pollIntervalMs);
  }
}

function imageCase(
  id: string,
  model: ImageGenerateParams["model"],
  inputImages: string[] = [],
): SmokeCase {
  return {
    id,
    kind: "image",
    params: {
      model,
      prompt:
        "A clean product photo of a red ceramic mug on a light wooden desk, studio lighting.",
      aspectRatio: "1:1",
      inputImages,
      quality: "standard",
      outputFormat: "png",
    },
  };
}

function videoCase(
  id: string,
  model: VideoGenerateParams["model"],
  inputImages: string[] = [],
  overrides: Partial<VideoGenerateParams> = {},
): SmokeCase {
  return {
    id,
    kind: "video",
    params: {
      model,
      prompt:
        "A calm cinematic shot of a red ceramic mug on a desk, soft morning light, slow camera push.",
      aspectRatio: "16:9",
      duration: 5,
      resolution: "720p",
      inputImages,
      enableAudio: false,
      ...overrides,
    },
  };
}

function getMarketPayload(request: ReturnType<typeof resolveKieVideoRequest>) {
  if (request.kind !== "market" || !request.model || !request.input) {
    throw new Error("Expected a Kie Market video request.");
  }
  return {
    model: request.model,
    input: request.input,
  };
}

function assertNotTimedOut(taskId: string, startedAt: number) {
  if (Date.now() - startedAt >= timeoutMs) {
    throw new Error(
      `task ${taskId} timed out after ${Math.round(timeoutMs / 1_000)}s`,
    );
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
