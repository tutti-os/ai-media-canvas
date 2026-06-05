// @credits-system — Agent tool runtime with credit checks before image/video generation
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import {
  createLocalAgentRuntime,
  type LocalAgentProviderPlugin,
  type LocalAgentRuntime,
} from "@nextop-os/agent-acp-kit";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type {
  AgentRuntimeProvider,
  ChatMessage,
  ImageAttachment,
  ImageGenerationPreference,
  MessageMention,
  RuntimeKind,
  RunCancelResponse,
  RunCreateRequest,
  RunCreateResponse,
  StreamEvent,
  VideoGenerationPreference,
} from "@aimc/shared";

import type { ServerEnv } from "../config/env.js";
import { createPipelineLogger } from "../ws/logger.js";
import type { JobService } from "../features/jobs/job-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { AuthenticatedUser, UserDataClient } from "../auth/request.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
// execute 工具由 deepagents 内置提供（LocalShellBackend 作为 sandbox backend）
// 不需要自定义代码执行工具
import type { SubmitImageJobFn } from "./tools/image-generate.js";
import type { SubmitVideoJobFn } from "./tools/video-generate.js";
import type { CreditService } from "../features/credits/credit-service.js";
import { TierGuardError, type TierGuard } from "../features/credits/tier-guard.js";
import { getPlanConfig, type BillingErrorCode, type ImageQualityLevel } from "@aimc/shared";
import { createAgentBackend } from "./backends/index.js";
import {
  type AimcAgentFactory,
  createDefaultModelSpecifier,
  createAimcDeepAgent,
} from "./deep-agent.js";
import { sanitizeErrorForClient } from "../utils/error-sanitizer.js";
import type { WorkspaceSkillEntry } from "./workspace-skills.js";
import { resolveAimcWorkspaceSkills } from "./local-agent-host/skills.js";
import { buildCanvasSummaryForContext } from "./tools/inspect-canvas.js";
import { insertImageElement, insertVideoElement } from "../features/canvas/canvas-element-writer.js";
import {
  buildAgentImageJobPayload,
  buildAgentVideoJobPayload,
} from "./job-payloads.js";
import type { createLocalToolGatewayService } from "./local-agent-host/tool-gateway.js";
import {
  createRuntimeControlPlane,
  resolveResumeMode,
  type RuntimeTarget,
} from "./run-orchestrator.js";
import { inferAimcRuntimeTarget } from "./run-orchestrator.js";
import { createLocalAgentRuntimeProvider } from "./runtimes/local-agent.js";
import { createServerDeepAgentRuntimeProvider } from "./runtimes/server-deepagent.js";
import type { RuntimeExecutionContext } from "./runtimes/types.js";
import { adaptDeepAgentStream } from "./runtimes/deepagent-events.js";
import { loadNormalizedSessionHistory } from "./runtimes/history.js";
import { createAimcLocalAgentProviderPlugins } from "./local-agent-providers.js";

/**
 * Build the text portion of a user message, appending <input_images> XML
 * tags when attachments are present so the LLM can reference them by assetId.
 */
export function buildUserMessage(
  prompt: string,
  attachments: ImageAttachment[],
  imageGenerationPreference?: ImageGenerationPreference,
  mentions: MessageMention[] = [],
  videoGenerationPreference?: VideoGenerationPreference,
  canvasSummary?: string | null,
): { text: string } {
  const xmlBlocks: string[] = [];

  // Canvas state context (auto-injected, not user-provided)
  if (canvasSummary) {
    xmlBlocks.push(`<canvas_state>\n${canvasSummary}\n</canvas_state>`);
  }

  const inputImagesXml = buildInputImagesXml(attachments);
  if (inputImagesXml) xmlBlocks.push(inputImagesXml);

  const imageGenerationPreferenceXml = buildImageGenerationPreferenceXml(
    imageGenerationPreference,
  );
  if (imageGenerationPreferenceXml) xmlBlocks.push(imageGenerationPreferenceXml);

  const videoGenerationPreferenceXml = buildVideoGenerationPreferenceXml(
    videoGenerationPreference,
  );
  if (videoGenerationPreferenceXml) xmlBlocks.push(videoGenerationPreferenceXml);

  const mentionXmlBlocks = buildMentionXmlBlocks(mentions);
  xmlBlocks.push(...mentionXmlBlocks);

  if (!xmlBlocks.length) return { text: prompt };
  return { text: `${prompt}\n\n${xmlBlocks.join("\n\n")}` };
}

function buildInputImagesXml(attachments: ImageAttachment[]): string | null {
  if (attachments.length === 0) return null;

  const imageXml = attachments
    .map((attachment, i) => {
      const nameAttr = attachment.name
        ? ` name="${escapeXmlAttribute(attachment.name)}"`
        : "";
      return `<image index="${i + 1}" asset_id="${escapeXmlAttribute(attachment.assetId)}" mime_type="${escapeXmlAttribute(attachment.mimeType)}"${nameAttr} />`;
    })
    .join("\n  ");

  return `<input_images count="${attachments.length}">\n  ${imageXml}\n</input_images>`;
}

function buildImageGenerationPreferenceXml(
  imageGenerationPreference?: ImageGenerationPreference,
): string | null {
  if (
    imageGenerationPreference?.mode !== "manual" ||
    imageGenerationPreference.models.length === 0
  ) {
    return null;
  }

  const modelXml = imageGenerationPreference.models
    .map(
      (model, i) =>
        `<preferred_model index="${i + 1}" id="${escapeXmlAttribute(model)}" />`,
    )
    .join("\n  ");

  return `<human_image_generation_preference mode="manual" count="${imageGenerationPreference.models.length}">\n  ${modelXml}\n</human_image_generation_preference>`;
}

