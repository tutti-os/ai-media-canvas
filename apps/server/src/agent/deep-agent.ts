import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import type { BaseStore } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { type SubAgent, createDeepAgent } from "deepagents";

import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_GOOGLE_AGENT_MODEL,
  type ServerEnv,
} from "../config/env.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
import {
  type AgentBackendResult,
  createAgentBackend,
} from "./backends/index.js";
import { buildAimcSystemPrompt } from "./prompts/aimc-main.js";
import type {
  PersistImageFn,
  SubmitImageJobFn,
} from "./tools/image-generate.js";
import { createMainAgentTools } from "./tools/index.js";
import type { CanvasClient } from "./tools/inspect-canvas.js";
import { createVideoGenerateTool } from "./tools/video-generate.js";
import type { SubmitVideoJobFn } from "./tools/video-generate.js";
import type {
  ApplyWorkspaceSettingsPatch,
  ReadWorkspaceSettings,
} from "./tools/workspace-settings.js";
import type { WorkspaceSkillEntry } from "./workspace-skills.js";

export type AimcAgent = Pick<
  ReturnType<typeof createDeepAgent>,
  "stream" | "streamEvents"
>;

export type AimcAgentFactory = (options: {
  backendResult?: AgentBackendResult;
  brandKitId?: string | null;
  canvasId?: string;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => unknown;
  env: ServerEnv;
  getWorkspaceSettings?: ReadWorkspaceSettings;
  locale?: "zh-CN" | "en";
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  store?: BaseStore;

  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  updateWorkspaceSettings?: ApplyWorkspaceSettingsPatch;
  workspaceSkills?: WorkspaceSkillEntry[];
}) => AimcAgent;

function createVideoSubAgent(): SubAgent {
  return {
    name: "generate_video",
    description:
      "Generate a video based on a creative description. Video generation availability depends on provider configuration.",
    systemPrompt: `You are a video generation specialist. Given a description, generate a video using the generate_video tool and return the result.

If video generation is not available or fails, clearly explain the limitation.`,
    tools: [createVideoGenerateTool()],
  };
}

export function createAimcDeepAgent(options: {
  backendResult?: AgentBackendResult;
  brandKitId?: string | null;
  canvasId?: string;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => unknown;
  env: ServerEnv;
  getWorkspaceSettings?: ReadWorkspaceSettings;
  locale?: "zh-CN" | "en";
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  store?: BaseStore;

  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  updateWorkspaceSettings?: ApplyWorkspaceSettingsPatch;
  workspaceSkills?: WorkspaceSkillEntry[];
}): AimcAgent {
  const backendResult =
    options.backendResult ??
    createAgentBackend(options.env, options.canvasId, {
      workspaceSkills: options.workspaceSkills ?? [],
    });

  applyOpenAICompatEnv(options.env);

  const modelSpec = options.model ?? createDefaultModelSpecifier(options.env);
  const resolvedModel =
    typeof modelSpec === "string"
      ? createStreamingChatModel(modelSpec, options.env)
      : modelSpec;

  const createUserClient =
    options.createUserClient ??
    ((_accessToken: string): never => {
      throw new Error(
        "inspect_canvas is unavailable: no createUserClient was provided to createAimcDeepAgent.",
      );
    });

  let systemPrompt = buildAimcSystemPrompt({
    brandKitId: options.brandKitId,
    locale: options.locale,
  });

  // Inject enabled skills (both system and user-created) into the system prompt.
  // All skills are loaded from the database via loadWorkspaceSkills() in runtime.ts.
  const wsSkills = options.workspaceSkills ?? [];
  if (wsSkills.length > 0) {
    const skillsList = wsSkills
      .map((s) => {
        let line = `- **${s.name}**: ${s.description}\n  → Read \`${s.path}\` for full instructions`;
        if (s.files.length > 0) {
          const counts: Record<string, number> = {};
          for (const f of s.files) {
            const dir = f.path.split("/")[0] ?? "other";
            counts[dir] = (counts[dir] ?? 0) + 1;
          }
          const summary = Object.entries(counts)
            .map(([dir, n]) => `${dir}/ (${n})`)
            .join(", ");
          line += `\n  → Has: ${summary}`;
        }
        return line;
      })
      .join("\n");
    systemPrompt += `\n\n## Skills\n\nThe following skills are enabled in this workspace:\n${skillsList}`;
  }

  return createDeepAgent({
    backend: backendResult.factory,
    model: resolvedModel,
    name: "ai-media-canvas",
    subagents: [createVideoSubAgent()],
    systemPrompt,
    ...(options.store ? { store: options.store } : {}),
    tools: createMainAgentTools(backendResult.factory, {
      createUserClient: createUserClient as (
        accessToken: string,
      ) => CanvasClient,
      ...(options.brandKitId != null ? { brandKitId: options.brandKitId } : {}),
      ...(options.connectionManager
        ? { connectionManager: options.connectionManager }
        : {}),
      ...(options.getWorkspaceSettings
        ? { getWorkspaceSettings: options.getWorkspaceSettings }
        : {}),
      ...(options.persistImage ? { persistImage: options.persistImage } : {}),
      ...(options.updateWorkspaceSettings
        ? { updateWorkspaceSettings: options.updateWorkspaceSettings }
        : {}),
      ...(backendResult.sandboxDir
        ? { sandboxDir: backendResult.sandboxDir }
        : {}),

      ...(options.submitImageJob
        ? { submitImageJob: options.submitImageJob }
        : {}),
      ...(options.submitVideoJob
        ? { submitVideoJob: options.submitVideoJob }
        : {}),
    }),
  });
}

