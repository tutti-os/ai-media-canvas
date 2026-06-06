import { randomUUID } from "node:crypto";

import type { BackendFactory } from "deepagents";
import { z } from "zod";
import {
  imageArtifactSchema,
  type StreamEvent,
  type ToolArtifact,
  videoArtifactSchema,
} from "@aimc/shared";

import type { ServerEnv } from "../../config/env.js";
import { refreshGenerationProviders } from "../../features/settings/settings-service.js";
import type { UserDataClient } from "../../auth/request.js";
import { createBrandKitTool } from "../tools/brand-kit.js";
import { createImageGenerateTool, type SubmitImageJobFn } from "../tools/image-generate.js";
import {
  createInspectCanvasTool,
  type CanvasLayoutInspectionState,
} from "../tools/inspect-canvas.js";
import { createManipulateCanvasTool } from "../tools/manipulate-canvas.js";
import { createPersistSandboxFileTool } from "../tools/persist-sandbox-file.js";
import { createProjectSearchTool } from "../tools/project-search.js";
import { createScreenshotCanvasTool } from "../tools/screenshot-canvas.js";
import { createVideoGenerateTool, type SubmitVideoJobFn } from "../tools/video-generate.js";

type StructuredToolLike = {
  description: string;
  invoke: (input: unknown, options?: unknown) => Promise<unknown>;
  name: string;
  schema: z.ZodTypeAny;
};

export type LocalToolManifestItem = {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
};

export type LocalToolGatewayCallResult = {
  artifacts?: ToolArtifact[];
  isError: boolean;
  output?: Record<string, unknown>;
  outputSummary?: string;
};

type LocalToolGatewaySession = {
  accessToken?: string;
  attachmentDataMap?: Record<string, string>;
  backendFactory?: BackendFactory;
  brandKitId?: string | null;
  canvasId?: string;
  connectionId?: string;
  runId: string;
  runtimeEnv: ServerEnv;
  sandboxDir?: string;
  layoutInspectionState?: CanvasLayoutInspectionState;
  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  userId?: string;
};

type CreateLocalToolGatewayOptions = {
  createUserClient: (accessToken: string) => unknown;
  connectionPublisher?: {
    pushToCanvas: (canvasId: string, event: StreamEvent) => void;
  };
};

const TOOL_NAME_ALIASES = new Map<string, string>([
  ["image_generate", "generate_image"],
  ["video_generate", "generate_video"],
]);

