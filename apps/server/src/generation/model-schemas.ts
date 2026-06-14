import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import type { AimcInputMode, GenerationModelSchema } from "@aimc/shared";

import {
  getImageGenerationModelSchema,
  getVideoGenerationModelSchema,
} from "./model-schema-catalog.js";
import {
  getAvailableImageModels,
  getAvailableVideoModels,
  resolveImageProviderName,
  resolveVideoProviderName,
} from "./providers/registry.js";
import type { ImageGenerateParams, VideoGenerateParams } from "./types.js";
import { GenerationError } from "./utils.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const compiledSchemas = new WeakMap<GenerationModelSchema, ValidateFunction>();

export function validateImageGenerationParams(
  params: ImageGenerateParams,
): ImageGenerateParams {
  const model = getAvailableImageModels().find(
    (item) => item.id === params.model,
  );
  const provider = resolveImageProviderName(params.model);
  const schema =
    model?.schema ?? (model ? getImageGenerationModelSchema(model) : undefined);
  if (!schema) return params;

  assertSchemaValid(
    provider,
    params.model,
    schema,
    params as unknown as Record<string, unknown>,
  );
  return params;
}

export function validateVideoGenerationParams(
  params: VideoGenerateParams,
): VideoGenerateParams {
  const model = getAvailableVideoModels().find(
    (item) => item.id === params.model,
  );
  const provider = resolveVideoProviderName(params.model);
  const schema =
    model?.schema ?? (model ? getVideoGenerationModelSchema(model) : undefined);
  if (!schema) return params;

  assertKieVideoSpecialCases(provider, params);
  assertSchemaValid(
    provider,
    params.model,
    schema,
    params as unknown as Record<string, unknown>,
  );
  assertVideoInputModeValid(provider, params.model, schema, params);
  return params;
}

function assertSchemaValid(
  provider: string,
  modelId: string,
  schema: GenerationModelSchema,
  params: Record<string, unknown>,
) {
  const validate = compile(schema);
  if (validate(params)) return;
  throw new GenerationError(
    provider,
    "invalid_input",
    `${modelId}: ${formatAjvErrors(validate.errors ?? [])}`,
  );
}

function compile(schema: GenerationModelSchema) {
  const cached = compiledSchemas.get(schema);
  if (cached) return cached;
  const validate = ajv.compile(schema);
  compiledSchemas.set(schema, validate);
  return validate;
}

function assertVideoInputModeValid(
  provider: string,
  modelId: string,
  schema: GenerationModelSchema,
  params: VideoGenerateParams,
) {
  const modes = schema["x-aimc-ui"].inputModes ?? [];
  if (modes.length === 0) return;

  const selected = resolveSelectedInputMode(params);
  const supported = modes.find((mode) => mode.id === selected);
  if (!supported) {
    throw new GenerationError(
      provider,
      "invalid_input",
      `${modelId} does not support ${selected} video input mode.`,
    );
  }

  const imageCount = params.inputImages?.length ?? 0;
  assertImageCount(provider, modelId, supported, imageCount);
}

function resolveSelectedInputMode(
  params: VideoGenerateParams,
): AimcInputMode["id"] {
  if (params.inputVideo) return "video";
  if (params.videoMode === "keyframes") return "keyframes";
  if (params.videoMode === "reference") return "reference";
  if (params.videoMode === "multivideo") return "multivideo";
  const imageCount = params.inputImages?.length ?? 0;
  if (imageCount === 0) return "text";
  return imageCount > 1 ? "multivideo" : "image";
}

function assertImageCount(
  provider: string,
  modelId: string,
  mode: AimcInputMode,
  imageCount: number,
) {
  if (mode.minImages !== undefined && imageCount < mode.minImages) {
    throw new GenerationError(
      provider,
      "invalid_input",
      `${modelId} ${mode.id} mode requires at least ${mode.minImages} image input(s).`,
    );
  }
  if (mode.maxImages !== undefined && imageCount > mode.maxImages) {
    throw new GenerationError(
      provider,
      "invalid_input",
      `${modelId} ${mode.id} mode supports at most ${mode.maxImages} image input(s).`,
    );
  }
}

function assertKieVideoSpecialCases(
  provider: string,
  params: VideoGenerateParams,
) {
  if (
    params.model === "kie/runway" &&
    params.duration === 10 &&
    params.resolution === "1080p"
  ) {
    throw new GenerationError(
      provider,
      "invalid_input",
      "Runway does not support 10-second videos at 1080p.",
    );
  }
  if (
    params.model === "kie/veo-3.1" &&
    params.videoMode === "reference" &&
    (params.inputImages?.length ?? 0) > 1
  ) {
    throw new GenerationError(
      provider,
      "invalid_input",
      "Veo 3.1 reference mode supports exactly one reference image.",
    );
  }
}

function formatAjvErrors(errors: ErrorObject[]) {
  if (errors.length === 0) return "Invalid generation parameters.";
  return errors
    .map((error) => {
      const path = error.instancePath.replace(/^\//, "").replaceAll("/", ".");
      const field = path || error.params.missingProperty || "payload";
      const allowed = getAllowedValues(error);
      return allowed
        ? `${field} ${error.message ?? "is invalid"} (${allowed})`
        : `${field} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
}

function getAllowedValues(error: ErrorObject) {
  if (
    "allowedValues" in error.params &&
    Array.isArray(error.params.allowedValues)
  ) {
    return `allowed: ${error.params.allowedValues.join(", ")}`;
  }
  if ("allowedValue" in error.params) {
    return `allowed: ${String(error.params.allowedValue)}`;
  }
  return undefined;
}