/**
 * Create a streaming chat model from a `<provider>:<model-id>` specifier.
 *
 * Supported providers:
 * - `openai` (default) — uses ChatOpenAI with `streamUsage: false` to work
 *   around the one-api proxy stripping `delta.role` from chunks.
 * - `anthropic` — uses ChatAnthropic for Claude models hosted on Anthropic.
 * - `google` — uses ChatGoogleGenerativeAI (Google AI Studio, API Key) or
 *   ChatVertexAI (Vertex AI, service account) depending on available config.
 */
function createStreamingChatModel(
  specifier: string,
  env?: Pick<
    ServerEnv,
    | "agnesApiKey"
    | "agnesBaseUrl"
    | "anthropicApiKey"
    | "anthropicBaseUrl"
    | "googleApiKey"
    | "googleVertexLocation"
    | "googleVertexProject"
    | "openAIApiBase"
    | "openAIApiKey"
  >,
): BaseLanguageModel {
  const colonIdx = specifier.indexOf(":");
  let provider = colonIdx > 0 ? specifier.slice(0, colonIdx) : "openai";
  let modelName = colonIdx > 0 ? specifier.slice(colonIdx + 1) : specifier;

  const resolvedAgnesApiKey = env?.agnesApiKey ?? process.env.AGNES_API_KEY;
  const resolvedAgnesBaseUrl =
    env?.agnesBaseUrl ?? process.env.AGNES_BASE_URL ?? DEFAULT_AGNES_BASE_URL;
  const resolvedAnthropicApiKey =
    env?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  const resolvedAnthropicBaseUrl =
    env?.anthropicBaseUrl ?? process.env.ANTHROPIC_BASE_URL;
  const resolvedOpenAIApiKey = env?.openAIApiKey ?? process.env.OPENAI_API_KEY;
  const resolvedOpenAIBaseUrl =
    env?.openAIApiBase ?? process.env.OPENAI_BASE_URL;
  const hasGoogleApiKey = !!(env?.googleApiKey ?? process.env.GOOGLE_API_KEY);
  const hasVertexAI = !!(
    (env?.googleVertexProject ?? process.env.GOOGLE_VERTEX_PROJECT) &&
    (env?.googleVertexLocation ?? process.env.GOOGLE_VERTEX_LOCATION)
  );
  const hasGoogle = hasGoogleApiKey || hasVertexAI;
  const hasAgnes = !!resolvedAgnesApiKey;

  // Provider availability fallback
  if (provider === "google" && !hasGoogle) {
    console.warn(
      `[model] Google unavailable (no GOOGLE_API_KEY or Vertex AI config), falling back to OpenAI for: ${specifier}`,
    );
    provider = "openai";
    modelName = DEFAULT_AGENT_MODEL;
  }
  if (provider === "openai" && !resolvedOpenAIApiKey && hasGoogle) {
    console.warn(
      `[model] OpenAI unavailable (no OPENAI_API_KEY), falling back to Google for: ${specifier}`,
    );
    provider = "google";
    modelName = DEFAULT_GOOGLE_AGENT_MODEL;
  }

  switch (provider) {
    case "anthropic":
      if (!resolvedAnthropicApiKey) {
        throw new Error(
          `Anthropic model selected without Anthropic API key: ${specifier}`,
        );
      }
      return new ChatAnthropic({
        model: modelName,
        anthropicApiKey: resolvedAnthropicApiKey,
        ...(resolvedAnthropicBaseUrl
          ? {
              clientOptions: {
                baseURL: resolvedAnthropicBaseUrl,
              },
            }
          : {}),
        streaming: true,
      });
    case "agnes":
      if (!hasAgnes) {
        throw new Error(
          `Agnes model selected without Agnes API key: ${specifier}`,
        );
      }
      return new ChatOpenAI({
        model: modelName,
        apiKey: resolvedAgnesApiKey,
        configuration: {
          baseURL: resolvedAgnesBaseUrl,
        },
        streaming: true,
        streamUsage: false,
      });
    case "google":
      // Prefer Vertex AI (service account) when configured; fall back to Developer API key
      if (hasVertexAI) {
        const vertexProject =
          env?.googleVertexProject ?? process.env.GOOGLE_VERTEX_PROJECT;
        const vertexLocation =
          env?.googleVertexLocation ?? process.env.GOOGLE_VERTEX_LOCATION;
        if (!vertexProject || !vertexLocation) {
          throw new Error(
            `Google Vertex model selected without Vertex AI config: ${specifier}`,
          );
        }
        console.log(
          `[model] Using Vertex AI for: ${modelName} (project=${vertexProject}, location=${vertexLocation})`,
        );
        return new ChatVertexAI({
          model: modelName,
          location: vertexLocation,
          authOptions: { projectId: vertexProject },
          streaming: true,
        });
      }
      {
        const googleApiKey = env?.googleApiKey ?? process.env.GOOGLE_API_KEY;
        if (!googleApiKey) {
          throw new Error(
            `Google model selected without API key: ${specifier}`,
          );
        }
        return new ChatGoogleGenerativeAI({
          model: modelName,
          apiKey: googleApiKey,
          streaming: true,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: -1, // dynamic — let the model decide
          },
        });
      }
    default:
      return new ChatOpenAI({
        model: modelName,
        ...(resolvedOpenAIApiKey ? { apiKey: resolvedOpenAIApiKey } : {}),
        ...(resolvedOpenAIBaseUrl
          ? {
              configuration: {
                baseURL: resolvedOpenAIBaseUrl,
              },
            }
          : {}),
        streaming: true,
        streamUsage: false,
      });
  }
}

