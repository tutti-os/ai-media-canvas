import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentRuntimeProvider, StreamEvent } from "@aimc/shared";
import type {
  AgentEvent,
  LocalAgentProviderPlugin,
} from "@tutti-os/agent-acp-kit";

import {
  type ImageAttachmentMetadata,
  buildImageAttachmentMetadata,
} from "../image-attachment-metadata.js";
import { createAimcToolsMcpServerConfig } from "../local-agent-host/mcp-config.js";
import {
  mapWorkspaceSkillsToLocalAgentManifest,
  materializeWorkspaceSkillsForLocalAgent,
} from "../local-agent-host/skills.js";
import { buildAimcSystemPrompt } from "../prompts/aimc-main.js";
import {
  formatTuttiSkillGuidance,
  loadTuttiAgentSkillContextForRun,
  shouldUseTuttiSkillContext,
} from "../tutti-skill-context.js";
import { loadNormalizedSessionHistory } from "./history.js";
import {
  adaptLocalAgentEvent,
  toAimcRunErrorCode,
} from "./local-agent-events.js";
import type {
  LocalAgentRuntimeExecutionContext,
  LocalAgentRuntimeProviderDeps,
  RuntimeExecutionContext,
} from "./types.js";
import { assertLocalAgentRuntimeExecutionContext } from "./types.js";

type AimcLocalAgentProviderPlugin = LocalAgentProviderPlugin<
  "local-agent",
  AgentRuntimeProvider
>;

const LOCAL_AGENT_RUNS_DIR_NAME = ".aimc-agent-runs";

function safeRunDirSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function createLocalAgentRunDirectory(input: {
  appDataDir?: string;
  runId: string;
  runtimeProvider: AgentRuntimeProvider;
}): Promise<string> {
  const appDataRunsDir = input.appDataDir
    ? join(input.appDataDir, LOCAL_AGENT_RUNS_DIR_NAME)
    : undefined;

  if (appDataRunsDir) {
    return createAppDataLocalAgentRunDirectory(input, appDataRunsDir);
  }

  return mkdtemp(
    join(tmpdir(), `aimc-local-agent-${input.runtimeProvider}-run-`),
  );
}

async function createAppDataLocalAgentRunDirectory(
  input: {
    runId: string;
    runtimeProvider: AgentRuntimeProvider;
  },
  appDataRunsDir: string,
): Promise<string> {
  const runDir = join(
    appDataRunsDir,
    `${safeRunDirSegment(input.runtimeProvider)}-${safeRunDirSegment(
      input.runId,
    )}`,
  );
  await mkdir(runDir, { recursive: true });
  return runDir;
}

function mapResumeContext(
  resumeContext: RuntimeExecutionContext["run"]["resumeContext"],
) {
  if (!resumeContext) return undefined;
  return {
    mode:
      resumeContext.mode === "provider-local"
        ? ("provider" as const)
        : ("fresh" as const),
    ...(resumeContext.providerSessionId
      ? { providerSessionId: resumeContext.providerSessionId }
      : {}),
    ...(resumeContext.resumeToken
      ? { resumeToken: resumeContext.resumeToken }
      : {}),
  };
}

