import type {
  RichTextMentionIdentity,
  RichTextMentionResolved,
  RichTextTriggerProvider,
} from "@tutti-os/ui-rich-text/types";
import type {
  TuttiExternalAtInsertResult,
  TuttiExternalAtMentionPresentation,
  TuttiExternalAtProviderId,
  TuttiExternalAtQueryResult,
} from "@tutti-os/workspace-external-core/contracts";
import {
  type TuttiExternalAtRichTextBridge,
  createTuttiExternalAtRichTextTriggerProviders,
} from "@tutti-os/workspace-external-core/rich-text";

const atProviderIds = [
  "workspace-app",
] as const satisfies readonly TuttiExternalAtProviderId[];

function getTuttiExternalBridge(): TuttiExternalAtRichTextBridge | undefined {
  return (
    window as unknown as { tuttiExternal?: TuttiExternalAtRichTextBridge }
  ).tuttiExternal;
}

const tuttiExternalBridgeProxy: TuttiExternalAtRichTextBridge = {
  at: {
    query(input) {
      return getTuttiExternalBridge()?.at?.query(input) ?? [];
    },
  },
};

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
  providerId: TuttiExternalAtProviderId,
  identity: RichTextMentionIdentity,
): Promise<RichTextMentionResolved | null> {
  const bridge = getTuttiExternalBridge()?.at;
  if (!bridge) return null;

  try {
    const items = await bridge.query({
      keyword: "",
      maxResults: 100,
      providers: [providerId],
    });
    const item = items.find((candidate) =>
      isMatchingMention(candidate, providerId, identity),
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
  providerId: TuttiExternalAtProviderId,
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

export function createTuttiExternalAgentContextMentionProviders(): readonly RichTextTriggerProvider<TuttiExternalAtQueryResult>[] {
  return createTuttiExternalAtRichTextTriggerProviders({
    bridge: tuttiExternalBridgeProxy,
    providerIds: atProviderIds,
  }).map(
    (provider): RichTextTriggerProvider<TuttiExternalAtQueryResult> => ({
      ...provider,
      getItemKey: (item) => `${item.providerId}:${item.itemId}`,
      getItemIconUrl: (item) =>
        normalizeMentionPresentation(
          item,
          item.insert.kind === "mention"
            ? item.insert.mention.presentation
            : undefined,
        )?.iconUrl ?? item.thumbnailUrl,
      toInsertResult: (item) => normalizeAtInsertResult(item),
      resolveMention: (identity) =>
        resolveAtMention(provider.id as TuttiExternalAtProviderId, identity),
    }),
  );
}