/** Known model-name prefixes that map to Google Gemini. */
const GOOGLE_MODEL_PREFIXES = ["gemini-"];
const ANTHROPIC_MODEL_PREFIXES = ["claude-"];
const AGNES_MODEL_PREFIXES = ["agnes-"];

export function createDefaultModelSpecifier(
  env: Pick<ServerEnv, "agentModel">,
) {
  const model = env.agentModel;
  // Already has an explicit provider prefix — pass through as-is.
  if (model.includes(":")) return model;
  // Auto-detect Google models by name prefix.
  if (GOOGLE_MODEL_PREFIXES.some((p) => model.startsWith(p)))
    return `google:${model}`;
  if (ANTHROPIC_MODEL_PREFIXES.some((p) => model.startsWith(p)))
    return `anthropic:${model}`;
  if (AGNES_MODEL_PREFIXES.some((p) => model.startsWith(p)))
    return `agnes:${model}`;
  return `openai:${model}`;
}

export function applyOpenAICompatEnv(
  env: Pick<ServerEnv, "openAIApiBase" | "openAIApiKey">,
  target: NodeJS.ProcessEnv = process.env,
) {
  if (env.openAIApiKey) {
    target.OPENAI_API_KEY = env.openAIApiKey;
  }

  if (env.openAIApiBase) {
    target.OPENAI_BASE_URL = env.openAIApiBase;
  }
}
