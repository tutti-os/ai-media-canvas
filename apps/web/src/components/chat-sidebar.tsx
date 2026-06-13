"use client";

import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AgentModelSource,
  ContentBlock,
  ImageGenerationPreference,
  MessageMention,
  StreamEvent,
  ToolArtifact,
  VideoGenerationPreference,
} from "@aimc/shared";
import { useAgentModelRequirement } from "../hooks/use-agent-model-requirement";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { mapServerMessages, useChatSessions } from "../hooks/use-chat-sessions";
import {
  materializeAssistantBlocksFromEvents,
  useChatStream,
} from "../hooks/use-chat-stream";
import {
  INITIAL_AGENT_MODEL_KEY,
  INITIAL_AGENT_MODEL_SOURCE_KEY,
  INITIAL_ATTACHMENTS_KEY,
  INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
  INITIAL_VIDEO_GENERATION_PREFERENCE_KEY,
} from "../hooks/use-create-project";
import type { ReadyAttachment } from "../hooks/use-image-attachments";
import { useImageAttachments } from "../hooks/use-image-attachments";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import type { WebSocketHandle } from "../hooks/use-websocket";
import { useAppTranslation } from "../i18n";
import { fetchBrandKit } from "../lib/brand-kit-api";
import {
  type GenerationJobSubscription,
  type GenerationJobType,
  generationJobService,
} from "../lib/generation-job-service";
import {
  fetchImageModels,
  fetchRunEvents,
  saveMessage,
} from "../lib/server-api";
import type { CanvasSelectedElement } from "./canvas-editor";
import {
  type BrandKitMentionItem,
  type CanvasImageItem,
  type ImageModelMentionItem,
  MessageMentionPicker,
  type MessageMentionPickerItem,
} from "./canvas-image-picker";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { ChatTemplates } from "./chat-templates";
import { ErrorBoundary } from "./error-boundary";
import { SessionSelector } from "./session-selector";
import { SettingsDialog } from "./settings-dialog";
import { useToast } from "./toast";

type ChatSidebarProps = {
  canvasId: string;
  projectId: string;
  open: boolean;
  onToggle: () => void;
  onImageGenerated?: (artifact: ToolArtifact) => void;
  onCanvasSync?: () => void;
  /** Called for every stream event for job fallback polling. */
  onStreamEvent?: (event: StreamEvent) => void;
  initialPrompt?: string | undefined;
  initialSessionId?: string | undefined;
  onSessionChange?: (sessionId: string) => void;
  onRequestCanvasImages?: () => CanvasImageItem[];
  currentBrandKitId?: string | null;
  ws: WebSocketHandle;
  selectedCanvasElements?: CanvasSelectedElement[];
};

type DeferredMediaJob = {
  jobId: string;
  jobType: GenerationJobType;
  output: Record<string, unknown>;
};

function extractDeferredMediaJobFromOutput(
  output: Record<string, unknown> | undefined,
): DeferredMediaJob | null {
  const jobId = typeof output?.jobId === "string" ? output.jobId : null;
  const jobType =
    output?.jobType === "image_generation" ||
    output?.jobType === "video_generation"
      ? output.jobType
      : null;
  if (!jobId || !jobType || output?.status !== "generating") return null;
  if (
    typeof output.url === "string" ||
    typeof output.videoUrl === "string" ||
    typeof output.signed_url === "string"
  ) {
    return null;
  }
  return { jobId, jobType, output };
}

function extractDeferredMediaJob(event: StreamEvent): DeferredMediaJob | null {
  if (event.type !== "tool.completed") return null;
  return extractDeferredMediaJobFromOutput(
    event.output as Record<string, unknown> | undefined,
  );
}

function buildGeneratedMediaArtifact(
  job: DeferredMediaJob,
  result: Record<string, unknown>,
): ToolArtifact | null {
  const url = result.signed_url;
  const assetId = result.asset_id;
  const mimeType = result.mime_type;
  const width = result.width;
  const height = result.height;
  const title = job.output.title;
  if (
    typeof url !== "string" ||
    typeof mimeType !== "string" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }

  if (job.jobType === "video_generation") {
    const durationSeconds = result.duration_seconds;
    return {
      type: "video",
      ...(typeof assetId === "string" ? { assetId } : {}),
      ...(typeof title === "string" ? { title } : {}),
      url,
      mimeType,
      width,
      height,
      ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
      jobId: job.jobId,
    };
  }

  return {
    type: "image",
    ...(typeof assetId === "string" ? { assetId } : {}),
    ...(typeof title === "string" ? { title } : {}),
    url,
    mimeType,
    width,
    height,
    jobId: job.jobId,
  };
}

function getGenerationJobErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ChatSidebar({
  canvasId,
  projectId,
  open,
  onToggle,
  onImageGenerated,
  onCanvasSync,
  onStreamEvent,
  initialPrompt,
  initialSessionId,
  onSessionChange,
  onRequestCanvasImages,
  currentBrandKitId,
  ws,
  selectedCanvasElements,
}: ChatSidebarProps) {
  const { t } = useAppTranslation("chat");
  const breakpoint = useBreakpoint();
  const isOverlay = breakpoint !== "desktop";

  // ── Session & message management (extracted hook with LRU cache) ──
  const {
    sessions,
    activeSessionId,
    activeSessionIdRef,
    messages,
    messagesRef,
    setMessages,
    sessionsLoading,
    messagesLoading,
    streaming,
    setStreaming,
    updateSessionMessages,
    handleSelectSession,
    handleNewChat,
    handleDeleteSession,
    autoTitleSession,
    reloadMessages,
  } = useChatSessions({
    canvasId,
    initialSessionId,
    onSessionChange,
  });

  // ── Stream event handler (extracted hook, shared between send & reconnect) ──
  const { applyStreamEvent, completeToolBlockWithArtifacts, failToolBlock } =
    useChatStream(updateSessionMessages);

  // ── Mention & attachment state ──
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [messageMentions, setMessageMentions] = useState<MessageMention[]>([]);
  const [brandKitMentionItems, setBrandKitMentionItems] = useState<
    BrandKitMentionItem[]
  >([]);
  const [imageModelMentionItems, setImageModelMentionItems] = useState<
    ImageModelMentionItem[]
  >([]);
  const chatInputRef = useRef<import("./chat-input").ChatInputHandle>(null);

  const initialPromptSent = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);
  const inFlightSessionIdsRef = useRef<Set<string>>(new Set());
  const messageMentionsRef = useRef(messageMentions);
  messageMentionsRef.current = messageMentions;
  const selectedCanvasElementsRef = useRef(selectedCanvasElements);
  selectedCanvasElementsRef.current = selectedCanvasElements;
  const prevConnectedRef = useRef(false);
  const replayedArtifactKeysRef = useRef<Set<string>>(new Set());
  const chatMediaJobSubscriptionsRef = useRef<
    Map<string, GenerationJobSubscription>
  >(new Map());
  const currentCanvasIdRef = useRef(canvasId);
  currentCanvasIdRef.current = canvasId;

  useEffect(() => {
    return () => {
      for (const subscription of chatMediaJobSubscriptionsRef.current.values()) {
        subscription.unsubscribe();
      }
      chatMediaJobSubscriptionsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    setStreaming(
      Boolean(
        activeSessionId && inFlightSessionIdsRef.current.has(activeSessionId),
      ),
    );
  }, [activeSessionId, setStreaming]);

  const buildAutoTitleSource = useCallback(
    (text: string, attachments: ReadyAttachment[]) => {
      const normalized = text.trim();
      if (normalized) return normalized;

      return attachments
        .map((attachment) => attachment.name?.trim())
        .filter((name): name is string => Boolean(name))
        .join(", ");
    },
    [],
  );

  const artifactReplayKey = useCallback(
    (toolCallId: string, url: string) => `${toolCallId}:${url}`,
    [],
  );

  const hasBackendInsertedElement = useCallback((block: ContentBlock) => {
    if (block.type !== "tool" || !block.output) return false;
    return (
      typeof (block.output as Record<string, unknown>).elementId === "string"
    );
  }, []);

  const recoverMediaArtifactsFromBlocks = useCallback(
    (contentBlocks: ContentBlock[]) => {
      const canvasUrls = new Set(
        (onRequestCanvasImages ? onRequestCanvasImages() : [])
          .map((item) => item.url)
          .filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          ),
      );

      for (const block of contentBlocks) {
        if (
          block.type !== "tool" ||
          block.status !== "completed" ||
          block.toolName === "screenshot_canvas" ||
          !block.artifacts
        ) {
          continue;
        }

        for (const artifact of block.artifacts) {
          const replayKey = artifactReplayKey(block.toolCallId, artifact.url);
          if (replayedArtifactKeysRef.current.has(replayKey)) continue;
          if (hasBackendInsertedElement(block)) {
            replayedArtifactKeysRef.current.add(replayKey);
            continue;
          }
          if (canvasUrls.has(artifact.url)) {
            replayedArtifactKeysRef.current.add(replayKey);
            continue;
          }
          replayedArtifactKeysRef.current.add(replayKey);
          onImageGenerated?.(artifact);
        }
      }
    },
    [
      artifactReplayKey,
      hasBackendInsertedElement,
      onImageGenerated,
      onRequestCanvasImages,
    ],
  );

  const watchDeferredMediaJobByToolCall = useCallback(
    (job: DeferredMediaJob, sessionId: string, toolCallId: string) => {
      const subscriptionKey = `${sessionId}:${toolCallId}:${job.jobId}`;
      if (chatMediaJobSubscriptionsRef.current.has(subscriptionKey)) return;

      const subscription = generationJobService.watch(job.jobId, {
        jobType: job.jobType,
        onSucceeded: (result) => {
          const artifact = buildGeneratedMediaArtifact(job, result);
          if (!artifact) return;
          const url =
            typeof result.signed_url === "string"
              ? result.signed_url
              : undefined;
          completeToolBlockWithArtifacts(sessionId, toolCallId, [artifact], {
            ...(url ? { url } : {}),
            ...(artifact.type === "video" && url ? { videoUrl: url } : {}),
            ...(artifact.assetId ? { assetId: artifact.assetId } : {}),
            mimeType: artifact.mimeType,
            width: artifact.width,
            height: artifact.height,
          });
        },
        onFailed: (error) => {
          failToolBlock(
            sessionId,
            toolCallId,
            getGenerationJobErrorMessage(error),
          );
        },
      });

      chatMediaJobSubscriptionsRef.current.set(subscriptionKey, subscription);
      void subscription.promise
        .catch(() => {
          // Failure is rendered through onFailed on the corresponding tool block.
        })
        .finally(() => {
          chatMediaJobSubscriptionsRef.current.delete(subscriptionKey);
        });
    },
    [completeToolBlockWithArtifacts, failToolBlock],
  );

  const watchDeferredMediaJob = useCallback(
    (event: StreamEvent, sessionId: string) => {
      const job = extractDeferredMediaJob(event);
      if (!job || event.type !== "tool.completed") return;
      watchDeferredMediaJobByToolCall(job, sessionId, event.toolCallId);
    },
    [watchDeferredMediaJobByToolCall],
  );

  const watchDeferredMediaJobsFromBlocks = useCallback(
    (contentBlocks: ContentBlock[], sessionId: string) => {
      for (const block of contentBlocks) {
        if (block.type !== "tool" || block.status !== "completed") continue;
        const job = extractDeferredMediaJobFromOutput(
          block.output as Record<string, unknown> | undefined,
        );
        if (!job) continue;
        watchDeferredMediaJobByToolCall(job, sessionId, block.toolCallId);
      }
    },
    [watchDeferredMediaJobByToolCall],
  );

  const recoverPersistedMediaArtifacts = useCallback(
    (
      sessionMessages: Array<{
        contentBlocks: ContentBlock[];
        role: "user" | "assistant";
      }>,
      sessionId: string,
    ) => {
      const latestAssistantMessage = [...sessionMessages]
        .reverse()
        .find((message) => message.role === "assistant");
      if (latestAssistantMessage) {
        recoverMediaArtifactsFromBlocks(latestAssistantMessage.contentBlocks);
      }
      for (const message of sessionMessages) {
        if (message.role !== "assistant") continue;
        watchDeferredMediaJobsFromBlocks(message.contentBlocks, sessionId);
      }
    },
    [recoverMediaArtifactsFromBlocks, watchDeferredMediaJobsFromBlocks],
  );

  const {
    attachments: imageAttachments,
    addFiles,
    addCanvasRef,
    retryUpload,
    removeAttachment,
    clearAll: clearAttachments,
    isUploading,
    readyAttachments,
  } = useImageAttachments(projectId);

  const { activeImageGenerationPreference } = useImageModelPreference();
  const activeImageGenerationPreferenceRef = useRef(
    activeImageGenerationPreference,
  );
  activeImageGenerationPreferenceRef.current = activeImageGenerationPreference;
  const { activeVideoGenerationPreference } = useVideoModelPreference();
  const activeVideoGenerationPreferenceRef = useRef(
    activeVideoGenerationPreference,
  );
  activeVideoGenerationPreferenceRef.current = activeVideoGenerationPreference;

  const {
    model: agentModel,
    modelSource: agentModelSource,
    ensureAgentModelConfigured,
  } = useAgentModelRequirement();
  const agentModelRef = useRef(agentModel);
  agentModelRef.current = agentModel;
  const agentModelSourceRef = useRef(agentModelSource);
  agentModelSourceRef.current = agentModelSource;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { toast: showToast } = useToast();

  // ── Sidebar resize ──
  const SIDEBAR_MIN = 300;
  const SIDEBAR_MAX = 600;
  const SIDEBAR_KEYBOARD_STEP = 20;
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isResizing = useRef(false);

  const clampWidth = useCallback(
    (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)),
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = startX - moveEvent.clientX;
        setSidebarWidth(clampWidth(startWidth + delta));
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth, clampWidth],
  );

  // Touch support for resize handle (mobile / tablet)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      isResizing.current = true;
      const startX = touch.clientX;
      const startWidth = sidebarWidth;

      const handleTouchMove = (moveEvent: TouchEvent) => {
        if (!isResizing.current) return;
        const t = moveEvent.touches[0];
        if (!t) return;
        moveEvent.preventDefault(); // prevent scroll during resize
        const delta = startX - t.clientX;
        setSidebarWidth(clampWidth(startWidth + delta));
      };

      const handleTouchEnd = () => {
        isResizing.current = false;
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
        document.removeEventListener("touchcancel", handleTouchEnd);
      };

      document.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleTouchEnd);
      document.addEventListener("touchcancel", handleTouchEnd);
    },
    [sidebarWidth, clampWidth],
  );

  // Keyboard support for resize handle (ArrowLeft/ArrowRight)
  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSidebarWidth((prev) => clampWidth(prev + SIDEBAR_KEYBOARD_STEP));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSidebarWidth((prev) => clampWidth(prev - SIDEBAR_KEYBOARD_STEP));
      }
    },
    [clampWidth],
  );

  // ── Auto-scroll to bottom ──
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    void messages.length;
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // ── Fetch image models for @mention picker ──
  useEffect(() => {
    let cancelled = false;

    fetchImageModels()
      .then((data) => {
        if (cancelled) return;
        setImageModelMentionItems(
          data.models.map((model) => ({
            kind: "image-model",
            id: model.id,
            label: model.displayName,
            description: model.description,
            ...(model.iconUrl ? { iconUrl: model.iconUrl } : {}),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setImageModelMentionItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch brand kit items for @mention picker ──
  useEffect(() => {
    if (!currentBrandKitId) {
      setBrandKitMentionItems([]);
      return;
    }

    let cancelled = false;
    fetchBrandKit(currentBrandKitId)
      .then((kit) => {
        if (cancelled) return;
        setBrandKitMentionItems(
          kit.assets.map((asset) => ({
            kind: "brand-kit-asset" as const,
            id: asset.id,
            label: asset.display_name,
            assetType: asset.asset_type,
            ...(asset.text_content !== null
              ? { textContent: asset.text_content }
              : {}),
            ...(asset.file_url !== null ? { fileUrl: asset.file_url } : {}),
            ...((asset.asset_type === "logo" || asset.asset_type === "image") &&
            asset.file_url !== null
              ? { thumbnailUrl: asset.file_url }
              : {}),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setBrandKitMentionItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentBrandKitId]);

  // ── Send message ──
  const handleSend = useCallback(
    async (
      text: string,
      attachmentsOverride?: ReadyAttachment[],
      imageGenerationPreferenceOverride?: ImageGenerationPreference,
      videoGenerationPreferenceOverride?: VideoGenerationPreference,
      mentionsOverride?: MessageMention[],
    ) => {
      const currentSessionId = activeSessionIdRef.current;
      if (
        !currentSessionId ||
        inFlightSessionIdsRef.current.has(currentSessionId)
      ) {
        return;
      }
      inFlightSessionIdsRef.current.add(currentSessionId);
      if (activeSessionIdRef.current === currentSessionId) {
        setStreaming(true);
      }

      if (!(await ensureAgentModelConfigured())) {
        inFlightSessionIdsRef.current.delete(currentSessionId);
        if (activeSessionIdRef.current === currentSessionId) {
          setStreaming(false);
        }
        setSettingsOpen(true);
        return;
      }

      // Merge explicitly-attached images with auto-sensed canvas selection images
      let currentAttachments = attachmentsOverride ?? readyAttachments;
      const selectedEls = selectedCanvasElementsRef.current ?? [];
      const selectedImageEls = selectedEls.filter(
        (el) =>
          el.type === "image" && el.fileId && (el.storageUrl || el.dataUrl),
      );
      if (selectedImageEls.length > 0 && !attachmentsOverride) {
        const existingIds = new Set(currentAttachments.map((a) => a.assetId));
        const selectionAttachments: ReadyAttachment[] = selectedImageEls
          .filter((el) => !existingIds.has(el.id))
          .flatMap((el) => {
            const url = el.storageUrl ?? el.dataUrl;
            if (!url) return [];
            return [
              {
                assetId: el.id,
                url,
                mimeType: "image/png",
                source: "canvas-ref" as const,
                name: `Canvas selection ${el.id.slice(0, 6)}`,
              },
            ];
          });
        if (selectionAttachments.length > 0) {
          currentAttachments = [...currentAttachments, ...selectionAttachments];
        }
      }
      const currentImageGenerationPreference =
        imageGenerationPreferenceOverride ??
        activeImageGenerationPreferenceRef.current;
      const currentVideoGenerationPreference =
        videoGenerationPreferenceOverride ??
        activeVideoGenerationPreferenceRef.current;
      const currentMentions = mentionsOverride ?? messageMentionsRef.current;

      // Add user message locally
      const imageBlocks: ContentBlock[] = currentAttachments.map((a) => ({
        type: "image" as const,
        assetId: a.assetId,
        url: a.url,
        mimeType: a.mimeType,
        source: a.source,
        ...(a.name ? { name: a.name } : {}),
      }));
      const mentionBlocks: ContentBlock[] = currentMentions.map((mention) => {
        if (mention.mentionType === "image-model") {
          return {
            type: "mention" as const,
            mentionType: "image-model" as const,
            id: mention.id,
            label: mention.label,
          };
        }

        if (mention.mentionType === "skill") {
          return {
            type: "mention" as const,
            mentionType: "skill" as const,
            id: mention.id,
            label: mention.label,
            slug: mention.slug,
          };
        }

        return {
          type: "mention" as const,
          mentionType: "brand-kit-asset" as const,
          id: mention.id,
          label: mention.label,
          assetType: mention.assetType,
          ...(mention.textContent !== undefined
            ? { textContent: mention.textContent }
            : {}),
          ...(mention.fileUrl !== undefined
            ? { fileUrl: mention.fileUrl }
            : {}),
        };
      });
      const userMsg = {
        id: `user-${Date.now()}`,
        role: "user" as const,
        contentBlocks: [
          { type: "text" as const, text },
          ...mentionBlocks,
          ...imageBlocks,
        ],
      };
      updateSessionMessages(currentSessionId, (prev) => [...prev, userMsg]);

      const userMessageSave = saveMessage(currentSessionId, {
        role: "user",
        content: text,
        contentBlocks: [
          { type: "text" as const, text },
          ...mentionBlocks,
          ...imageBlocks,
        ],
      });

      // Auto-title from first user message, falling back to attachment names
      // for image-only initial runs from the home prompt.
      autoTitleSession(buildAutoTitleSource(text, currentAttachments));

      // Create assistant placeholder
      const assistantIdRef = { current: `assistant-${Date.now()}` };
      updateSessionMessages(currentSessionId, (prev) => [
        ...prev,
        {
          id: assistantIdRef.current,
          role: "assistant" as const,
          contentBlocks: [],
        },
      ]);
      if (activeSessionIdRef.current === currentSessionId) {
        setStreaming(true);
      }
      abortRef.current = false;

      try {
        await userMessageSave;

        const perf = {
          t0Send: performance.now(),
          tAck: 0,
          tFirstToken: 0,
          gotFirstToken: false,
        };

        let resolveStream: () => void;
        const streamDone = new Promise<void>((r) => {
          resolveStream = r;
        });
        const runIdRef = { current: "" };
        const runCanvasId = canvasId;

        const cleanup = ws.onEvent((entry) => {
          const event = entry.event;
          if (!runIdRef.current || event.runId !== runIdRef.current) return;
          if (abortRef.current) {
            resolveStream();
            return;
          }
          const isCurrentCanvas = currentCanvasIdRef.current === runCanvasId;
          if (!isCurrentCanvas) {
            if (
              event.type === "run.completed" ||
              event.type === "run.failed" ||
              event.type === "run.canceled"
            ) {
              resolveStream();
            }
            return;
          }

          // Track first token timing
          if (!perf.gotFirstToken && event.type === "message.delta") {
            perf.tFirstToken = performance.now();
            perf.gotFirstToken = true;
            console.log(
              `[perf] send → first token: ${(perf.tFirstToken - perf.t0Send).toFixed(0)}ms` +
                ` (ack→token: ${(perf.tFirstToken - perf.tAck).toFixed(0)}ms)`,
            );
          }

          // Apply event to messages (single source of truth — shared with reconnect)
          applyStreamEvent(event, assistantIdRef.current, currentSessionId);
          watchDeferredMediaJob(event, currentSessionId);

          // Forward event to parent for fallback job polling.
          onStreamEvent?.(event);

          // Fire canvas insertion callbacks for image/video artifacts.
          // Skip if the backend already inserted the element (elementId in output).
          const backendInserted =
            event.type === "tool.completed" &&
            event.output &&
            typeof (event.output as Record<string, unknown>).elementId ===
              "string";
          if (
            event.type === "tool.completed" &&
            event.artifacts &&
            event.toolName !== "screenshot_canvas" &&
            !backendInserted
          ) {
            for (const artifact of event.artifacts) {
              if (onImageGenerated) {
                onImageGenerated(artifact);
              }
            }
          }

          if (event.type === "canvas.sync" && onCanvasSync) {
            onCanvasSync();
          }

          // Preview model hint: suggest switching when run fails
          if (event.type === "run.failed") {
            const currentModel = agentModelRef.current ?? "";
            if (currentModel.includes("preview")) {
              showToast(
                "当前 Preview 模型请求不稳定，建议切换模型后重试",
                "error",
              );
            }
          }

          if (
            event.type === "run.completed" ||
            event.type === "run.failed" ||
            event.type === "run.canceled"
          ) {
            resolveStream();
          }
        });

        // Start run via WebSocket
        const runId = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("WebSocket ack timeout — connection may be down"));
          }, 10_000);

          ws.startRun(
            {
              sessionId: currentSessionId,
              conversationId: canvasId,
              prompt: text,
              canvasId,
              ...(currentAttachments.length > 0
                ? { attachments: currentAttachments }
                : {}),
              ...(currentMentions.length > 0
                ? { mentions: currentMentions }
                : {}),
              ...(currentImageGenerationPreference
                ? {
                    imageGenerationPreference: currentImageGenerationPreference,
                  }
                : {}),
              ...(currentVideoGenerationPreference
                ? {
                    videoGenerationPreference: currentVideoGenerationPreference,
                  }
                : {}),
              ...(agentModelRef.current
                ? { model: agentModelRef.current }
                : {}),
              ...(agentModelRef.current && agentModelSourceRef.current
                ? { modelSource: agentModelSourceRef.current }
                : {}),
            },
            (ack) => {
              clearTimeout(timeout);
              perf.tAck = performance.now();
              console.log(
                `[perf] send → ack: ${(perf.tAck - perf.t0Send).toFixed(0)}ms`,
              );
              const payloadRecord = ack.payload as Record<string, unknown>;
              const id = payloadRecord.runId as string;
              const assistantMessageId =
                typeof payloadRecord.assistantMessageId === "string"
                  ? payloadRecord.assistantMessageId
                  : null;
              if (
                assistantMessageId &&
                assistantMessageId !== assistantIdRef.current
              ) {
                const previousAssistantId = assistantIdRef.current;
                assistantIdRef.current = assistantMessageId;
                updateSessionMessages(currentSessionId, (prev) =>
                  prev.map((message) =>
                    message.id === previousAssistantId
                      ? { ...message, id: assistantMessageId }
                      : message,
                  ),
                );
              }
              runIdRef.current = id;
              resolve(id);
            },
          );
        });
        clearAttachments();
        setMessageMentions([]);

        await streamDone;
        cleanup();
      } catch {
        updateSessionMessages(currentSessionId, (prev) =>
          prev.map((m) => {
            if (m.id !== assistantIdRef.current) return m;
            const hasText = m.contentBlocks.some((b) => b.type === "text");
            if (hasText) return m;
            return {
              ...m,
              contentBlocks: [
                ...m.contentBlocks,
                { type: "text" as const, text: "Failed to get response." },
              ],
            };
          }),
        );
      } finally {
        inFlightSessionIdsRef.current.delete(currentSessionId);
        if (activeSessionIdRef.current === currentSessionId) {
          setStreaming(false);
        }
      }
    },
    [
      canvasId,
      applyStreamEvent,
      watchDeferredMediaJob,
      updateSessionMessages,
      onImageGenerated,
      onCanvasSync,
      onStreamEvent,
      readyAttachments,
      clearAttachments,
      ws,
      autoTitleSession,
      buildAutoTitleSource,
      activeSessionIdRef,
      ensureAgentModelConfigured,
      setStreaming,
      showToast,
    ],
  );

  // ── Mention picker ──
  const mentionPickerItems: MessageMentionPickerItem[] = [
    ...(onRequestCanvasImages ? onRequestCanvasImages() : []),
    ...brandKitMentionItems,
    ...imageModelMentionItems,
  ];

  const handleMentionSelect = useCallback(
    (item: MessageMentionPickerItem) => {
      if (item.kind === "canvas-image") {
        addCanvasRef({
          assetId: item.assetId,
          url: item.url,
          mimeType: item.mimeType,
          name: item.name,
        });
        return;
      }

      setMessageMentions((prev) => {
        let nextMention: MessageMention;
        if (item.kind === "image-model") {
          nextMention = {
            mentionType: "image-model",
            id: item.id,
            label: item.label,
          };
        } else {
          nextMention = {
            mentionType: "brand-kit-asset",
            id: item.id,
            label: item.label,
            assetType: item.assetType,
            ...(item.textContent !== undefined
              ? { textContent: item.textContent }
              : {}),
            ...(item.fileUrl !== undefined ? { fileUrl: item.fileUrl } : {}),
          };
        }

        if (
          prev.some(
            (m) =>
              m.mentionType === nextMention.mentionType &&
              m.id === nextMention.id,
          )
        ) {
          return prev;
        }
        return [...prev, nextMention];
      });
    },
    [addCanvasRef],
  );

  const handleRemoveMention = useCallback((mention: MessageMention) => {
    setMessageMentions((prev) =>
      prev.filter(
        (item) =>
          !(item.mentionType === mention.mentionType && item.id === mention.id),
      ),
    );
  }, []);

  // ── Auto-send initial prompt ──
  useEffect(() => {
    if (sessionsLoading || !ws.connected || initialPromptSent.current) return;

    let storedAttachments: ReadyAttachment[] | undefined;
    let storedImageGenerationPreference: ImageGenerationPreference | undefined;
    let storedVideoGenerationPreference: VideoGenerationPreference | undefined;
    let storedAgentModel: string | undefined;
    let storedAgentModelSource: AgentModelSource | undefined;
    try {
      const raw = sessionStorage.getItem(INITIAL_ATTACHMENTS_KEY);
      if (raw) {
        storedAttachments = JSON.parse(raw) as ReadyAttachment[];
        sessionStorage.removeItem(INITIAL_ATTACHMENTS_KEY);
      }

      const preferenceRaw = sessionStorage.getItem(
        INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
      );
      if (preferenceRaw) {
        storedImageGenerationPreference = JSON.parse(
          preferenceRaw,
        ) as ImageGenerationPreference;
        sessionStorage.removeItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY);
      }

      const videoPreferenceRaw = sessionStorage.getItem(
        INITIAL_VIDEO_GENERATION_PREFERENCE_KEY,
      );
      if (videoPreferenceRaw) {
        storedVideoGenerationPreference = JSON.parse(
          videoPreferenceRaw,
        ) as VideoGenerationPreference;
        sessionStorage.removeItem(INITIAL_VIDEO_GENERATION_PREFERENCE_KEY);
      }

      const modelRaw = sessionStorage.getItem(INITIAL_AGENT_MODEL_KEY);
      if (modelRaw) {
        storedAgentModel = modelRaw;
        sessionStorage.removeItem(INITIAL_AGENT_MODEL_KEY);
      }
      const modelSourceRaw = sessionStorage.getItem(
        INITIAL_AGENT_MODEL_SOURCE_KEY,
      );
      if (
        modelSourceRaw === "local-agent" ||
        modelSourceRaw === "nextop-managed" ||
        modelSourceRaw === "api-provider"
      ) {
        storedAgentModelSource = modelSourceRaw;
        sessionStorage.removeItem(INITIAL_AGENT_MODEL_SOURCE_KEY);
      }
    } catch {
      // Malformed JSON or unavailable storage
    }

    const shouldSendInitial =
      Boolean(initialPrompt) || Boolean(storedAttachments?.length);
    if (!shouldSendInitial) return;

    if (storedAgentModel) {
      agentModelRef.current = storedAgentModel;
      agentModelSourceRef.current = storedAgentModelSource ?? null;
    }

    const timer = setTimeout(() => {
      if (!activeSessionIdRef.current) return;
      initialPromptSent.current = true;
      void handleSend(
        initialPrompt ?? "",
        storedAttachments,
        storedImageGenerationPreference,
        storedVideoGenerationPreference,
      );
    }, 0);

    return () => clearTimeout(timer);
  }, [
    initialPrompt,
    sessionsLoading,
    ws.connected,
    handleSend,
    activeSessionIdRef,
  ]);

  // ── Reconnection: resume canvas binding + reload messages ──
  // Uses the shared applyStreamEvent to handle live events — no duplicated logic.
  useEffect(() => {
    if (!ws.connected || sessionsLoading) {
      if (!ws.connected) prevConnectedRef.current = false;
      return;
    }
    if (prevConnectedRef.current) return;
    prevConnectedRef.current = true;

    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    // Skip if initialPrompt effect will handle binding
    if (initialPrompt && !initialPromptSent.current) return;

    let canceled = false;
    let resumeUnsub: (() => void) | null = null;

    void (async () => {
      // Reload messages from DB (server may have persisted while disconnected)
      const reloadedMessages = await reloadMessages(sessionId);
      if (canceled) return;
      recoverPersistedMediaArtifacts(reloadedMessages, sessionId);
      const latestReloadedAssistantId =
        [...reloadedMessages]
          .reverse()
          .find((message) => message.role === "assistant")?.id ?? null;

      let resumedRunId: string | null = null;
      let resumedAssistantId: string | null = null;
      let hydratingActiveRun = false;
      const hydratedRunEventIds = new Set<string>();
      const queuedResumeEvents: Array<{
        event: StreamEvent;
        eventId?: string;
        replayed?: boolean;
        seq?: number;
      }> = [];

      const processResumedEntry = (
        entry: {
          event: StreamEvent;
          eventId?: string;
          replayed?: boolean;
          seq?: number;
        },
        assistantId: string,
      ) => {
        const evt = entry.event;
        applyStreamEvent(evt, assistantId, sessionId);
        watchDeferredMediaJob(evt, sessionId);
        if (!entry.replayed) {
          onStreamEvent?.(evt);
        }

        const backendInserted =
          evt.type === "tool.completed" &&
          evt.output &&
          typeof (evt.output as Record<string, unknown>).elementId === "string";
        if (
          evt.type === "tool.completed" &&
          evt.artifacts &&
          evt.toolName !== "screenshot_canvas" &&
          !backendInserted
        ) {
          for (const artifact of evt.artifacts) {
            const replayKey = artifactReplayKey(evt.toolCallId, artifact.url);
            if (replayedArtifactKeysRef.current.has(replayKey)) continue;
            replayedArtifactKeysRef.current.add(replayKey);
            onImageGenerated?.(artifact);
          }
        }

        if (
          evt.type === "run.completed" ||
          evt.type === "run.failed" ||
          evt.type === "run.canceled"
        ) {
          inFlightSessionIdsRef.current.delete(sessionId);
          if (activeSessionIdRef.current === sessionId) {
            setStreaming(false);
          }
        }
      };

      resumeUnsub = ws.onEvent((entry) => {
        const evt = entry.event;

        if (evt.type === "canvas.sync") {
          onCanvasSync?.();
        }

        if (
          !resumedRunId ||
          evt.runId !== resumedRunId ||
          !resumedAssistantId
        ) {
          return;
        }

        if (hydratingActiveRun) {
          queuedResumeEvents.push(entry);
          return;
        }

        if (entry.eventId && hydratedRunEventIds.has(entry.eventId)) {
          return;
        }

        processResumedEntry(entry, resumedAssistantId);
      });

      // Resume canvas binding (after DB messages are set)
      ws.resumeCanvas(canvasId, sessionId, (ack) => {
        const activeRunId = (ack.payload as Record<string, unknown>)
          .activeRunId;
        const assistantMessageId = (ack.payload as Record<string, unknown>)
          .assistantMessageId;
        if (activeRunId && typeof activeRunId === "string") {
          inFlightSessionIdsRef.current.add(sessionId);
          if (activeSessionIdRef.current === sessionId) {
            setStreaming(true);
          }

          resumedRunId = activeRunId;
          resumedAssistantId =
            typeof assistantMessageId === "string" &&
            assistantMessageId.length > 0
              ? assistantMessageId
              : latestReloadedAssistantId;
          const assistantId = resumedAssistantId ?? `resumed_${activeRunId}`;
          resumedAssistantId = assistantId;

          hydratingActiveRun = true;
          queuedResumeEvents.length = 0;

          // Must use updateSessionMessages (not setMessages) so the placeholder
          // lands in msgCacheRef as well as React state. applyStreamEvent reads
          // from the cache — if the placeholder only lives in React state, stream
          // events can't find it and the first updateSessionMessages call
          // overwrites state back to the stale cache (losing the placeholder).
          updateSessionMessages(sessionId, (prev) => {
            if (prev.some((m) => m.id === assistantId)) return prev;
            return [
              ...prev,
              {
                id: assistantId,
                role: "assistant" as const,
                contentBlocks: [],
              },
            ];
          });

          void (async () => {
            try {
              let cursor = 0;
              const entries: Awaited<
                ReturnType<typeof fetchRunEvents>
              >["events"] = [];
              while (true) {
                const response = await fetchRunEvents(activeRunId, cursor);
                entries.push(...response.events);
                if (response.done || response.nextCursor <= cursor) break;
                cursor = response.nextCursor;
              }
              if (canceled || resumedRunId !== activeRunId) return;

              hydratedRunEventIds.clear();
              for (const entry of entries) {
                if (entry.eventId) {
                  hydratedRunEventIds.add(entry.eventId);
                }
              }
              const hydratedBlocks = materializeAssistantBlocksFromEvents(
                entries.map((item) => item.event),
              );
              updateSessionMessages(sessionId, (prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? { ...message, contentBlocks: hydratedBlocks }
                    : message,
                ),
              );
              recoverMediaArtifactsFromBlocks(hydratedBlocks);
              for (const entry of entries) {
                watchDeferredMediaJob(entry.event, sessionId);
              }
            } catch (error) {
              console.warn(
                "[chat] Failed to hydrate active run from durable events:",
                error,
              );
            } finally {
              hydratingActiveRun = false;
              const pending = [...queuedResumeEvents].sort(
                (a, b) =>
                  (a.seq ?? Number.MAX_SAFE_INTEGER) -
                  (b.seq ?? Number.MAX_SAFE_INTEGER),
              );
              queuedResumeEvents.length = 0;
              for (const queuedEntry of pending) {
                if (
                  queuedEntry.eventId &&
                  hydratedRunEventIds.has(queuedEntry.eventId)
                ) {
                  continue;
                }
                processResumedEntry(queuedEntry, assistantId);
              }
            }
          })();
        }
      });
    })();

    return () => {
      canceled = true;
      resumeUnsub?.();
    };
  }, [
    ws.connected,
    ws,
    canvasId,
    sessionsLoading,
    applyStreamEvent,
    watchDeferredMediaJob,
    onStreamEvent,
    onImageGenerated,
    onCanvasSync,
    activeSessionIdRef,
    artifactReplayKey,
    recoverMediaArtifactsFromBlocks,
    recoverPersistedMediaArtifacts,
    reloadMessages,
    updateSessionMessages,
    setStreaming,
    initialPrompt,
  ]);

  // ── Collapsed state ──
  if (!open) {
    return (
      <div className="absolute right-3 top-3 z-20">
        <button
          onClick={onToggle}
          type="button"
          className="group inline-flex items-center gap-1 rounded-xl bg-card/80 backdrop-blur-sm border border-border px-2.5 py-1.5 text-xs text-foreground/60 shadow-sm hover:bg-card hover:text-foreground transition-colors cursor-pointer md:px-2.5 md:py-1.5 min-h-[36px] md:min-h-0"
        >
          <svg
            aria-hidden="true"
            className="size-4 md:size-3.5"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              fill="currentColor"
              fillOpacity={0.9}
              d="M18.25 3c2.071 0 3.946 2.16 3.946 4.23L22 15.75a3.75 3.75 0 0 1-3.75 3.75h-2.874a.25.25 0 0 0-.16.058l-2.098 1.738a1.75 1.75 0 0 1-2.24-.007l-2.065-1.73a.25.25 0 0 0-.162-.059H5.75A3.75 3.75 0 0 1 2 15.75v-9A3.75 3.75 0 0 1 5.75 3zM7.5 10q-.053 0-.104.005a1.25 1.25 0 0 0-1.14 1.117l-.006.128.007.128a1.25 1.25 0 1 0 1.37-1.371l-.02-.002A1 1 0 0 0 7.5 10m4.5 0q-.053 0-.104.005a1.25 1.25 0 0 0-1.14 1.117l-.006.128.007.128a1.25 1.25 0 1 0 1.37-1.371l-.02-.002A1 1 0 0 0 12 10m4.5 0q-.053 0-.105.005a1.25 1.25 0 0 0-1.138 1.117l-.007.128.007.128a1.25 1.25 0 1 0 1.37-1.371l-.02-.002A1 1 0 0 0 16.5 10"
            />
          </svg>
          对话
        </button>
      </div>
    );
  }

  // Shared event isolation — prevent keyboard/clipboard events from bleeding
  // into Excalidraw canvas when the sidebar has focus.
  const eventIsolationProps = {
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
    onKeyUp: (e: React.KeyboardEvent) => e.stopPropagation(),
    onCopy: (e: React.ClipboardEvent) => e.stopPropagation(),
    onCut: (e: React.ClipboardEvent) => e.stopPropagation(),
    onPaste: (e: React.ClipboardEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
  };

  // The inner panel content is shared across all breakpoints.
  // Extracted as a variable to avoid duplicating the chat UI tree
  // between overlay (mobile/tablet) and inline (desktop) render paths.
  const panelContent = (
    <>
      {/* Header */}
      <div className="flex min-h-[48px] items-center justify-between pl-4 pr-2">
        <div className="flex items-center gap-1 min-w-0">
          <h2 className="sr-only">{t("assistant.title")}</h2>
          {!sessionsLoading && (
            <SessionSelector
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={handleSelectSession}
              onNewChat={handleNewChat}
              onDelete={handleDeleteSession}
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("actions.openSettings")}
            title={t("actions.openSettings")}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title={t("actions.collapsePanel")}
            aria-label={t("actions.collapsePanel")}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M4 3.25a.75.75 0 0 1 .75.75v16a.75.75 0 0 1-1.5 0V4A.75.75 0 0 1 4 3.25m9.47 2.22a.75.75 0 0 1 1.06 0l6 6a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 1 1-1.06-1.06l4.72-4.72H8a.75.75 0 0 1 0-1.5h10.19l-4.72-4.72a.75.75 0 0 1 0-1.06"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Disconnected banner */}
      {!ws.connected && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-[pulse_1.2s_ease-in-out_infinite]" />
          <span className="text-[11px] text-muted-foreground">
            连接已断开，正在重连...
          </span>
        </div>
      )}

      {/* Messages */}
      <ErrorBoundary
        onError={(err) =>
          console.error("[chat-sidebar] message area render crashed:", err)
        }
      >
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-6 px-4 py-4"
          aria-live="polite"
          aria-relevant="additions"
        >
          {sessionsLoading || messagesLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <ChatTemplates
              onSend={(prompt) =>
                handleSend(prompt, [], undefined, undefined, [])
              }
            />
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                contentBlocks={msg.contentBlocks}
                isStreaming={
                  streaming &&
                  msg.role === "assistant" &&
                  msg === messages[messages.length - 1]
                }
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ErrorBoundary>

      {/* Input */}
      <div className="relative">
        {atQuery !== null && mentionPickerItems.length > 0 && (
          <MessageMentionPicker
            items={mentionPickerItems}
            query={atQuery}
            onSelect={(item) => {
              handleMentionSelect(item);
              chatInputRef.current?.clearAtQuery();
              setAtQuery(null);
            }}
            onClose={() => setAtQuery(null)}
          />
        )}
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          disabled={streaming || sessionsLoading}
          attachments={imageAttachments}
          canSendAttachments={readyAttachments.length > 0}
          onAddFiles={addFiles}
          onRemoveAttachment={removeAttachment}
          onRetryAttachment={retryUpload}
          isUploading={isUploading}
          onAtQuery={setAtQuery}
          mentions={messageMentions}
          onRemoveMention={handleRemoveMention}
          {...(selectedCanvasElements ? { selectedCanvasElements } : {})}
        />
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );

  // ── Mobile / Tablet: full-screen overlay with backdrop ──
  if (isOverlay) {
    return (
      <>
        {/* Semi-transparent backdrop — click to close */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop is a non-interactive dismissal layer, keyboard close is handled via Escape */}
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onToggle();
          }}
          onClick={onToggle}
          role="button"
          tabIndex={0}
        />
        {/* Chat panel — full screen on mobile, fixed-width drawer on tablet */}
        <div
          className={
            breakpoint === "mobile"
              ? "fixed inset-0 z-50 flex flex-col bg-card animate-in slide-in-from-right duration-250"
              : "fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-250"
          }
          {...eventIsolationProps}
        >
          {panelContent}
        </div>
      </>
    );
  }

  // ── Desktop: inline side-by-side with resize handle ──
  return (
    <div
      className="relative z-[120] flex h-full shrink-0"
      style={{ width: sidebarWidth }}
      {...eventIsolationProps}
    >
      {/* Resize handle -- supports mouse, touch, and keyboard (ArrowLeft/ArrowRight) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("actions.resizePanel")}
        aria-valuenow={sidebarWidth}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        tabIndex={0}
        className="w-2 shrink-0 cursor-col-resize bg-gradient-to-r from-transparent via-border to-transparent shadow-[1px_0_10px_rgba(15,23,42,0.06)] transition-all hover:via-muted-foreground/40 hover:shadow-[1px_0_14px_rgba(15,23,42,0.1)] active:via-muted-foreground/60 active:shadow-[1px_0_16px_rgba(15,23,42,0.14)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handleResizeKeyDown}
      />
      <div className="flex flex-1 flex-col bg-card min-w-0">{panelContent}</div>
    </div>
  );
}