function stripLocalAgentProviderPrefix(model: string, provider: string) {
  const prefix = `${provider}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

function localAgentModelIdForAcp(model: string, provider: string) {
  const stripped = stripLocalAgentProviderPrefix(model, provider);
  if (provider === "cursor" && stripped === "default") return "default[]";
  return stripped;
}

function normalizeWorkspaceSkillPathsForLocalAgent(prompt: string) {
  return prompt.replaceAll("/workspace-skills/", "workspace-skills/");
}

function joinPromptParts(...parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
}

const DEFAULT_LOCAL_AGENT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_LOCAL_AGENT_MCP_STARTUP_TIMEOUT_MS = 2 * 60_000;

function resolveLocalAgentTimeoutMs(runtimeEnv: {
  codexImagegenTimeoutMs?: number;
}) {
  return Math.max(
    runtimeEnv.codexImagegenTimeoutMs ?? 0,
    DEFAULT_LOCAL_AGENT_TIMEOUT_MS,
  );
}

export function createLocalAgentRuntimeProvider(
  deps: LocalAgentRuntimeProviderDeps,
  providerPlugin: AimcLocalAgentProviderPlugin,
) {
  const runtimeProvider = providerPlugin.id;

  return {
    ...(providerPlugin.aliases ? { aliases: providerPlugin.aliases } : {}),
    runtime: {
      id: `local-agent:${runtimeProvider}`,
      kind: "local-agent" as const,
      provider: runtimeProvider,
      mode: "local" as const,
      status: "online" as const,
      capabilities: providerPlugin.capabilities(),
    },
    async *streamRun(
      context: RuntimeExecutionContext,
    ): AsyncGenerator<StreamEvent> {
      assertLocalAgentRuntimeExecutionContext(context);
      const readyContext: LocalAgentRuntimeExecutionContext = context;

      const {
        resolvedModel,
        run,
        runtimeEnv,
        submitImageJob,
        submitVideoJob,
        workspaceSkills,
        rlog,
      } = readyContext;
      const effectiveAgentTargetId = run.agentTargetId;
      if (!effectiveAgentTargetId) {
        throw new Error(
          "Local agent runs require an exact Agent Target identity.",
        );
      }

      const canvasSummary =
        await deps.loadCanvasSummaryForRuntime(readyContext);

      let attachmentDataMap: Record<string, string> = {};
      const attachmentMetadata: Record<string, ImageAttachmentMetadata> = {};
      if (run.attachments?.length) {
        const downloaded: Array<{
          assetId: string;
          base64: string;
          mimeType: string;
        }> = [];

        await Promise.all(
          run.attachments.map(async (attachment) => {
            try {
              const dataUriMatch = attachment.url.match(
                /^data:([^;]+);base64,(.+)$/,
              );
              if (dataUriMatch) {
                const buffer = Buffer.from(dataUriMatch[2] ?? "", "base64");
                const metadata = buildImageAttachmentMetadata(buffer);
                if (metadata) attachmentMetadata[attachment.assetId] = metadata;
                downloaded.push({
                  assetId: attachment.assetId,
                  mimeType: dataUriMatch[1] ?? attachment.mimeType,
                  base64: dataUriMatch[2] ?? "",
                });
                return;
              }

              const response = await fetch(attachment.url);
              const buffer = Buffer.from(await response.arrayBuffer());
              const metadata = buildImageAttachmentMetadata(buffer);
              if (metadata) attachmentMetadata[attachment.assetId] = metadata;
              downloaded.push({
                assetId: attachment.assetId,
                mimeType:
                  attachment.mimeType ||
                  response.headers.get("content-type") ||
                  "image/png",
                base64: buffer.toString("base64"),
              });
            } catch {
              // Leave unresolved references as-is; the tool can still use raw URLs.
            }
          }),
        );

        attachmentDataMap = deps.buildAttachmentDataMap(downloaded);
      }

      const { text: enrichedPrompt } = deps.buildUserMessage(
        run.prompt,
        run.attachments ?? [],
        run.imageGenerationPreference,
        run.videoGenerationPreference,
        canvasSummary,
        attachmentMetadata,
      );
      const normalizedPrompt =
        normalizeWorkspaceSkillPathsForLocalAgent(enrichedPrompt);
      const handoffSection =
        run.resumeContext?.mode === "handoff" && run.resumeContext.previousRunId
          ? [
              "Resume handoff context:",
              `- Previous run: ${run.resumeContext.previousRunId}`,
              `- Previous runtime: ${run.resumeContext.previousRuntimeKind ?? "unknown"}${
                run.resumeContext.previousRuntimeProvider
                  ? ` (${run.resumeContext.previousRuntimeProvider})`
                  : ""
              }`,
              "- Treat the conversation history and current canvas state as the source of truth.",
              "- Continue the user's request without assuming provider-native session state is available.",
            ].join("\n")
          : undefined;
      const prompt = [
        "You are the local agent runtime for AI Canvas.",
        "If the user wants a finished visual asset, call generate_image or generate_video.",
        "Use inspect_canvas before precise canvas edits, and use manipulate_canvas for deterministic canvas updates.",
        "Do not claim an image or canvas update happened unless the tool actually succeeded.",
        "Ask clarifying questions or confirmation requests in normal assistant text. Do not use provider-native interactive question tools such as AskUserQuestion.",
        "Before a non-Codex agent calls generate_image with model codex/gpt-image-2, it must call get_workspace_settings. If codexImagegen.confirmationRequired is true, explain in normal assistant text that no image generation model is directly available for this agent and ask whether to delegate this image generation task to Codex. After the user answers, call update_workspace_settings with patch.codexImagegenDelegation=allow-once for a one-time allow, always for a durable allow, or deny before stopping.",
        "Workspace skill files are materialized under the current working directory; when reading them with shell or file tools, use relative paths such as `workspace-skills/<slug>/SKILL.md` and never `/workspace-skills/<slug>/SKILL.md`.",
        handoffSection,
        normalizedPrompt,
      ].join("\n\n");
      let runDir: string | undefined;
      try {
        run.controller.signal.throwIfAborted();
        runDir = deps.createRunDirectory
          ? await deps.createRunDirectory({
              runId: run.runId,
              runtimeProvider,
            })
          : await createLocalAgentRunDirectory({
              ...(runtimeEnv.appDataDir
                ? { appDataDir: runtimeEnv.appDataDir }
                : {}),
              runId: run.runId,
              runtimeProvider,
            });
        if (!runDir) {
          throw new Error("Local agent run directory is required.");
        }
        run.controller.signal.throwIfAborted();
      } catch (error) {
        if (runDir) {
          await rm(runDir, { recursive: true, force: true });
        }
        throw error;
      }
      let gatewaySessionToken: string | undefined;
      try {
        await materializeWorkspaceSkillsForLocalAgent({
          runDir,
          workspaceSkills,
        });
        const gatewaySession = deps.toolGateway.createSession({
          ...(run.accessToken ? { accessToken: run.accessToken } : {}),
          ...(Object.keys(attachmentDataMap).length > 0
            ? { attachmentDataMap }
            : {}),
          backendFactory: readyContext.backendResult.factory,
          ...(readyContext.brandKitId
            ? { brandKitId: readyContext.brandKitId }
            : {}),
          ...(run.canvasId ? { canvasId: run.canvasId } : {}),
          ...(run.connectionId ? { connectionId: run.connectionId } : {}),
          runId: run.runId,
          runtimeProvider,
          sessionId: run.sessionId,
          runtimeEnv,
          ...(run.delegationConsent
            ? { delegationConsent: run.delegationConsent }
            : {}),
          codexImagegenConsentBudget: run.codexImagegenConsentBudget ?? 0,
          onWorkspaceSettingsStateChange: (state) => {
            if (state.codexImagegenConsentBudget !== undefined) {
              run.codexImagegenConsentBudget = state.codexImagegenConsentBudget;
            }
            if (state.codexImagegenDelegation !== undefined) {
              run.codexImagegenDelegation = state.codexImagegenDelegation;
            }
          },
          ...(run.codexImagegenDelegation
            ? {
                workspaceSettings: {
                  codexImagegenDelegation: run.codexImagegenDelegation,
                },
              }
            : {}),
          sandboxDir: runDir,
          ...(submitImageJob ? { submitImageJob } : {}),
          ...(submitVideoJob ? { submitVideoJob } : {}),
          ...(run.userId ? { userId: run.userId } : {}),
        });
        gatewaySessionToken = gatewaySession.token;

        const messageId = run.assistantMessageId ?? `message_${run.runId}`;
        let terminalEmitted = false;
        let lastError: Extract<AgentEvent, { type: "error" }> | undefined;

        rlog.lap("local_agent_runtime_start", { provider: runtimeProvider });

        const history = await loadNormalizedSessionHistory({
          currentPrompt: enrichedPrompt,
          ...(deps.loadSessionMessages
            ? { loadSessionMessages: deps.loadSessionMessages }
            : {}),
          sessionId: run.sessionId,
        });
        const tuttiSkillContext = await (shouldUseTuttiSkillContext(
          enrichedPrompt,
        )
          ? loadTuttiAgentSkillContextForRun({
              agentTargetId: effectiveAgentTargetId,
              cwd: runDir,
              runId: run.runId,
              signal: run.controller.signal,
            })
          : Promise.resolve({
              source: "standalone" as const,
              skillManifest: [],
              skills: [],
              recommendedSystemPrompt: undefined,
            }));
        const skillManifest = [
          ...mapWorkspaceSkillsToLocalAgentManifest(workspaceSkills),
          ...tuttiSkillContext.skillManifest,
        ];
        const systemPrompt = joinPromptParts(
          buildAimcSystemPrompt({
            brandKitId: readyContext.brandKitId,
            locale: run.locale,
          }),
          formatTuttiSkillGuidance(
            tuttiSkillContext.recommendedSystemPrompt?.content,
          ),
        );
        const resume = mapResumeContext(run.resumeContext);
        const mcpServers = [
          createAimcToolsMcpServerConfig({
            gatewayBaseUrl: deps.toolGatewayBaseUrl,
            gatewayToken: gatewaySession.token,
            startupTimeoutMs: DEFAULT_LOCAL_AGENT_MCP_STARTUP_TIMEOUT_MS,
            toolTimeoutMs: resolveLocalAgentTimeoutMs(runtimeEnv),
          }),
        ];

        yield {
          type: "run.started",
          runId: run.runId,
          sessionId: run.sessionId,
          conversationId: run.conversationId,
          timestamp: deps.now(),
        };

        for await (const event of deps.localAgentRuntime.run({
          agentTargetId: effectiveAgentTargetId,
          runId: run.runId,
          provider: runtimeProvider,
          cwd: runDir,
          prompt,
          systemPrompt,
          ...(history.length > 0 ? { history } : {}),
          model: localAgentModelIdForAcp(resolvedModel, runtimeProvider),
          ...(runtimeEnv.tuttiCliPath
            ? { env: { TUTTI_CLI: runtimeEnv.tuttiCliPath } }
            : {}),
          runtimeKind: "local-agent",
          runtimeProvider,
          mcpServers,
          ...(resume ? { resume } : {}),
          signal: run.controller.signal,
          skillManifest,
          timeoutMs: resolveLocalAgentTimeoutMs(runtimeEnv),
        })) {
          if (event.type === "error") {
            lastError = event;
          }
          if (event.type === "done" && (event.sessionId || event.resumeToken)) {
            deps.recordProviderResumeMetadata?.({
              ...(event.sessionId
                ? { providerSessionId: event.sessionId }
                : {}),
              runId: run.runId,
              ...(event.resumeToken ? { resumeToken: event.resumeToken } : {}),
            });
          }

          const adaptedEvents = adaptLocalAgentEvent({
            event,
            messageId,
            now: deps.now,
            runId: run.runId,
          });

          for (const adaptedEvent of adaptedEvents) {
            if (
              adaptedEvent.type === "run.completed" ||
              adaptedEvent.type === "run.canceled" ||
              adaptedEvent.type === "run.failed"
            ) {
              if (terminalEmitted) {
                continue;
              }
              terminalEmitted = true;

              if (
                adaptedEvent.type === "run.failed" &&
                lastError &&
                adaptedEvent.error.message === "Local agent run failed."
              ) {
                adaptedEvent.error = {
                  code: toAimcRunErrorCode(lastError.code),
                  message: lastError.message,
                };
              }
            }
            yield adaptedEvent;
          }
        }
      } finally {
        if (gatewaySessionToken) {
          deps.toolGateway.revokeSession(gatewaySessionToken);
        }
        await rm(runDir, { recursive: true, force: true });
      }
    },
  };
}
