"use client";

import { motion } from "framer-motion";
import React, { useMemo } from "react";

import type { ContentBlock, ToolArtifact, ToolBlock } from "@aimc/shared";
import { toRuntimeAssetUrl } from "../lib/local-assets";
import { ImagePill } from "./chat/image-lightbox";
import { MarkdownRenderer } from "./chat/markdown-renderer";
import { MentionPill } from "./chat/mention-pill";
import { ThinkingBlockView } from "./chat/thinking-block-view";
import { ToolBlockView } from "./chat/tool-block-view";

// Re-export types for backward compatibility with existing consumers
export type { ContentBlock, ToolArtifact };

/** @deprecated Use ToolBlock from @aimc/shared instead */
export type ToolActivity = ToolBlock;

/* ------------------------------------------------------------------ */
/*  ChatMessage                                                        */
/* ------------------------------------------------------------------ */

type ChatMessageProps = {
  role: "user" | "assistant";
  contentBlocks: ContentBlock[];
  isStreaming?: boolean;
  onOpenMediaSettings?: (() => void) | undefined;
};

function stableStringHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function imageBlockKey(block: ContentBlock) {
  const imageBlock = block as { assetId?: string; url?: string };
  return `image:${imageBlock.assetId ?? ""}:${imageBlock.url ?? ""}`;
}

function mentionBlockKey(block: ContentBlock) {
  const mentionBlock = block as {
    id?: string;
    label?: string;
    mentionType?: string;
  };
  return `mention:${mentionBlock.mentionType ?? ""}:${mentionBlock.id ?? mentionBlock.label ?? ""}`;
}

function assistantBlockKey(block: ContentBlock) {
  if (block.type === "thinking") {
    return `thinking:${stableStringHash(block.thinking)}`;
  }
  if (block.type === "text") {
    return `text:${stableStringHash(block.text)}`;
  }
  if (block.type === "tool") {
    return `tool:${block.toolCallId}`;
  }
  if (block.type === "image") {
    return imageBlockKey(block);
  }
  return mentionBlockKey(block);
}

function getMediaCapabilityKey(block: ContentBlock) {
  if (block.type !== "tool") return null;

  const output = block.output as Record<string, unknown> | undefined;
  const raw = output?.capabilityRequired;
  if (!raw || typeof raw !== "object") return null;

  const capability = (raw as { capability?: unknown }).capability;
  if (
    capability !== "image_generation" &&
    capability !== "video_generation"
  ) {
    return null;
  }

  return capability;
}

function getFirstMediaCapabilityToolIds(contentBlocks: ContentBlock[]) {
  const seen = new Set<string>();
  const firstToolIds = new Set<string>();

  for (const block of contentBlocks) {
    const capability = getMediaCapabilityKey(block);
    if (!capability || seen.has(capability)) continue;
    seen.add(capability);
    firstToolIds.add((block as ToolBlock).toolCallId);
  }

  return firstToolIds;
}

/**
 * Top-level chat message component.
 *
 * Memoized with a custom comparator: skips re-render when contentBlocks
 * reference and isStreaming flag are unchanged. During streaming, only the
 * actively-streaming message receives new contentBlocks arrays; all prior
 * messages keep the same reference and skip rendering entirely.
 *
 * Sub-components (MarkdownRenderer, ToolBlockView, ThinkingBlockView) are
 * each independently memoized for fine-grained update control.
 */
export const ChatMessage = React.memo(
  function ChatMessage({
    role,
    contentBlocks,
    isStreaming,
    onOpenMediaSettings,
  }: ChatMessageProps) {
    const isUser = role === "user";

    if (isUser) {
      return <UserMessage contentBlocks={contentBlocks} />;
    }

    return (
      <AssistantMessage
        contentBlocks={contentBlocks}
        isStreaming={isStreaming ?? false}
        onOpenMediaSettings={onOpenMediaSettings}
      />
    );
  },
  (prev, next) => {
    // Custom comparator: referential equality on contentBlocks is sufficient
    // because updateSessionMessages always creates a new array when content changes
    return (
      prev.role === next.role &&
      prev.contentBlocks === next.contentBlocks &&
      prev.isStreaming === next.isStreaming &&
      prev.onOpenMediaSettings === next.onOpenMediaSettings
    );
  },
);

/* ------------------------------------------------------------------ */
/*  UserMessage                                                        */
/* ------------------------------------------------------------------ */

