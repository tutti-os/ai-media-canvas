import type { StreamEvent } from "@aimc/shared";

import { streamCodexLocalRun as defaultStreamCodexLocalRun } from "../local-runtime/codex-runtime.js";
import type {
  LocalCodexRuntimeExecutionContext,
  LocalCodexRuntimeProviderDeps,
  RuntimeExecutionContext,
} from "./types.js";
import { assertLocalCodexRuntimeExecutionContext } from "./types.js";

export function createLocalCodexRuntimeProvider(
  deps: LocalCodexRuntimeProviderDeps,
) {
  const streamCodexLocalRun = deps.streamCodexLocalRun ?? defaultStreamCodexLocalRun;

  return {
    kind: "local-codex" as const,
    async *streamRun(
      context: RuntimeExecutionContext,
    ): AsyncGenerator<StreamEvent> {
      assertLocalCodexRuntimeExecutionContext(context);
      const readyContext: LocalCodexRuntimeExecutionContext = context;

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

      rlog.lap("codex_local_runtime_start");

      yield* streamCodexLocalRun({
        attachmentsSummaryPrompt: enrichedPrompt,
        conversationId: run.conversationId,
        gatewayBaseUrl: deps.toolGatewayBaseUrl,
        gatewaySession: {
          token: gatewaySession.token,
          revoke: () => deps.toolGateway.revokeSession(gatewaySession.token),
        },
        ...(deps.loadSessionMessages
          ? { loadSessionMessages: deps.loadSessionMessages }
          : {}),
        model: resolvedModel,
        now: deps.now,
        runId: run.runId,
        runtimeEnv,
        sessionId: run.sessionId,
        signal: run.controller.signal,
        workspaceSkills,
      });
    },
  };
}
