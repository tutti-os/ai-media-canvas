import type { StreamEvent } from "@aimc/shared";
import { HumanMessage } from "@langchain/core/messages";

import type { UserDataClient } from "../../auth/request.js";
import {
  type ImageAttachmentMetadata,
  buildImageAttachmentMetadata,
} from "../image-attachment-metadata.js";
import type {
  RuntimeExecutionContext,
  ServerDeepAgentRuntimeProviderDeps,
} from "./types.js";

export function createServerDeepAgentRuntimeProvider(
  deps: ServerDeepAgentRuntimeProviderDeps,
) {
  return {
    runtime: {
      id: "server-deepagent",
      kind: "server-deepagent" as const,
      mode: "server" as const,
      status: "online" as const,
      capabilities: {
        cancel: true,
        nativeResume: false,
        streaming: true,
        toolGateway: false,
        maxConcurrentRuns: 8,
      },
    },
    async *streamRun(
      context: RuntimeExecutionContext,
    ): AsyncGenerator<StreamEvent> {
      const {
        backendResult,
        brandKitId,
        getWorkspaceSettings,
        resolvedModel,
        run,
        runtimeEnv,
        submitImageJob,
        submitVideoJob,
        updateWorkspaceSettings,
        workspaceSkills,
        rlog,
      } = context;

      if (workspaceSkills.length > 0) {
        rlog.lap("workspace_skills_loaded_without_store", {
          count: workspaceSkills.length,
        });
      }

      let persistImage:
        | ((url: string, mime: string, prompt: string) => Promise<string>)
        | undefined;
      if (deps.createUserClient && run.accessToken) {
        const createClient = deps.createUserClient;
        const accessToken = run.accessToken;
        persistImage = async (sourceUrl, mimeType, prompt) => {
          const client = createClient(accessToken) as UserDataClient;
          const response = await fetch(sourceUrl);
          if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          const ext = mimeType === "image/webp" ? "webp" : "png";
          const slug = prompt
            .slice(0, 40)
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          const fileName = `gen-${slug}-${Date.now()}.${ext}`;

          const { data: ws } = await client
            .from("workspaces")
            .select("id")
            .eq("type", "personal")
            .limit(1)
            .single();
          const workspaceId = ws?.id ?? "default";
          const objectPath = `${workspaceId}/${Date.now()}-${fileName}`;

          const { error: uploadError } = await client.storage
            .from("project-assets")
            .upload(objectPath, buffer, {
              contentType: mimeType,
              upsert: false,
            });
          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          const { data: urlData } = client.storage
            .from("project-assets")
            .getPublicUrl(objectPath);

          return urlData.publicUrl;
        };
      }

      const canvasSummary = await deps.loadCanvasSummaryForRuntime(context);

      const agent = deps.resolvedAgentFactory({
        backendResult,
        ...(brandKitId ? { brandKitId } : {}),
        ...(run.canvasId ? { canvasId: run.canvasId } : {}),
        ...(deps.connectionManager
          ? { connectionManager: deps.connectionManager }
          : {}),
        env: runtimeEnv,
        ...(getWorkspaceSettings ? { getWorkspaceSettings } : {}),
        ...(resolvedModel ? { model: resolvedModel } : {}),
        ...(persistImage ? { persistImage } : {}),
        ...(submitImageJob ? { submitImageJob } : {}),
        ...(submitVideoJob ? { submitVideoJob } : {}),
        ...(updateWorkspaceSettings ? { updateWorkspaceSettings } : {}),
        ...(workspaceSkills.length > 0 ? { workspaceSkills } : {}),
      });
      rlog.lap("agent_factory_done");

      const hasAttachments = run.attachments && run.attachments.length > 0;
      let userMessage: HumanMessage;
      let attachmentDataMap: Record<string, string> = {};
      const attachmentMetadata: Record<string, ImageAttachmentMetadata> = {};

      if (hasAttachments) {
        const attachments = run.attachments ?? [];
        const downloaded: Array<{
          assetId: string;
          mimeType: string;
          base64: string;
        }> = [];
        const imageBlocks = await Promise.all(
          attachments.map(async (attachment) => {
            try {
              let base64: string;
              let mimeType: string;
              const dataUriMatch = attachment.url.match(
                /^data:([^;]+);base64,(.+)$/,
              );
              if (dataUriMatch) {
                mimeType = dataUriMatch[1] ?? attachment.mimeType;
                base64 = dataUriMatch[2] ?? "";
              } else {
                const response = await fetch(attachment.url);
                const buffer = Buffer.from(await response.arrayBuffer());
                mimeType =
                  attachment.mimeType ||
                  response.headers.get("content-type") ||
                  "image/png";
                base64 = buffer.toString("base64");
              }

              const metadata = buildImageAttachmentMetadata(
                Buffer.from(base64, "base64"),
              );
              if (metadata) attachmentMetadata[attachment.assetId] = metadata;

              downloaded.push({
                assetId: attachment.assetId,
                mimeType,
                base64,
              });

              return {
                type: "image_url" as const,
                image_url: `data:${mimeType};base64,${base64}`,
              };
            } catch {
              return {
                type: "image_url" as const,
                image_url: attachment.url,
              };
            }
          }),
        );

        const { text: enrichedPrompt } = deps.buildUserMessage(
          run.prompt,
          attachments,
          run.imageGenerationPreference,
          run.videoGenerationPreference,
          canvasSummary,
          attachmentMetadata,
        );

        attachmentDataMap = deps.buildAttachmentDataMap(downloaded);
        userMessage = new HumanMessage({
          content: [
            { type: "text" as const, text: enrichedPrompt },
            ...imageBlocks,
          ],
        });
      } else {
        const { text: enrichedPrompt } = deps.buildUserMessage(
          run.prompt,
          [],
          run.imageGenerationPreference,
          run.videoGenerationPreference,
          canvasSummary,
        );
        userMessage = new HumanMessage(enrichedPrompt);
      }

      const messages = [
        ...(await deps.buildSessionHistoryMessages(
          run.sessionId,
          run.prompt,
          deps.loadSessionMessages,
        )),
        userMessage,
      ];

      rlog.lap("stream_call_start", { messageCount: messages.length });
      const stream = agent.streamEvents(
        {
          messages,
        },
        {
          ...(run.canvasId ||
          run.accessToken ||
          run.userId ||
          Object.keys(attachmentDataMap).length > 0
            ? {
                configurable: {
                  ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
                  ...(run.accessToken ? { access_token: run.accessToken } : {}),
                  ...(run.connectionId
                    ? { connection_id: run.connectionId }
                    : {}),
                  ...(run.userId ? { user_id: run.userId } : {}),
                  ...(Object.keys(attachmentDataMap).length > 0
                    ? { user_attachment_map: attachmentDataMap }
                    : {}),
                },
              }
            : {}),
          signal: run.controller.signal,
          version: "v2",
        },
      );
      rlog.lap("stream_call_returned");

      yield* deps.adaptDeepAgentStream({
        conversationId: run.conversationId,
        now: deps.now,
        runId: run.runId,
        sessionId: run.sessionId,
        signal: run.controller.signal,
        stream,
      });
    },
  };
}