function normalizeToolName(name: string) {
  return TOOL_NAME_ALIASES.get(name) ?? name;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function buildArtifacts(
  toolName: string,
  output: Record<string, unknown>,
): ToolArtifact[] | undefined {
  const imageUrl =
    typeof output.imageUrl === "string" && output.imageUrl.length > 0
      ? output.imageUrl
      : toolName === "screenshot_canvas" &&
          typeof output.screenshotUrl === "string" &&
          output.screenshotUrl.length > 0
        ? output.screenshotUrl
        : undefined;
  if (
    (toolName === "generate_image" || toolName === "screenshot_canvas") &&
    imageUrl
  ) {
    const parsed = imageArtifactSchema.safeParse({
      type: "image",
      url: imageUrl,
      mimeType:
        typeof output.mimeType === "string" && output.mimeType.length > 0
          ? output.mimeType
          : "image/png",
      width: typeof output.width === "number" ? output.width : 1024,
      height: typeof output.height === "number" ? output.height : 1024,
      ...(typeof output.title === "string" ? { title: output.title } : {}),
      ...(toRecord(output.placement) ? { placement: output.placement } : {}),
    });
    return parsed.success ? [parsed.data] : undefined;
  }

  if (
    toolName === "generate_video" &&
    typeof output.videoUrl === "string" &&
    output.videoUrl.length > 0
  ) {
    const parsed = videoArtifactSchema.safeParse({
      type: "video",
      url: output.videoUrl,
      mimeType:
        typeof output.mimeType === "string" && output.mimeType.length > 0
          ? output.mimeType
          : "video/mp4",
      width: typeof output.width === "number" ? output.width : 1280,
      height: typeof output.height === "number" ? output.height : 720,
      ...(typeof output.durationSeconds === "number"
        ? { durationSeconds: output.durationSeconds }
        : {}),
      ...(typeof output.title === "string" ? { title: output.title } : {}),
      ...(toRecord(output.placement) ? { placement: output.placement } : {}),
    });
    return parsed.success ? [parsed.data] : undefined;
  }

  return undefined;
}

function normalizeToolResult(
  toolName: string,
  rawResult: unknown,
): LocalToolGatewayCallResult {
  const parsed = parseMaybeJson(rawResult);
  const parsedRecord = toRecord(parsed);

  if (!parsedRecord) {
    return {
      isError: false,
      ...(typeof parsed === "string" && parsed.length > 0
        ? { outputSummary: parsed }
        : {}),
    };
  }

  const outputSummary =
    typeof parsedRecord.summary === "string"
      ? parsedRecord.summary
      : typeof parsedRecord.message === "string"
        ? parsedRecord.message
        : undefined;
  const errorMessage =
    typeof parsedRecord.error === "string" && parsedRecord.error.length > 0
      ? parsedRecord.error
      : parsedRecord.success === false && typeof parsedRecord.message === "string"
        ? parsedRecord.message
        : undefined;
  const artifacts = buildArtifacts(toolName, parsedRecord);

  const result: LocalToolGatewayCallResult = {
    isError: Boolean(errorMessage),
    output: parsedRecord,
  };
  const summary = errorMessage ?? outputSummary;
  if (summary) {
    result.outputSummary = summary;
  }
  if (artifacts) {
    result.artifacts = artifacts;
  }
  return result;
}

function toolOptionsForSession(
  session: LocalToolGatewaySession,
): Record<string, unknown> {
  return {
    state: {},
    configurable: {
      ...(session.accessToken ? { access_token: session.accessToken } : {}),
      ...(session.attachmentDataMap &&
      Object.keys(session.attachmentDataMap).length > 0
        ? { user_attachment_map: session.attachmentDataMap }
        : {}),
      ...(session.canvasId ? { canvas_id: session.canvasId } : {}),
      ...(session.connectionId ? { connection_id: session.connectionId } : {}),
      ...(session.userId ? { user_id: session.userId } : {}),
    },
  };
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

async function readImageBytes(sourceUrl: string) {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Unsupported data URL image format.");
    }
    return {
      buffer: Buffer.from(match[2]!, "base64"),
      mimeType: match[1]!,
    };
  }

  const response = await fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Unable to fetch generated image: ${response.status}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") ?? "image/png",
  };
}

