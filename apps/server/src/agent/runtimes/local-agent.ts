import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type AgentEvent,
  type LocalAgentProviderPlugin,
} from "@aimc/local-agent-runtime";
import { type AgentRuntimeProvider, type StreamEvent } from "@aimc/shared";

import type {
  LocalAgentRuntimeExecutionContext,
  LocalAgentRuntimeProviderDeps,
  RuntimeExecutionContext,
} from "./types.js";
import { assertLocalAgentRuntimeExecutionContext } from "./types.js";
import { adaptLocalAgentEvent, toAimcRunErrorCode } from "./local-agent-events.js";
import { loadNormalizedSessionHistory } from "./history.js";
import { createAimcToolsMcpServerConfig } from "../local-agent-host/mcp-config.js";
import { mapWorkspaceSkillsToLocalAgentManifest } from "../local-agent-host/skills.js";

type AimcLocalAgentProviderPlugin = LocalAgentProviderPlugin<
  "local-agent",
  AgentRuntimeProvider
>;

export function createLocalAgentRuntimeProvider(
  deps: LocalAgentRuntimeProviderDeps,
  providerPlugin: AimcLocalAgentProviderPlugin,
) {
  const runtimeProvider = providerPlugin.id;

  return {
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

      const canvasSummary = await deps.loadCanvasSummaryForRuntime(readyContext);

      let attachmentDataMap: Record<string, string> = {};
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
                downloaded.push({
                  assetId: attachment.assetId,
                  mimeType: dataUriMatch[1] ?? attachment.mimeType,
                  base64: dataUriMatch[2] ?? "",
                });
                return;
              }

              const response = await fetch(attachment.url);
              const buffer = Buffer.from(await response.arrayBuffer());
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
        run.mentions,
        run.videoGenerationPreference,
        canvasSummary,
      );
      const prompt = [
        "You are the local agent runtime for AI Media Canvas.",
        "If the user wants a finished visual asset, call generate_image or generate_video.",
        "Use inspect_canvas before precise canvas edits, and use manipulate_canvas for deterministic canvas updates.",
        "Do not claim an image or canvas update happened unless the tool actually succeeded.",
        enrichedPrompt,
      ].join("\n\n");

      const gatewaySession = deps.toolGateway.createSession({
        ...(run.accessToken ? { accessToken: run.accessToken } : {}),
        ...(Object.keys(attachmentDataMap).length > 0
          ? { attachmentDataMap }
          : {}),
        ...(readyContext.brandKitId ? { brandKitId: readyContext.brandKitId } : {}),
        ...(run.canvasId ? { canvasId: run.canvasId } : {}),
        ...(run.connectionId ? { connectionId: run.connectionId } : {}),
        runId: run.runId,
        runtimeEnv,
        ...(submitImageJob ? { submitImageJob } : {}),
        ...(submitVideoJob ? { submitVideoJob } : {}),
        ...(run.userId ? { userId: run.userId } : {}),
      });

      const runDir = await mkdtemp(
        join(tmpdir(), `aimc-local-agent-${runtimeProvider}-run-`),
      );
      const history = await loadNormalizedSessionHistory({
        currentPrompt: enrichedPrompt,
        ...(deps.loadSessionMessages
          ? { loadSessionMessages: deps.loadSessionMessages }
          : {}),
        sessionId: run.sessionId,
      });
      const skillManifest = mapWorkspaceSkillsToLocalAgentManifest(workspaceSkills);
      const mcpServers = [
        createAimcToolsMcpServerConfig({
          gatewayBaseUrl: deps.toolGatewayBaseUrl,
          gatewayToken: gatewaySession.token,
        }),
      ];
      const messageId = run.assistantMessageId ?? `message_${run.runId}`;
      let terminalEmitted = false;
      let lastError: Extract<AgentEvent, { type: "error" }> | undefined;

      rlog.lap("local_agent_runtime_start", { provider: runtimeProvider });

      try {
        yield {
          type: "run.started",
          runId: run.runId,
          sessionId: run.sessionId,
          conversationId: run.conversationId,
          timestamp: deps.now(),
        };

        for await (const event of deps.localAgentRuntime.run({
          runId: run.runId,
          provider: runtimeProvider,
          cwd: runDir,
          prompt,
          ...(history.length > 0 ? { history } : {}),
          model: resolvedModel,
          runtimeKind: "local-agent",
          runtimeProvider,
          mcpServers,
          signal: run.controller.signal,
          skillManifest,
        })) {
          if (event.type === "error") {
            lastError = event;
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
        deps.toolGateway.revokeSession(gatewaySession.token);
        await rm(runDir, { recursive: true, force: true });
      }
    },
  };
}
