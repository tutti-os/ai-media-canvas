import type {
  RichTextMentionIdentity,
  RichTextMentionResolved,
  RichTextTriggerProvider,
  RichTextTriggerQueryInput,
} from "@tutti-os/ui-rich-text/types";
import type {
  TuttiExternalAtInsertResult,
  TuttiExternalAtMentionPresentation,
  TuttiExternalAtProviderId,
  TuttiExternalAtQueryResult,
} from "@tutti-os/workspace-external-core/contracts";
import type { TuttiExternalAtRichTextBridge } from "@tutti-os/workspace-external-core/rich-text";

const atProviderIds = [
  "workspace-app",
  "agent-target",
] as const satisfies readonly TuttiExternalAtProviderId[];

function getTuttiExternalBridge(): TuttiExternalAtRichTextBridge | undefined {
  return (
    window as unknown as { tuttiExternal?: TuttiExternalAtRichTextBridge }
  ).tuttiExternal;
}

function normalizeMentionPresentation(
  item: TuttiExternalAtQueryResult,
  presentation?: TuttiExternalAtMentionPresentation,
): TuttiExternalAtMentionPresentation | undefined {
  const iconUrl =
    presentation?.iconUrl?.trim() ||
    presentation?.thumbnailUrl?.trim() ||
    presentation?.agentIconUrl?.trim() ||
    item.thumbnailUrl?.trim() ||
    undefined;
  const nextPresentation: TuttiExternalAtMentionPresentation = {
    ...presentation,
  };

  if (iconUrl) {
    nextPresentation.iconUrl = iconUrl;
    nextPresentation.thumbnailUrl ??= iconUrl;
  }

  return Object.keys(nextPresentation).length > 0
    ? nextPresentation
    : undefined;
}

function normalizeAtInsertResult(
  item: TuttiExternalAtQueryResult,
): TuttiExternalAtInsertResult {
  const { insert } = item;
  if (insert.kind !== "mention") {
    return insert;
  }
  const presentation = normalizeMentionPresentation(
    item,
    insert.mention.presentation,
  );

  return {
    kind: "mention",
    mention: {
      entityId: insert.mention.entityId,
      label: insert.mention.label,
      ...(insert.mention.scope ? { scope: insert.mention.scope } : {}),
      ...(presentation ? { presentation } : {}),
    },
  };
}

async function resolveAtMention(
  identity: RichTextMentionIdentity,
): Promise<RichTextMentionResolved | null> {
  const bridge = getTuttiExternalBridge()?.at;
  if (!bridge) return null;

  const providerId = atProviderIds.find(
    (candidate) => candidate === identity.providerId,
  );
  if (!providerId) return null;

  try {
    const items = await bridge.query({
      keyword: "",
      maxResults: 100,
      providers: [providerId],
    });
    const item = items.find((candidate) =>
      isMatchingMention(candidate, identity.providerId, identity),
    );
    if (!item) return null;

    const insert = normalizeAtInsertResult(item);
    if (insert.kind !== "mention") return null;

    return {
      label: insert.mention.label,
      ...(insert.mention.presentation
        ? { presentation: insert.mention.presentation }
        : {}),
    };
  } catch {
    return null;
  }
}

function isMatchingMention(
  item: TuttiExternalAtQueryResult,
  providerId: string,
  identity: RichTextMentionIdentity,
) {
  if (item.providerId !== providerId) return false;
  const insert = normalizeAtInsertResult(item);
  return (
    insert.kind === "mention" &&
    insert.mention.entityId === identity.entityId &&
    sameMentionScope(insert.mention.scope, identity.scope)
  );
}

function sameMentionScope(
  left: Readonly<Record<string, string>> | undefined,
  right: Readonly<Record<string, string>> | undefined,
) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right?.[key] === value)
  );
}

async function queryAtMentionProvider(
  providerId: TuttiExternalAtProviderId,
  input: RichTextTriggerQueryInput,
): Promise<readonly TuttiExternalAtQueryResult[]> {
  const bridge = getTuttiExternalBridge()?.at;
  if (!bridge) return [];

  try {
    const items = await bridge.query({
      keyword: input.keyword,
      ...(input.maxResults !== undefined
        ? { maxResults: input.maxResults }
        : {}),
      providers: [providerId],
    });
    return items.filter((item) => item.providerId === providerId);
  } catch {
    return [];
  }
}

function createTuttiExternalAtMentionProvider(
  providerId: TuttiExternalAtProviderId,
): RichTextTriggerProvider<TuttiExternalAtQueryResult> {
  return {
    id: providerId,
    trigger: "@",
    query: (input) => queryAtMentionProvider(providerId, input),
    getItemKey: (item) => `${item.providerId}:${item.itemId}`,
    getItemLabel: (item) => item.label,
    getItemSubtitle: (item) => item.subtitle,
    getItemIconUrl: (item) =>
      normalizeMentionPresentation(
        item,
        item.insert.kind === "mention"
          ? item.insert.mention.presentation
          : undefined,
      )?.iconUrl ?? item.thumbnailUrl,
    toInsertResult: (item) => normalizeAtInsertResult(item),
    resolveMention: (identity) => resolveAtMention(identity),
  };
}

export function createTuttiExternalAgentContextMentionProviders(): readonly RichTextTriggerProvider<TuttiExternalAtQueryResult>[] {
  return atProviderIds.map((providerId) =>
    createTuttiExternalAtMentionProvider(providerId),
  );
}
