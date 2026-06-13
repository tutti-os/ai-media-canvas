import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const IMAGE_REFERENCE_URL =
  "https://file.aiquickdraw.com/custom-page/akr/section-images/1756223420389w8xa2jfe.png";
const VIDEO_REFERENCE_URL =
  "https://file.aiquickdraw.com/custom-page/akr/section-images/17585210783150ispzfo7.png";

type SmokeCase =
  | {
      id: string;
      kind: "image";
      endpoint: "/api/agent/generate-image";
      body: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "video";
      endpoint: "/api/agent/generate-video";
      body: Record<string, unknown>;
    };

type SmokeResult = {
  id: string;
  kind: SmokeCase["kind"];
  model: string;
  url: string;
  assetId?: string;
  mimeType?: string;
  width?: unknown;
  height?: unknown;
  durationSeconds?: unknown;
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
  }),
  videoCase(
    "video-grok-imagine-i2v",
    "kie/grok-imagine",
    [VIDEO_REFERENCE_URL],
    {
      duration: 6,
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

const apiBase = trimTrailingSlash(
  process.env.AIMC_API_BASE_URL ?? "http://127.0.0.1:3001",
);
const filter = process.env.AIMC_KIE_API_SMOKE_CASES?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const cases = [...imageCases, ...videoCases].filter(
  (testCase) => !filter?.length || filter.includes(testCase.id),
);
const reportPath = process.env.AIMC_KIE_API_SMOKE_REPORT_PATH;

console.log(`Running ${cases.length} AIMC Kie API smoke case(s).`);
await assertModelsRegistered();

const results: SmokeResult[] = [];
const failures: Array<{ id: string; message: string }> = [];

for (const testCase of cases) {
  try {
    console.log(
      `[START] ${testCase.id} endpoint=${testCase.endpoint} model=${String(testCase.body.model)}`,
    );
    const response = await postJson(testCase.endpoint, testCase.body);
    const url = expectString(response.url, "url");
    const result: SmokeResult = {
      id: testCase.id,
      kind: testCase.kind,
      model: String(testCase.body.model),
      url,
      width: response.width,
      height: response.height,
      ...optionalStringProperty("assetId", response.assetId),
      ...optionalStringProperty("mimeType", response.mimeType),
      ...optionalProperty("durationSeconds", response.durationSeconds),
    };
    results.push(result);
    console.log(
      `[PASS] ${result.id} asset=${result.assetId ?? "n/a"} url=${result.url}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: testCase.id, message });
    console.error(`[FAIL] ${testCase.id} ${message}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  apiBase,
  results,
  failures,
};

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}

async function assertModelsRegistered() {
  const [imageModels, videoModels] = await Promise.all([
    getModelIds("/api/image-models"),
    getModelIds("/api/video-models"),
  ]);
  const missingImageModels = uniqueModels(imageCases).filter(
    (model) => !imageModels.includes(model),
  );
  const missingVideoModels = uniqueModels(videoCases).filter(
    (model) => !videoModels.includes(model),
  );
  if (missingImageModels.length > 0 || missingVideoModels.length > 0) {
    throw new Error(
      [
        missingImageModels.length
          ? `missing image models: ${missingImageModels.join(", ")}`
          : "",
        missingVideoModels.length
          ? `missing video models: ${missingVideoModels.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  console.log(
    `[MODELS] image=${uniqueModels(imageCases).length} video=${uniqueModels(videoCases).length}`,
  );
}

async function getModelIds(path: "/api/image-models" | "/api/video-models") {
  const response = await getJson(path);
  if (!Array.isArray(response.models)) {
    throw new Error(`${path} did not return a models array`);
  }
  return response.models
    .map((model) =>
      model && typeof model === "object" && "id" in model
        ? String(model.id)
        : "",
    )
    .filter(Boolean);
}

function imageCase(
  id: string,
  model: string,
  inputImages: string[] = [],
): SmokeCase {
  return {
    id,
    kind: "image",
    endpoint: "/api/agent/generate-image",
    body: {
      model,
      prompt:
        "A clean product photo of a red ceramic mug on a light wooden desk, studio lighting.",
      aspectRatio: "1:1",
      quality: "standard",
      ...(inputImages.length ? { inputImages } : {}),
    },
  };
}

function videoCase(
  id: string,
  model: string,
  inputImages: string[] = [],
  overrides: Record<string, unknown> = {},
): SmokeCase {
  return {
    id,
    kind: "video",
    endpoint: "/api/agent/generate-video",
    body: {
      model,
      prompt:
        "A calm cinematic shot of a red ceramic mug on a desk, soft morning light, slow camera push.",
      aspectRatio: "16:9",
      duration: 5,
      resolution: "720p",
      ...(inputImages.length ? { inputImages } : {}),
      enableAudio: false,
      ...overrides,
    },
  };
}

async function getJson(path: string) {
  const response = await fetch(`${apiBase}${path}`);
  return parseJsonResponse(response, path);
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(response, path);
}

async function parseJsonResponse(response: Response, path: string) {
  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(
      `${path} returned non-JSON response: ${text.slice(0, 500)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `${path} returned ${response.status}: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function uniqueModels(testCases: SmokeCase[]) {
  return [...new Set(testCases.map((testCase) => String(testCase.body.model)))];
}

function expectString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty ${label}`);
  }
  return value;
}

function optionalStringProperty<T extends string>(key: T, value: unknown) {
  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}

function optionalProperty<T extends string>(key: T, value: unknown) {
  return value !== undefined ? { [key]: value } : {};
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