const UserMessage = React.memo(function UserMessage({
  contentBlocks,
}: {
  contentBlocks: ContentBlock[];
}) {
  // Categorize blocks once per render
  const { text, imageBlocks, mentionBlocks } = useMemo(() => {
    const textParts: string[] = [];
    const images: ContentBlock[] = [];
    const mentions: ContentBlock[] = [];

    for (const block of contentBlocks) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "image") {
        images.push(block);
      } else if (block.type === "mention") {
        mentions.push(block);
      }
    }

    return {
      text: textParts.join(""),
      imageBlocks: images,
      mentionBlocks: mentions,
    };
  }, [contentBlocks]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col items-end gap-2 pl-10"
    >
      {text && (
        <div
          data-chat-bubble
          className="inline-block rounded-xl bg-muted px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-foreground"
        >
          <span className="cursor-text select-text [word-break:break-word]">
            {text}
          </span>
          {mentionBlocks.length > 0 && (
            <span className="inline">
              {mentionBlocks.map((block, idx) => (
                <MentionPill
                  key={mentionBlockKey(block)}
                  label={(block as { label: string }).label}
                  kind={
                    (
                      block as {
                        mentionType:
                          | "image-model"
                          | "brand-kit-asset"
                          | "skill";
                      }
                    ).mentionType
                  }
                />
              ))}
            </span>
          )}
          {imageBlocks.length > 0 && (
            <span className="inline">
              {imageBlocks.map((block, idx) => (
                <ImagePill
                  key={imageBlockKey(block)}
                  src={toRuntimeAssetUrl((block as { url: string }).url)}
                  name={(block as { name?: string }).name ?? `image-${idx + 1}`}
                />
              ))}
            </span>
          )}
        </div>
      )}
      {!text && (imageBlocks.length > 0 || mentionBlocks.length > 0) && (
        <div
          data-chat-bubble
          className="inline-block rounded-xl bg-muted px-3 py-2.5"
        >
          {mentionBlocks.map((block, idx) => (
            <MentionPill
              key={mentionBlockKey(block)}
              label={(block as { label: string }).label}
              kind={
                (
                  block as {
                    mentionType: "image-model" | "brand-kit-asset" | "skill";
                  }
                ).mentionType
              }
            />
          ))}
          {imageBlocks.map((block, idx) => (
            <ImagePill
              key={imageBlockKey(block)}
              src={toRuntimeAssetUrl((block as { url: string }).url)}
              name={(block as { name?: string }).name ?? `image-${idx + 1}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */
/*  AssistantMessage                                                    */
/* ------------------------------------------------------------------ */

const AssistantMessage = React.memo(function AssistantMessage({
  contentBlocks,
  isStreaming,
  onOpenMediaSettings,
}: {
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
  onOpenMediaSettings?: (() => void) | undefined;
}) {
  const lastBlock = contentBlocks[contentBlocks.length - 1];
  const firstMediaCapabilityToolIds = useMemo(
    () => getFirstMediaCapabilityToolIds(contentBlocks),
    [contentBlocks],
  );

  const pendingAfterBlock = useMemo(() => {
    if (!isStreaming) return false;
    if (!lastBlock) return true;
    return lastBlock.type !== "thinking";
  }, [lastBlock, isStreaming]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col gap-2 pr-10"
    >
      {pendingAfterBlock && contentBlocks.length === 0 && (
        <PendingThinkingIndicator />
      )}
      {contentBlocks.map((block, idx) => {
        if (block.type === "thinking") {
          return (
            <ThinkingBlockView
              key={assistantBlockKey(block)}
              thinking={block.thinking}
              isStreaming={isStreaming && idx === contentBlocks.length - 1}
            />
          );
        }

        if (block.type === "text") {
          return (
            <MarkdownRenderer
              key={assistantBlockKey(block)}
              text={block.text}
            />
          );
        }

        if (block.type === "tool") {
          const capability = getMediaCapabilityKey(block);
          if (
            capability &&
            !firstMediaCapabilityToolIds.has(block.toolCallId)
          ) {
            return null;
          }

          return (
            <ToolBlockView
              key={block.toolCallId}
              block={block}
              onOpenMediaSettings={onOpenMediaSettings}
            />
          );
        }

        // ImageBlock -- skip in assistant messages (user-side only)
        return null;
      })}
      {pendingAfterBlock && contentBlocks.length > 0 && (
        <PendingThinkingIndicator />
      )}
    </motion.div>
  );
});

const PendingThinkingIndicator = React.memo(
  function PendingThinkingIndicator() {
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>{"\u601d\u8003\u4e2d"}</span>
        <span
          className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    );
  },
);
