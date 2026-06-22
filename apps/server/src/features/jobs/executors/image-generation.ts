import type { BackgroundJob, ImageGenerationPayload } from "@aimc/shared";

import type { ServerEnv } from "../../../config/env.js";
import { evaluateCodexImagegenDelegation } from "../../../generation/codex-imagegen-delegation.js";
import { FALLBACK_IMAGE_MODEL } from "../../../generation/default-models.js";
import { loadGeneratedAsset } from "../../../generation/generated-asset.js";
import { generateImage } from "../../../generation/image-generation.js";
import { validateImageGenerationParams } from "../../../generation/model-schemas.js";
import { resolveImageProviderName } from "../../../generation/providers/registry.js";
import { GenerationError } from "../../../generation/utils.js";
import type { LocalStore } from "../../../local/store.js";
import { createLocalUserClient } from "../../../local/user-client.js";
import { completeImageGenerationNode } from "../../canvas/canvas-element-writer.js";
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
  validateImageGenerationParams({
    prompt: payload.prompt,
    model,
    ...(payload.aspect_ratio ? { aspectRatio: payload.aspect_ratio } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
    ...(payload.input_images ? { inputImages: payload.input_images } : {}),
    ...(payload.size ? { size: payload.size } : {}),
    ...(payload.seed !== undefined ? { seed: payload.seed } : {}),
  });
  const provider = resolveImageProviderName(model);
  const delegationDecision = evaluateCodexImagegenDelegation({
    imageProvider: provider,
    setting: "ask",
    consentBudget: payload.codex_imagegen_delegation_allowed ? 1 : 0,
    ...(payload.caller_provider
      ? { callerProvider: payload.caller_provider }
      : {}),
  });
  if (delegationDecision.status === "blocked") {
    throw new GenerationError(
      provider,
      delegationDecision.reason === "needs_confirmation"
        ? "codex_imagegen_confirmation_required"
        : "codex_imagegen_disabled_by_user",
      delegationDecision.reason === "needs_confirmation"
        ? "Codex image generation requires user confirmation before a non-Codex agent can use it."
        : "Codex image generation is disabled for non-Codex agents in workspace settings.",
    );
  }
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
  if (job.canvas_id) {
    try {
      await completeImageGenerationNode(createLocalUserClient(store), {
        canvasId: job.canvas_id,
        jobId: job.id,
        assetId: stored.asset.id,
        signedUrl: stored.url,
        objectPath: stored.asset.objectPath,
        mimeType: stored.asset.mimeType ?? mimeType,
        width: generated.width,
        height: generated.height,
        title: payload.prompt.slice(0, 60),
      });
    } catch (error) {
      console.warn("[image-generation] canvas image insert failed:", error);
    }
  }
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