export function createLocalToolGatewayService(
  options: CreateLocalToolGatewayOptions,
) {
  const sessions = new Map<string, LocalToolGatewaySession>();

  const buildTools = (
    session: LocalToolGatewaySession,
  ): Map<string, StructuredToolLike> => {
    refreshGenerationProviders(session.runtimeEnv);

    const createUserClient = options.createUserClient as (
      accessToken: string,
    ) => UserDataClient;
    const layoutInspectionState = session.layoutInspectionState ?? {};
    const persistSessionImage = session.accessToken
      ? async (sourceUrl: string, mimeType?: string) => {
          const image = await readImageBytes(sourceUrl);
          const resolvedMimeType = mimeType || image.mimeType;
          const fileName = `generated-${randomUUID()}.${extensionForMimeType(resolvedMimeType)}`;
          const objectPath = `generated/${session.runId}/${fileName}`;
          const client = createUserClient(session.accessToken!);
          const bucket = client.storage.from("project-assets");
          const { error } = await bucket.upload(objectPath, image.buffer, {
            contentType: resolvedMimeType,
          });
          if (error) {
            throw new Error(error.message ?? "Unable to persist generated image.");
          }
          return bucket.getPublicUrl(objectPath).data.publicUrl;
        }
      : undefined;
    const tools: StructuredToolLike[] = [
      createInspectCanvasTool({
        createUserClient,
        layoutInspectionState,
      }) as unknown as StructuredToolLike,
      createManipulateCanvasTool({
        createUserClient,
        layoutInspectionState,
      }) as unknown as StructuredToolLike,
      createImageGenerateTool({
        layoutInspectionState,
        ...(persistSessionImage ? { persistImage: persistSessionImage } : {}),
        ...(session.submitImageJob
          ? { submitImageJob: session.submitImageJob }
          : {}),
      }) as unknown as StructuredToolLike,
      createVideoGenerateTool({
        layoutInspectionState,
        ...(session.submitVideoJob
          ? { submitVideoJob: session.submitVideoJob }
          : {}),
      }) as unknown as StructuredToolLike,
    ];

    if (session.backendFactory) {
      tools.unshift(
        createProjectSearchTool(
          session.backendFactory,
        ) as unknown as StructuredToolLike,
      );
    }

    if (session.accessToken) {
      tools.push(
        createPersistSandboxFileTool({
          createUserClient,
          ...(session.sandboxDir ? { sandboxDir: session.sandboxDir } : {}),
        }) as unknown as StructuredToolLike,
      );
    }

    if (session.brandKitId) {
      tools.push(
        createBrandKitTool(
          { createUserClient },
          session.brandKitId,
        ) as unknown as StructuredToolLike,
      );
    }

    if (options.connectionPublisher) {
      tools.push(
        createScreenshotCanvasTool({
          connectionManager:
            options.connectionPublisher as unknown as Parameters<
              typeof createScreenshotCanvasTool
            >[0]["connectionManager"],
          ...(persistSessionImage ? { persistImage: persistSessionImage } : {}),
        }) as unknown as StructuredToolLike,
      );
    }

    return new Map(
      tools.map((toolInstance) => [toolInstance.name, toolInstance]),
    );
  };

  return {
    createSession(input: Omit<LocalToolGatewaySession, "runId"> & { runId: string }) {
      const token = randomUUID();
      sessions.set(token, {
        ...input,
        layoutInspectionState: input.layoutInspectionState ?? {},
      });
      return { token };
    },

    getManifest(token: string): LocalToolManifestItem[] {
      const session = sessions.get(token);
      if (!session) {
        throw new Error("Invalid tool session token.");
      }
      const tools = buildTools(session);
      return [...tools.values()].map((toolInstance) => ({
        name: toolInstance.name,
        description: toolInstance.description,
        inputSchema: z.toJSONSchema(toolInstance.schema) as Record<string, unknown>,
      }));
    },

    async callTool(
      token: string,
      name: string,
      args: Record<string, unknown>,
    ): Promise<LocalToolGatewayCallResult> {
      const session = sessions.get(token);
      if (!session) {
        throw new Error("Invalid tool session token.");
      }
      const tools = buildTools(session);
      const canonicalName = normalizeToolName(name);
      const toolInstance = tools.get(canonicalName);
      if (!toolInstance) {
        return {
          isError: true,
          output: {
            error: "tool_not_found",
            requestedTool: name,
          },
          outputSummary: `Tool ${name} is not available for this run.`,
        };
      }

      try {
        return normalizeToolResult(
          canonicalName,
          await toolInstance.invoke(args, toolOptionsForSession(session)),
        );
      } catch (error) {
        return {
          isError: true,
          output: {
            error: "tool_failed",
            message: error instanceof Error ? error.message : String(error),
          },
          outputSummary:
            error instanceof Error ? error.message : "Tool invocation failed.",
        };
      }
    },

    revokeSession(token: string) {
      sessions.delete(token);
    },
  };
}
