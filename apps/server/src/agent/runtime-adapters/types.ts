import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { AIMessage, HumanMessage } from "@langchain/core/messages";
import type {
  ChatMessage,
  ImageAttachment,
  ImageGenerationPreference,
  MessageMention,
  RuntimeKind,
  StreamEvent,
  VideoGenerationPreference,
} from "@aimc/shared";

import type { UserDataClient } from "../../auth/request.js";
import type { ServerEnv } from "../../config/env.js";
import type { ConnectionManager } from "../../ws/connection-manager.js";
import type { createPipelineLogger } from "../../ws/logger.js";
import type { createAgentBackend } from "../backends/index.js";
import type { AimcAgentFactory } from "../deep-agent.js";
import type { streamCodexLocalRun } from "../local-runtime/codex-runtime.js";
import type { createLocalToolGatewayService } from "../local-runtime/tool-gateway.js";
import type { SubmitImageJobFn } from "../tools/image-generate.js";
import type { SubmitVideoJobFn } from "../tools/video-generate.js";
import type { WorkspaceSkillEntry } from "../workspace-skills.js";

export type RuntimeRunRecord = {
  accessToken?: string | undefined;
  assistantMessageId?: string | undefined;
  attachments?: ImageAttachment[] | undefined;
  canvasId?: string | undefined;
  connectionId?: string | undefined;
  consumed: boolean;
  controller: AbortController;
  conversationId: string;
  envOverride?: ServerEnv | undefined;
  imageGenerationPreference?: ImageGenerationPreference | undefined;
  mentions?: MessageMention[] | undefined;
  modelOverride?: string | undefined;
  prompt: string;
  runId: string;
  runtimeKind?: RuntimeKind | undefined;
  sessionId: string;
  status: "accepted" | "running" | "completed" | "failed" | "canceled";
  threadId?: string | undefined;
  userId?: string | undefined;
  videoGenerationPreference?: VideoGenerationPreference | undefined;
};

export type RuntimeExecutionContext = {
  backendResult: ReturnType<typeof createAgentBackend>;
  brandKitId: string | null;
  resolvedModel: BaseLanguageModel | string | undefined;
  rlog: ReturnType<typeof createPipelineLogger>;
  run: RuntimeRunRecord;
  runtimeEnv: ServerEnv;
  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  workspaceSkills: WorkspaceSkillEntry[];
};

export type LocalCodexRuntimeExecutionContext = Omit<
  RuntimeExecutionContext,
  "resolvedModel"
> & {
  resolvedModel: string;
};

export type BuildUserMessage = (
  prompt: string,
  attachments: ImageAttachment[],
  imageGenerationPreference?: ImageGenerationPreference,
  mentions?: MessageMention[],
  videoGenerationPreference?: VideoGenerationPreference,
  canvasSummary?: string | null,
) => { text: string };

export type BuildAttachmentDataMap = (
  downloaded: Array<{ assetId: string; mimeType: string; base64: string }>,
) => Record<string, string>;

export type BuildSessionHistoryMessages = (
  sessionId: string,
  currentPrompt: string,
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>,
) => Promise<Array<HumanMessage | AIMessage>>;

export type LoadCanvasSummaryForRuntime = (
  context: RuntimeExecutionContext,
) => Promise<string | null>;

export type LocalCodexRuntimeProviderDeps = {
  buildAttachmentDataMap: BuildAttachmentDataMap;
  buildUserMessage: BuildUserMessage;
  loadCanvasSummaryForRuntime: LoadCanvasSummaryForRuntime;
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>;
  now: () => string;
  streamCodexLocalRun?: typeof streamCodexLocalRun;
  toolGateway: ReturnType<typeof createLocalToolGatewayService>;
  toolGatewayBaseUrl: string;
};

export type ServerDeepAgentRuntimeProviderDeps = {
  adaptDeepAgentStream: (input: {
    conversationId: string;
    now: () => string;
    runId: string;
    sessionId: string;
    signal: AbortSignal;
    stream: AsyncIterable<unknown>;
  }) => AsyncIterable<StreamEvent>;
  buildAttachmentDataMap: BuildAttachmentDataMap;
  buildSessionHistoryMessages: BuildSessionHistoryMessages;
  buildUserMessage: BuildUserMessage;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => unknown;
  loadCanvasSummaryForRuntime: LoadCanvasSummaryForRuntime;
  loadSessionMessages?: (sessionId: string) => Promise<ChatMessage[]>;
  now: () => string;
  resolvedAgentFactory: AimcAgentFactory;
};

export type PersistImageClientFactory = (
  accessToken: string,
) => UserDataClient;

export function assertLocalCodexRuntimeExecutionContext(
  context: RuntimeExecutionContext,
): asserts context is LocalCodexRuntimeExecutionContext {
  if (typeof context.resolvedModel !== "string") {
    throw new Error("Local Codex runtime requires a string model.");
  }
}