function buildVideoGenerationPreferenceXml(
  videoGenerationPreference?: VideoGenerationPreference,
): string | null {
  if (
    videoGenerationPreference?.mode !== "manual" ||
    videoGenerationPreference.models.length === 0
  ) {
    return null;
  }

  const modelXml = videoGenerationPreference.models
    .map(
      (model, i) =>
        `<preferred_model index="${i + 1}" id="${escapeXmlAttribute(model)}" />`,
    )
    .join("\n  ");

  return `<human_video_generation_preference mode="manual" count="${videoGenerationPreference.models.length}">\n  ${modelXml}\n</human_video_generation_preference>`;
}

function buildMentionXmlBlocks(mentions: MessageMention[]): string[] {
  const xmlBlocks: string[] = [];

  const mentionedModels = mentions.filter(
    (mention): mention is Extract<MessageMention, { mentionType: "image-model" }> =>
      mention.mentionType === "image-model",
  );
  if (mentionedModels.length > 0) {
    const modelXml = mentionedModels
      .map(
        (mention, i) =>
          `<model index="${i + 1}" id="${escapeXmlAttribute(mention.id)}" display_name="${escapeXmlAttribute(mention.label)}" />`,
      )
      .join("\n  ");

    xmlBlocks.push(
      `<human_image_model_mentions count="${mentionedModels.length}">\n  ${modelXml}\n</human_image_model_mentions>`,
    );
  }

  const mentionedBrandKitAssets = mentions.filter(
    (
      mention,
    ): mention is Extract<MessageMention, { mentionType: "brand-kit-asset" }> =>
      mention.mentionType === "brand-kit-asset",
  );
  if (mentionedBrandKitAssets.length > 0) {
    const assetXml = mentionedBrandKitAssets
      .map((mention, i) => {
        const textContentAttr =
          mention.textContent != null
            ? ` text_content="${escapeXmlAttribute(mention.textContent)}"`
            : "";
        const fileUrlAttr =
          mention.fileUrl != null
            ? ` file_url="${escapeXmlAttribute(mention.fileUrl)}"`
            : "";
        return `<brand_kit_asset index="${i + 1}" id="${escapeXmlAttribute(mention.id)}" type="${escapeXmlAttribute(mention.assetType)}" display_name="${escapeXmlAttribute(mention.label)}"${textContentAttr}${fileUrlAttr} />`;
      })
      .join("\n  ");

    xmlBlocks.push(
      `<human_brand_kit_mentions count="${mentionedBrandKitAssets.length}">\n  ${assetXml}\n</human_brand_kit_mentions>`,
    );
  }

  // Skill mentions — tell the agent to read and follow the mentioned skill
  const mentionedSkills = mentions.filter(
    (
      mention,
    ): mention is Extract<MessageMention, { mentionType: "skill" }> =>
      mention.mentionType === "skill",
  );
  if (mentionedSkills.length > 0) {
    const skillXml = mentionedSkills
      .map(
        (mention, i) =>
          `<skill index="${i + 1}" id="${escapeXmlAttribute(mention.id)}" name="${escapeXmlAttribute(mention.label)}" slug="${escapeXmlAttribute(mention.slug)}">\nThe user explicitly requested this skill. Read \`/workspace-skills/${mention.slug}/SKILL.md\` for full instructions and follow them.\n</skill>`,
      )
      .join("\n  ");
    xmlBlocks.push(
      `<human_skill_mentions count="${mentionedSkills.length}">\n  ${skillXml}\n</human_skill_mentions>`,
    );
  }

  return xmlBlocks;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Build a lookup map from assetId to base64 data URI.
 * Stored in configurable so tools can resolve assetId references.
 */
export function buildAttachmentDataMap(
  downloaded: Array<{ assetId: string; mimeType: string; base64: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of downloaded) {
    map[d.assetId] = `data:${d.mimeType};base64,${d.base64}`;
  }
  return map;
}

async function buildSessionHistoryMessages(
  sessionId: string,
  currentPrompt: string,
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>,
): Promise<Array<HumanMessage | AIMessage>> {
  const history = await loadNormalizedSessionHistory({
    currentPrompt,
    ...(loadSessionMessages ? { loadSessionMessages } : {}),
    onError(error) {
      console.warn(
        "[runtime] Failed to load local chat history:",
        error instanceof Error ? error.message : error,
      );
    },
    sessionId,
  });

  return history.map((message) =>
    message.role === "assistant"
      ? new AIMessage(message.content)
      : new HumanMessage(message.content),
  );
}

type RuntimeRunStatus =
  | "accepted"
  | "canceled"
  | "completed"
  | "failed"
  | "running";

type RuntimeRunRecord = RunCreateRequest & {
  accessToken?: string;
  assistantMessageId?: string;
  connectionId?: string;
  consumed: boolean;
  controller: AbortController;
  envOverride?: ServerEnv;
  modelOverride?: string;
  resumeContext?: {
    mode: "provider-local" | "handoff" | "fresh";
    previousRunId?: string;
    previousRuntimeKind?: RuntimeKind | null;
    previousRuntimeProvider?: AgentRuntimeProvider | null;
    providerSessionId?: string;
    resumeToken?: string;
  };
  runId: string;
  status: RuntimeRunStatus;
  threadId?: string;
  userId?: string;
};

type CreateAgentRuntimeOptions = {
  agentFactory?: AimcAgentFactory;
  agentRunStore?: {
    createRun(input: {
      assistantMessageId?: string;
      canvasId?: string;
      model?: string;
      previousRunId?: string;
      resumeMode?: "provider-local" | "handoff" | "fresh";
      runtimeKind?: RuntimeKind;
      runtimeProvider?: AgentRuntimeProvider;
      runId: string;
      sessionId: string;
      threadId?: string;
    }): void;
    updateRun(input: {
      assistantMessageId?: string;
      errorCode?: string;
      errorMessage?: string;
      providerSessionId?: string;
      runId: string;
      resumeToken?: string;
      runtimeKind?: RuntimeKind;
      runtimeProvider?: AgentRuntimeProvider;
      status: RuntimeRunStatus;
    }): void;
    getRun?(runId: string):
      | {
          id: string;
          previous_run_id?: string | null;
          provider_session_id?: string | null;
          resume_mode?: "provider-local" | "handoff" | "fresh" | null;
          resume_token?: string | null;
          runtime_kind?: RuntimeKind | null;
          runtime_provider?: AgentRuntimeProvider | null;
          session_id?: string | null;
          status?: RuntimeRunStatus;
        }
      | undefined;
  };
  connectionManager?: ConnectionManager;
  publishCanvasSyncEvent?: (input: {
    canvasId: string;
    event: Extract<StreamEvent, { type: "canvas.sync" }>;
    runId: string;
  }) => { eventId?: string; seq?: number } | undefined;
  createUserClient?: (accessToken: string) => unknown;
  creditService?: CreditService;
  env: ServerEnv;
  eventDelayMs?: number;
  jobService?: JobService;
  localAgentProviderPlugins?: LocalAgentProviderPlugin<
    "local-agent",
    AgentRuntimeProvider
  >[];
  localAgentRuntime?: Pick<
    LocalAgentRuntime<"local-agent", AgentRuntimeProvider>,
    "run"
  >;
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>;
  model?: BaseLanguageModel | string;
  now?: () => string;
  runIdFactory?: () => string;
  tierGuard?: TierGuard;
  toolGateway?: ReturnType<typeof createLocalToolGatewayService>;
  toolGatewayBaseUrl?: string;
  viewerService?: ViewerService;
};

export type AgentRunService = ReturnType<typeof createAgentRunService>;

export function createAgentRunService(options: CreateAgentRuntimeOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  const runs = new Map<string, RuntimeRunRecord>();
  const runIdFactory =
    options.runIdFactory ??
    (() => randomUUID());

  const resolvedAgentFactory: AimcAgentFactory =
    options.agentFactory ??
    ((agentOptions) =>
      createAimcDeepAgent({
        ...agentOptions,
        ...(options.createUserClient
          ? { createUserClient: options.createUserClient }
          : {}),
      }));

  // ── Billing error helper: push WS event + abort run ──────────
  function pushBillingErrorAndAbort(
    run: { runId: string; conversationId: string; controller: AbortController },
    canvasId: string | undefined,
    opts: { connectionManager?: ConnectionManager },
    code: BillingErrorCode,
    message: string,
    extra?: {
      currentBalance?: number;
      requiredAmount?: number;
      plan?: string;
      dailyClaimed?: boolean;
    },
  ): void {
    const canvasTarget = canvasId ?? run.conversationId;
    if (!opts.connectionManager || !canvasTarget) {
      console.warn(`[billing] pushBillingErrorAndAbort: no connectionManager or canvasTarget, billing.error (${code}) not sent to client`);
    } else {
      opts.connectionManager.pushToCanvas(canvasTarget, {
        type: "billing.error",
        runId: run.runId,
        timestamp: new Date().toISOString(),
        code,
        message,
        ...extra,
      });
    }
    if (!run.controller.signal.aborted) {
      run.controller.abort();
    }
  }

  async function loadCanvasSummaryForRuntime(context: RuntimeExecutionContext) {
    const { run } = context;
    if (!run.canvasId || !run.accessToken || !options.createUserClient) {
      return null;
    }

    try {
      const canvasClient = options.createUserClient(run.accessToken) as any;
      const { data: canvasData } = await canvasClient
        .from("canvases")
        .select("content")
        .eq("id", run.canvasId)
        .single();
      if (!canvasData?.content?.elements) {
        return null;
      }
      return buildCanvasSummaryForContext(
        canvasData.content.elements as Array<Record<string, unknown>>,
      );
    } catch {
      return null;
    }
  }

  const localAgentTrusted = options.env.trustedLocalAgentMode !== false;
  const localAgentProviderPlugins =
    options.localAgentProviderPlugins ?? createAimcLocalAgentProviderPlugins();
  const localAgentRuntime =
    localAgentTrusted && options.toolGateway && options.toolGatewayBaseUrl
      ? options.localAgentRuntime ??
        createLocalAgentRuntime({
          providers: localAgentProviderPlugins,
        })
      : null;
  const runtimeProviders = [
    ...(localAgentRuntime && options.toolGateway && options.toolGatewayBaseUrl
      ? localAgentProviderPlugins.map((providerPlugin) =>
          createLocalAgentRuntimeProvider(
            {
              buildAttachmentDataMap,
              buildUserMessage,
              loadCanvasSummaryForRuntime,
              ...(options.loadSessionMessages
                ? { loadSessionMessages: options.loadSessionMessages }
                : {}),
              localAgentRuntime,
              now,
              recordProviderResumeMetadata(metadata) {
                options.agentRunStore?.updateRun({
                  ...(metadata.providerSessionId
                    ? { providerSessionId: metadata.providerSessionId }
                    : {}),
                  runId: metadata.runId,
                  ...(metadata.resumeToken
                    ? { resumeToken: metadata.resumeToken }
                    : {}),
                  status: runs.get(metadata.runId)?.status ?? "running",
                });
              },
              toolGateway: options.toolGateway!,
              toolGatewayBaseUrl: options.toolGatewayBaseUrl!,
            },
            providerPlugin,
          ),
        )
      : []),
    createServerDeepAgentRuntimeProvider({
      adaptDeepAgentStream,
      buildAttachmentDataMap,
      buildSessionHistoryMessages,
      buildUserMessage,
      ...(options.connectionManager
        ? { connectionManager: options.connectionManager }
        : {}),
      ...(options.createUserClient
        ? { createUserClient: options.createUserClient }
        : {}),
      loadCanvasSummaryForRuntime,
      ...(options.loadSessionMessages
        ? { loadSessionMessages: options.loadSessionMessages }
        : {}),
      now,
      resolvedAgentFactory,
    }),
  ];

  const runtimeControlPlane = createRuntimeControlPlane<RuntimeExecutionContext>(
    runtimeProviders,
    {
      now,
      selectRuntimeKind: inferAimcRuntimeTarget,
    },
  );

  return {
    cancelRun(runId: string): RunCancelResponse | null {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      if (!run.controller.signal.aborted) {
        run.controller.abort();
      }

      run.status = "canceled";
      return {
        runId,
        status: "canceled",
      };
    },

    createRun(
      input: RunCreateRequest,
      runOptions?: {
        accessToken?: string;
        assistantMessageId?: string;
        connectionId?: string;
        env?: ServerEnv;
        model?: string;
        runtimeKind?: RuntimeKind;
        runtimeProvider?: AgentRuntimeProvider;
        threadId?: string;
        userId?: string;
      },
    ): RunCreateResponse {
      const runId = runIdFactory();
      const runInput = input;
      const requestedRuntimeKind = runOptions?.runtimeKind ?? runInput.runtimeKind;
      const requestedRuntimeProvider =
        runOptions?.runtimeProvider ?? runInput.runtimeProvider;
      const resolvedModel =
        runOptions?.model ??
        runInput.model ??
        (typeof options.model === "string" ? options.model : undefined);

      let initialRuntimeTarget: RuntimeTarget | null = null;
      try {
        initialRuntimeTarget = runtimeControlPlane.resolveRuntimeTarget({
          model: resolvedModel,
          requestedRuntimeKind,
          ...(requestedRuntimeProvider
            ? { requestedRuntimeProvider }
            : {}),
        });
      } catch (error) {
        if (requestedRuntimeKind) {
          throw error;
        }
        initialRuntimeTarget = null;
      }
      const persistedRuntimeKind =
        initialRuntimeTarget?.kind ?? requestedRuntimeKind;
      const persistedRuntimeProvider =
        initialRuntimeTarget?.provider ?? requestedRuntimeProvider;
      const previousRun = runInput.resumeFromRunId
        ? options.agentRunStore?.getRun?.(runInput.resumeFromRunId)
        : undefined;

      if (runInput.resumeFromRunId && !previousRun) {
        throw new Error(`Resume source run not found: ${runInput.resumeFromRunId}`);
      }

      const rawResumeMode =
        runInput.resumeMode && runInput.resumeMode !== "auto"
          ? runInput.resumeMode
          : runInput.resumeFromRunId
            ? resolveResumeMode({
                ...(persistedRuntimeKind
                  ? { nextRuntimeKind: persistedRuntimeKind }
                  : {}),
                ...(persistedRuntimeProvider
                  ? { nextRuntimeProvider: persistedRuntimeProvider }
                  : {}),
                previousRuntimeKind: previousRun?.runtime_kind ?? null,
                previousRuntimeProvider: previousRun?.runtime_provider ?? null,
              })
            : undefined;
      const resolvedResumeMode =
        rawResumeMode === "native" ? "provider-local" : rawResumeMode;
      const resumeContext =
        resolvedResumeMode
          ? {
              mode: resolvedResumeMode,
              ...(runInput.resumeFromRunId
                ? { previousRunId: runInput.resumeFromRunId }
                : {}),
              ...(previousRun?.runtime_kind != null
                ? { previousRuntimeKind: previousRun.runtime_kind }
                : {}),
              ...(previousRun?.runtime_provider != null
                ? { previousRuntimeProvider: previousRun.runtime_provider }
                : {}),
              ...(previousRun?.provider_session_id
                ? { providerSessionId: previousRun.provider_session_id }
                : {}),
              ...(previousRun?.resume_token
                ? { resumeToken: previousRun.resume_token }
                : {}),
            }
          : undefined;

      runs.set(runId, {
        ...runInput,
        ...(runOptions?.accessToken ? { accessToken: runOptions.accessToken } : {}),
        ...(runOptions?.assistantMessageId
          ? { assistantMessageId: runOptions.assistantMessageId }
          : {}),
        ...(runOptions?.connectionId ? { connectionId: runOptions.connectionId } : {}),
        consumed: false,
        controller: new AbortController(),
        ...(runOptions?.env ? { envOverride: runOptions.env } : {}),
        ...(resolvedModel ? { modelOverride: resolvedModel } : {}),
        ...(resumeContext ? { resumeContext } : {}),
        ...(persistedRuntimeKind ? { runtimeKind: persistedRuntimeKind } : {}),
        ...(persistedRuntimeProvider
          ? { runtimeProvider: persistedRuntimeProvider }
          : {}),
        ...(runOptions?.threadId ? { threadId: runOptions.threadId } : {}),
        ...(runOptions?.userId ? { userId: runOptions.userId } : {}),
        runId,
        status: "accepted",
      });

      options.agentRunStore?.createRun({
        ...(runOptions?.assistantMessageId
          ? { assistantMessageId: runOptions.assistantMessageId }
          : {}),
        ...(runInput.canvasId ? { canvasId: runInput.canvasId } : {}),
        ...(resolvedModel ? { model: resolvedModel } : {}),
        ...(runInput.resumeFromRunId
          ? { previousRunId: runInput.resumeFromRunId }
          : {}),
        ...(resolvedResumeMode ? { resumeMode: resolvedResumeMode } : {}),
        ...(persistedRuntimeKind ? { runtimeKind: persistedRuntimeKind } : {}),
        ...(persistedRuntimeProvider
          ? { runtimeProvider: persistedRuntimeProvider }
          : {}),
        runId,
        sessionId: runInput.sessionId,
        ...(runOptions?.threadId ? { threadId: runOptions.threadId } : {}),
      });

      return {
        ...(runOptions?.assistantMessageId
          ? { assistantMessageId: runOptions.assistantMessageId }
          : {}),
        conversationId: input.conversationId,
        runId,
        ...(persistedRuntimeKind ? { runtimeKind: persistedRuntimeKind } : {}),
        ...(persistedRuntimeProvider
          ? { runtimeProvider: persistedRuntimeProvider }
          : {}),
        ...(resolvedResumeMode ? { resumeMode: resolvedResumeMode } : {}),
        sessionId: input.sessionId,
        status: "accepted",
      };
    },

    hasRun(runId: string) {
      return runs.has(runId);
    },

    async *streamRun(runId: string): AsyncGenerator<StreamEvent> {
      const run = runs.get(runId);
      if (!run) {
        throw new Error(`Run not found: ${runId}`);
      }

      if (run.consumed) {
        return;
      }

      run.consumed = true;
      run.status = "running";
      options.agentRunStore?.updateRun({
        runId,
        status: "running",
      });

      const rlog = createPipelineLogger("runtime", { runId });

      rlog.lap("local_history_mode");

      // Build submitImageJob / submitVideoJob closures for async jobs via PGMQ
      let submitImageJob: SubmitImageJobFn | undefined;
      let submitVideoJob: SubmitVideoJobFn | undefined;
      if (options.jobService && options.createUserClient && run.accessToken && run.userId) {
        const jobSvc = options.jobService;
        const createClient = options.createUserClient;
        const accessToken = run.accessToken;
        const userId = run.userId;
        const canvasId = run.canvasId;
        const sessionId = run.sessionId;
        const runId = run.runId;

        submitImageJob = async (input) => {
          const jobT0 = Date.now();
          const jobLap = (label: string, extra?: Record<string, unknown>) => {
            console.log(`[submitImageJob] ${label} +${Date.now() - jobT0}ms`, extra ? JSON.stringify(extra) : "");
          };

          // Look up personal workspace directly — the viewer is already
          // bootstrapped from the normal auth flow, so we skip ensureViewer
          // to avoid its strict email validation on the profile schema.
          const client = createClient(accessToken) as UserDataClient;
          const { data: ws } = await client
            .from("workspaces")
            .select("id")
            .eq("type", "personal")
            .limit(1)
            .single();
          if (!ws?.id) throw new Error("No personal workspace found");

          const user: AuthenticatedUser = {
            id: userId,
            accessToken,
            email: "",
            userMetadata: {},
          };

          // ── Tier guard + credit checks (same as HTTP route) ──
          const workspaceId = ws.id;
          let creditsCost = 0;
          if (options.creditService && options.tierGuard) {
            const sub = await options.creditService.getSubscription(workspaceId);
            const quality = (input.quality as ImageQualityLevel) ?? "hd";
            try {
              options.tierGuard.checkModelAccess(sub.plan, input.model);
              options.tierGuard.checkResolution(sub.plan, quality);
              await options.tierGuard.checkConcurrency(workspaceId, sub.plan);
            } catch (err) {
              if (err instanceof TierGuardError) {
                pushBillingErrorAndAbort(run, canvasId, options, err.code, err.message);
                throw err;
              }
              throw err;
            }
            creditsCost = options.tierGuard.calculateCreditCost(input.model, "image_generation", { quality });
          }

          // ── Balance pre-check: stop run immediately if insufficient ──
          if (options.creditService && creditsCost > 0) {
            const balanceInfo = await options.creditService.getBalance(workspaceId);
            if (balanceInfo.balance < creditsCost) {
              pushBillingErrorAndAbort(run, canvasId, options, "insufficient_credits", "Insufficient credits", {
                currentBalance: balanceInfo.balance,
                requiredAmount: creditsCost,
                plan: balanceInfo.plan,
                dailyClaimed: balanceInfo.dailyClaimed,
              });
              throw new Error("Insufficient credits");
            }
          }

          const job = await jobSvc.createJob(user, {
            workspaceId,
            ...(canvasId ? { canvasId } : {}),
            ...(sessionId ? { sessionId } : {}),
            jobType: "image_generation",
            payload: buildAgentImageJobPayload(input),
          });

          // Deduct credits after job creation
          if (options.creditService && creditsCost > 0) {
            try {
              const txId = await options.creditService.deductCredits(
                workspaceId, userId, creditsCost, job.id,
                `Image generation: ${input.model}`,
              );
              await jobSvc.setCreditsInfo(job.id, creditsCost, txId);
            } catch (deductError) {
              await jobSvc.cancelJob(user, job.id).catch(() => {});
              throw deductError;
            }
          }
          jobLap("job_created", { jobId: job.id, creditsCost, sessionId, runId });

          // Poll until terminal state
          // Worker image VT=120s, but Replicate calls can take 100s+ plus queue delay.
          const POLL_INTERVAL = 2000;
          const MAX_WAIT = 240_000; // 4 minutes
          const start = Date.now();
          let pollCount = 0;

          while (Date.now() - start < MAX_WAIT) {
            await delay(POLL_INTERVAL);
            pollCount++;

            if (run.controller.signal.aborted) {
              throw new Error("Run was canceled");
            }

            const current = await jobSvc.getJobAdmin(job.id);

            if (current.status === "succeeded" && current.result) {
              const result = current.result as {
                signed_url?: string;
                object_path?: string;
                width?: number;
                height?: number;
                mime_type?: string;
              };
              jobLap("job_poll_done", { pollCount, status: "succeeded" });

              // Write element directly to canvas (backend-driven insertion)
              let elementId: string | undefined;
              if (canvasId && result.object_path) {
                try {
                  const writerClient = createClient(accessToken) as UserDataClient;
                  const explicitPlacement = (input as any).placementX != null && (input as any).placementY != null
                    ? {
                        x: (input as any).placementX,
                        y: (input as any).placementY,
                        width: (input as any).placementWidth ?? 512,
                        height: (input as any).placementHeight ?? 512,
                      }
                    : undefined;

                  const insertResult = await insertImageElement(
                    writerClient,
                    {
                      canvasId,
                      objectPath: result.object_path,
                      width: result.width ?? 1024,
                      height: result.height ?? 1024,
                      mimeType: result.mime_type ?? "image/png",
                      title: input.title,
                    },
                    explicitPlacement,
                  );
                  elementId = insertResult.elementId;

                  // Notify connected frontends to refresh canvas
                  const event = {
                    type: "canvas.sync" as const,
                    runId,
                    timestamp: new Date().toISOString(),
                  } satisfies StreamEvent;
                  const replayEnvelope = options.publishCanvasSyncEvent?.({ canvasId, event, runId });
                  options.connectionManager?.pushToCanvas(canvasId, event, replayEnvelope);
                  jobLap("canvas_element_inserted", { elementId });
                } catch (insertErr) {
                  // Graceful degradation: log error but still return result
                  console.error("[submitImageJob] canvas insert failed:", insertErr);
                }
              }

              return {
                jobId: job.id,
                ...(elementId != null ? { elementId } : {}),
                imageUrl: result.signed_url ?? "",
                width: result.width ?? 1024,
                height: result.height ?? 1024,
                mimeType: result.mime_type ?? "image/png",
              };
            }

            if (current.status === "dead_letter" || current.status === "canceled") {
              jobLap("job_poll_done", { pollCount, status: current.status });
              return {
                jobId: job.id,
                error: current.error_message ?? `Job ${current.status}`,
              };
            }

            // "failed" with attempts exhausted
            if (
              current.status === "failed" &&
              current.attempt_count >= current.max_attempts
            ) {
              jobLap("job_poll_done", { pollCount, status: "failed_max_retries" });
              return {
                jobId: job.id,
                error: current.error_message ?? "Job failed after max retries",
              };
            }
          }

          jobLap("job_poll_done", { pollCount, status: "timeout" });
          return {
            jobId: job.id,
            error: `Job timed out after ${MAX_WAIT / 1000}s`,
          };
        };

        submitVideoJob = async (input) => {
          const jobT0 = Date.now();
          const jobLap = (label: string, extra?: Record<string, unknown>) => {
            console.log(`[submitVideoJob] ${label} +${Date.now() - jobT0}ms`, extra ? JSON.stringify(extra) : "");
          };

          const client = createClient(accessToken) as UserDataClient;
          const { data: ws } = await client
            .from("workspaces")
            .select("id")
            .eq("type", "personal")
            .limit(1)
            .single();
          if (!ws?.id) throw new Error("No personal workspace found");

          const user: AuthenticatedUser = {
            id: userId,
            accessToken,
            email: "",
            userMetadata: {},
          };

          // ── Tier guard + credit checks (same as HTTP route) ──
          const workspaceId = ws.id;
          let creditsCost = 0;
          if (options.creditService && options.tierGuard) {
            const sub = await options.creditService.getSubscription(workspaceId);
            try {
              options.tierGuard.checkModelAccess(sub.plan, input.model);
              if (input.resolution) {
                options.tierGuard.checkVideoResolution(sub.plan, input.resolution as any);
              }
              await options.tierGuard.checkConcurrency(workspaceId, sub.plan);
            } catch (err) {
              if (err instanceof TierGuardError) {
                pushBillingErrorAndAbort(run, canvasId, options, err.code, err.message);
                throw err;
              }
              throw err;
            }
            creditsCost = options.tierGuard.calculateCreditCost(
              input.model, "video_generation",
              {
                ...(input.duration != null ? { duration: input.duration } : {}),
                ...(input.resolution ? { resolution: input.resolution as any } : {}),
              },
            );
          }

          // ── Balance pre-check: stop run immediately if insufficient ──
          if (options.creditService && creditsCost > 0) {
            const balanceInfo = await options.creditService.getBalance(workspaceId);
            if (balanceInfo.balance < creditsCost) {
              pushBillingErrorAndAbort(run, canvasId, options, "insufficient_credits", "Insufficient credits", {
                currentBalance: balanceInfo.balance,
                requiredAmount: creditsCost,
                plan: balanceInfo.plan,
                dailyClaimed: balanceInfo.dailyClaimed,
              });
              throw new Error("Insufficient credits");
            }
          }

          const job = await jobSvc.createJob(user, {
            workspaceId,
            ...(canvasId ? { canvasId } : {}),
            ...(sessionId ? { sessionId } : {}),
            jobType: "video_generation",
            payload: buildAgentVideoJobPayload(input),
          });

          // Deduct credits after job creation
          if (options.creditService && creditsCost > 0) {
            try {
              const txId = await options.creditService.deductCredits(
                workspaceId, userId, creditsCost, job.id,
                `Video generation: ${input.model}`,
              );
              await jobSvc.setCreditsInfo(job.id, creditsCost, txId);
            } catch (deductError) {
              await jobSvc.cancelJob(user, job.id).catch(() => {});
              throw deductError;
            }
          }
          jobLap("job_created", { jobId: job.id, creditsCost, sessionId, runId });

          // Poll until terminal state — video generation is slower.
          // Google Vertex Veo can take 300-500s; 600s gives enough headroom
          // to avoid poll timeout while worker is still processing.
          const POLL_INTERVAL = 3000;
          const MAX_WAIT = 600_000; // 10 minutes
          const start = Date.now();
          let pollCount = 0;

          while (Date.now() - start < MAX_WAIT) {
            await delay(POLL_INTERVAL);
            pollCount++;

            if (run.controller.signal.aborted) {
              throw new Error("Run was canceled");
            }

            const current = await jobSvc.getJobAdmin(job.id);

            if (current.status === "succeeded" && current.result) {
              const result = current.result as {
                signed_url?: string;
                duration_seconds?: number;
                width?: number;
                height?: number;
                mime_type?: string;
              };
              jobLap("job_poll_done", { pollCount, status: "succeeded" });

              // Write element directly to canvas (backend-driven insertion)
              let elementId: string | undefined;
              if (canvasId && result.signed_url) {
                try {
                  const writerClient = createClient(accessToken) as UserDataClient;
                  const explicitPlacement = (input as any).placementX != null && (input as any).placementY != null
                    ? {
                        x: (input as any).placementX,
                        y: (input as any).placementY,
                        width: (input as any).placementWidth ?? 640,
                        height: (input as any).placementHeight ?? 360,
                      }
                    : undefined;

                  const insertResult = await insertVideoElement(
                    writerClient,
                    {
                      canvasId,
                      signedUrl: result.signed_url,
                      width: result.width ?? 1280,
                      height: result.height ?? 720,
                      mimeType: result.mime_type ?? "video/mp4",
                      ...(result.duration_seconds != null ? { durationSeconds: result.duration_seconds } : {}),
                      title: (input as any).title,
                      prompt: input.prompt,
                    },
                    explicitPlacement,
                  );
                  elementId = insertResult.elementId;

                  // Notify connected frontends to refresh canvas
                  const event = {
                    type: "canvas.sync" as const,
                    runId,
                    timestamp: new Date().toISOString(),
                  } satisfies StreamEvent;
                  const replayEnvelope = options.publishCanvasSyncEvent?.({ canvasId, event, runId });
                  options.connectionManager?.pushToCanvas(canvasId, event, replayEnvelope);
                  jobLap("canvas_element_inserted", { elementId });
                } catch (insertErr) {
                  // Graceful degradation: log error but still return result
                  console.error("[submitVideoJob] canvas insert failed:", insertErr);
                }
              }

              return {
                jobId: job.id,
                ...(elementId != null ? { elementId } : {}),
                videoUrl: result.signed_url ?? "",
                width: result.width ?? 1280,
                height: result.height ?? 720,
                mimeType: result.mime_type ?? "video/mp4",
                ...(result.duration_seconds != null ? { durationSeconds: result.duration_seconds } : {}),
              };
            }

            if (current.status === "dead_letter" || current.status === "canceled") {
              jobLap("job_poll_done", { pollCount, status: current.status });
              return {
                jobId: job.id,
                error: current.error_message ?? `Job ${current.status}`,
              };
            }

            if (
              current.status === "failed" &&
              current.attempt_count >= current.max_attempts
            ) {
              jobLap("job_poll_done", { pollCount, status: "failed_max_retries" });
              return {
                jobId: job.id,
                error: current.error_message ?? "Job failed after max retries",
              };
            }
          }

          jobLap("job_poll_done", { pollCount, status: "timeout" });
          return {
            jobId: job.id,
            error: `Job timed out after ${MAX_WAIT / 1000}s`,
          };
        };

      }

      // Load workspace skills (user-installed skills from DB).
      // Done before backend creation so we know whether to add the
      // /workspace-skills/ Store route.
      let workspaceSkills: WorkspaceSkillEntry[] = [];
      if (run.canvasId && run.accessToken && options.createUserClient) {
        try {
          workspaceSkills = await resolveAimcWorkspaceSkills({
            accessToken: run.accessToken,
            canvasId: run.canvasId,
            createUserClient: options.createUserClient,
          });
          rlog.lap("workspace_skills_loaded", { count: workspaceSkills.length });
        } catch (err) {
          // Non-fatal: agent runs without workspace skills
          console.warn("[runtime] Failed to load workspace skills:", err);
        }
      }

      const runtimeEnv = run.envOverride ?? options.env;

      // Create backend — production uses StateBackend (no local shell).
      const backendResult = createAgentBackend(
        runtimeEnv,
        run.canvasId,
        { hasWorkspaceSkills: workspaceSkills.length > 0 },
      );

      let activeRuntimeTarget: RuntimeTarget | null = null;
      let runtimeLease: { release(): void } | null = null;

      try {
        const resolvedModel = run.modelOverride
          ? (run.runtimeKind === "local-agent" || run.modelOverride.includes(":")
            ? run.modelOverride
            : createDefaultModelSpecifier({ agentModel: run.modelOverride }))
          : options.model;
        const resolvedRuntimeTarget = runtimeControlPlane.resolveRuntimeTarget({
          model: resolvedModel,
          requestedRuntimeKind: run.runtimeKind,
          ...(run.runtimeProvider
            ? { requestedRuntimeProvider: run.runtimeProvider }
            : {}),
        });
        activeRuntimeTarget = resolvedRuntimeTarget;
        run.runtimeKind = resolvedRuntimeTarget.kind;
        run.runtimeProvider = resolvedRuntimeTarget.provider;
        runtimeLease = runtimeControlPlane.acquireRuntimeLease(
          resolvedRuntimeTarget,
          run.runId,
        );

        // Resolve brand kit ID from canvas → project in a single joined query
        let brandKitId: string | null = null;
        if (run.canvasId && run.accessToken && options.createUserClient) {
          try {
            const client = options.createUserClient(run.accessToken) as any;
            const { data: canvas } = await client
              .from("canvases")
              .select("project_id, projects!inner(brand_kit_id)")
              .eq("id", run.canvasId)
              .maybeSingle();
            brandKitId = canvas?.projects?.brand_kit_id ?? null;
          } catch (err) {
            // Fallback: joined query may fail if FK isn't exposed via PostgREST
            // In that case, try the two-step approach
            try {
              const client = options.createUserClient(run.accessToken) as any;
              const { data: c } = await client
                .from("canvases")
                .select("project_id")
                .eq("id", run.canvasId)
                .maybeSingle();
              if (c?.project_id) {
                const { data: p } = await client
                  .from("projects")
                  .select("brand_kit_id")
                  .eq("id", c.project_id)
                  .maybeSingle();
                brandKitId = p?.brand_kit_id ?? null;
              }
            } catch (err2) {
              console.warn("Failed to resolve brand kit ID:", err2);
            }
          }
        }

        rlog.lap("brand_kit_resolved");

        options.agentRunStore?.updateRun({
          runId,
          runtimeKind: resolvedRuntimeTarget.kind,
          ...(resolvedRuntimeTarget.provider
            ? { runtimeProvider: resolvedRuntimeTarget.provider }
            : {}),
          status: run.status,
        });

        for await (const event of runtimeControlPlane.streamRun(
          resolvedRuntimeTarget,
          {
            backendResult,
            brandKitId,
            resolvedModel,
            rlog,
            run,
            runtimeEnv,
            ...(submitImageJob ? { submitImageJob } : {}),
            ...(submitVideoJob ? { submitVideoJob } : {}),
            workspaceSkills,
          },
        )) {
        run.status = mapEventToStatus(event);
        yield event;

        if (!isTerminalEvent(event) && options.eventDelayMs) {
          try {
            await delay(options.eventDelayMs, undefined, {
              signal: run.controller.signal,
            });
          } catch {
            run.status = "canceled";
            yield {
              runId,
              timestamp: now(),
              type: "run.canceled",
            };
            return;
          }
        }
      }
      } catch (streamError) {
        console.error("[agent-runtime] Stream iteration failed:", streamError);
        if (activeRuntimeTarget) {
          runtimeControlPlane.updateRuntimeStatus(activeRuntimeTarget, "degraded");
        }
        const failedEvent = toFailedEvent(runId, now, streamError);
        run.status = "failed";
        yield failedEvent;
        return;
      }
      finally {
        runtimeLease?.release();
        if (backendResult.sandboxDir) {
          rm(backendResult.sandboxDir, { recursive: true, force: true }).catch(
            (err) => console.warn("[sandbox] cleanup failed:", err.message),
          );
        }
      }
    },
  };
}


function isTerminalEvent(event: StreamEvent) {
  return (
    event.type === "run.canceled" ||
    event.type === "run.completed" ||
    event.type === "run.failed"
  );
}

function mapEventToStatus(event: StreamEvent): RuntimeRunStatus {
  switch (event.type) {
    case "run.canceled":
      return "canceled";
    case "run.completed":
      return "completed";
    case "run.failed":
      return "failed";
    default:
      return "running";
  }
}

function toFailedEvent(
  runId: string,
  now: () => string,
  error: unknown,
): Extract<StreamEvent, { type: "run.failed" }> {
  // Log full error detail server-side
  console.error(`[runtime] Agent run failed for run ${runId}:`, error);

  return {
    error: {
      code: "run_failed",
      message: sanitizeErrorForClient(error),
    },
    runId,
    timestamp: now(),
    type: "run.failed",
  };
}
