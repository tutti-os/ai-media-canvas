import type { AgentRuntimeProvider } from "@aimc/shared";
import {
  type LocalAgentProviderPlugin,
  type RawAgentEvent,
  type RawAgentStream,
  createDefaultLocalAgentProviderPlugins,
  createGenericAcpProvider,
} from "@tutti-os/agent-acp-kit";

type AimcLocalAgentProviderPlugin = LocalAgentProviderPlugin<
  "local-agent",
  AgentRuntimeProvider
>;

const AIMC_LOCAL_AGENT_PROVIDER_IDS = new Set(["codex", "claude", "nexight"]);

export function isAimcLocalAgentProvider(provider: string) {
  return AIMC_LOCAL_AGENT_PROVIDER_IDS.has(provider);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function extractClaudeAssistantText(item: RawAgentEvent) {
  const record = toRecord(item);
  if (!record || record.type !== "assistant") return undefined;

  if (typeof record.text === "string" && record.text.trim()) {
    return record.text;
  }

  const message = toRecord(record.message);
  const content = message?.content;
  if (!Array.isArray(content)) return undefined;

  const text = content
    .map((entry) => {
      const block = toRecord(entry);
      return block?.type === "text" && typeof block.text === "string"
        ? block.text
        : "";
    })
    .filter(Boolean)
    .join("\n");
  return text.trim() ? text : undefined;
}

function extractClaudeResultText(item: RawAgentEvent) {
  const record = toRecord(item);
  if (!record || record.type !== "result" || record.is_error === true) {
    return undefined;
  }
  return typeof record.result === "string" && record.result.trim()
    ? record.result
    : undefined;
}

function splitClaudeReasoning(text: string): RawAgentEvent[] {
  const events: RawAgentEvent[] = [];
  let cleaned = text;
  const reasoningParts: string[] = [];
  const reasoningPattern = /<reasoning>([\s\S]*?)<\/reasoning>/g;

  cleaned = cleaned.replace(reasoningPattern, (_match, content: string) => {
    const trimmed = content.trim();
    if (trimmed) reasoningParts.push(trimmed);
    return "";
  });

  if (reasoningParts.length > 0) {
    events.push({ type: "thinking", text: reasoningParts.join("\n") });
  }

  const finalText = cleaned.trim();
  if (finalText) {
    events.push({ type: "assistant", text: finalText });
  }

  return events;
}

async function* normalizeClaudeRawStreamForAimc(
  stream: RawAgentStream,
): RawAgentStream {
  let emittedAssistantText = false;

  for await (const item of stream) {
    const assistantText = extractClaudeAssistantText(item);
    if (assistantText) {
      emittedAssistantText = true;
      yield* splitClaudeReasoning(assistantText);
      continue;
    }

    const resultText = emittedAssistantText
      ? undefined
      : extractClaudeResultText(item);
    if (resultText) {
      emittedAssistantText = true;
      yield* splitClaudeReasoning(resultText);
      continue;
    }

    yield item;
  }
}

function withAimcClaudeStreamCompatibility(
  provider: AimcLocalAgentProviderPlugin,
): AimcLocalAgentProviderPlugin {
  const baseCreateAdapter = provider.createAdapter;
  const baseDetect = provider.detect.bind(provider);

  return {
    ...provider,
    detect: baseDetect,
    ...(baseCreateAdapter
      ? {
          createAdapter() {
            const adapter = baseCreateAdapter();
            return {
              ...adapter,
              parseEvents(stream) {
                return adapter.parseEvents(
                  normalizeClaudeRawStreamForAimc(stream),
                );
              },
            };
          },
        }
      : {}),
  };
}

export function createAimcLocalAgentProviderPlugins(): AimcLocalAgentProviderPlugin[] {
  const packageProviders = createDefaultLocalAgentProviderPlugins();
  const providers = packageProviders.some(
    (provider) => provider.id === "nexight",
  )
    ? packageProviders
    : [
        ...packageProviders,
        createGenericAcpProvider({
          args: ["acp"],
          command: "nexight",
          displayName: "Nexight",
          providerId: "nexight",
        }),
      ];

  return providers
    .filter((provider) => isAimcLocalAgentProvider(provider.id))
    .map((provider) =>
      provider.id === "claude"
        ? withAimcClaudeStreamCompatibility(provider)
        : provider,
    ) as AimcLocalAgentProviderPlugin[];
}
