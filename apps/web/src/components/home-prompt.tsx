"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  ImageGenerationPreference,
  VideoGenerationPreference,
} from "@aimc/shared";

import type {
  ImageAttachmentState,
  ReadyAttachment,
} from "@/hooks/use-image-attachments";
import type { HomeExampleSelection } from "@/lib/home-example-seeds";
import { AgentModelSelector } from "@/components/agent-model-selector";
import { ImageAttachmentBar } from "@/components/image-attachment-bar";
import { ImageModelPreferencePopover } from "@/components/image-model-preference";
import { useAgentModel } from "@/hooks/use-agent-model";
import { useImageModelPreference } from "@/hooks/use-image-model-preference";
import { useVideoModelPreference } from "@/hooks/use-video-model-preference";

export type HomePromptHandle = {
  fill: (text: string) => void;
};

type HomePromptProps = {
  onSubmit: (
    prompt: string,
    attachments?: ReadyAttachment[],
    imageGenerationPreference?: ImageGenerationPreference,
    videoGenerationPreference?: VideoGenerationPreference,
    model?: string,
  ) => void;
  disabled?: boolean;
  attachments?: ImageAttachmentState[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  isUploading?: boolean;
  readyAttachments?: ReadyAttachment[];
  selectedSeed?: HomeExampleSelection | null;
  onClearSelectedSeed?: () => void;
};

const toolbarButtons = [
  {
    name: "Attach",
    viewBox: "0 0 24 24",
    path: "M16 1.1A4.9 4.9 0 0 1 20.9 6a4.9 4.9 0 0 1-1.429 3.457h.001l-8.414 8.587-.007.006a2.9 2.9 0 0 1-3.887.193l-.213-.192a2.9 2.9 0 0 1-.007-4.095l8.414-8.586a.9.9 0 0 1 1.286 1.26L8.23 15.216l-.007.006a1.1 1.1 0 0 0 1.556 1.555l8.407-8.579.007-.007a3.1 3.1 0 0 0 .105-4.271l-.105-.112a3.1 3.1 0 0 0-4.384 0L5.4 12.387l-.007.006a5.1 5.1 0 0 0 7.214 7.213l7.749-7.934a.9.9 0 0 1 1.288 1.256l-7.753 7.938q-.005.007-.012.014a6.9 6.9 0 0 1-9.758-9.76l8.408-8.578.007-.007A4.9 4.9 0 0 1 16 1.1",
  },
  {
    name: "Agent",
    viewBox: "0 0 24 24",
    path: "M10.8 1.307a2.33 2.33 0 0 1 2.4 0l7.67 4.602A2.33 2.33 0 0 1 22 7.907v8.361a2.33 2.33 0 0 1-1.13 1.998l-7.67 4.602-.141.078a2.33 2.33 0 0 1-2.258-.078l-7.67-4.602A2.33 2.33 0 0 1 2 16.268V7.907a2.33 2.33 0 0 1 1.003-1.915l.128-.083z",
  },
] as const;

const submitIcon = {
  viewBox: "0 0 24 24",
  path: "M11.293 3.293a1 1 0 0 1 1.414 0l8 8a1 1 0 0 1-1.414 1.414L13 6.414V20a1 1 0 1 1-2 0V6.414l-6.293 6.293a1 1 0 0 1-1.414-1.414z",
};

export const HomePrompt = forwardRef<HomePromptHandle, HomePromptProps>(
  function HomePrompt(
    {
      onSubmit,
      disabled,
      attachments,
      onAddFiles,
      onRemoveAttachment,
      isUploading,
      readyAttachments,
      selectedSeed,
      onClearSelectedSeed,
    },
    ref,
  ) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
    const agentBtnRef = useRef<HTMLButtonElement>(null);
    const { preference } = useImageModelPreference();
    const { preference: videoPreference } = useVideoModelPreference();
    const { model: agentModel } = useAgentModel();
    const seedImageMentions = selectedSeed?.inputMentions.filter(
      (mention) => mention.type === "image",
    ) ?? [];

    useImperativeHandle(ref, () => ({
      fill(text: string) {
        setValue(text);
        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;
          textarea.focus();
        });
      },
    }));

    const hasContent =
      value.trim().length > 0 || (attachments && attachments.length > 0);

    const handleSubmit = useCallback(() => {
      const trimmed = value.trim();
      if (
        (!trimmed && (!attachments || attachments.length === 0) && !selectedSeed) ||
        disabled ||
        isUploading
      ) {
        return;
      }

      const mergedAttachments =
        readyAttachments && readyAttachments.length > 0
          ? [...readyAttachments]
          : undefined;

      onSubmit(
        trimmed,
        mergedAttachments,
        preference.mode === "manual" && preference.models.length > 0
          ? preference
          : undefined,
        videoPreference.mode === "manual" && videoPreference.models.length > 0
          ? videoPreference
          : undefined,
        agentModel ?? undefined,
      );
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [
      agentModel,
      attachments,
      disabled,
      isUploading,
      onSubmit,
      preference,
      readyAttachments,
      selectedSeed,
      videoPreference,
      value,
    ]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit],
    );

    const handlePaste = useCallback(
      (event: React.ClipboardEvent) => {
        if (!onAddFiles) return;
        const files = Array.from(event.clipboardData.items)
          .filter((item) => item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (files.length > 0) {
          event.preventDefault();
          onAddFiles(files);
        }
      },
      [onAddFiles],
    );

    const handleInput = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

    return (
      <div className="overflow-hidden rounded-xl border-[0.5px] border-border bg-muted shadow-[0_4px_8px_rgba(0,0,0,0.04)] sm:rounded-2xl">
        {attachments && onRemoveAttachment ? (
          <ImageAttachmentBar
            attachments={attachments}
            onRemove={onRemoveAttachment}
          />
        ) : null}

        {selectedSeed ? (
          <div className="flex flex-col gap-3 border-b border-border/80 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <div className="inline-flex w-fit items-center rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {selectedSeed.categoryLabel}
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {selectedSeed.title}
                </p>
              </div>

              {onClearSelectedSeed ? (
                <button
                  type="button"
                  onClick={onClearSelectedSeed}
                  className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  清除
                </button>
              ) : null}
            </div>

            {seedImageMentions.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                {seedImageMentions.map((mention) => (
                  <div
                    key={`${selectedSeed.title}-${mention.imgSrc}`}
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
                  >
                    <img
                      src={mention.imgSrc}
                      alt={mention.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onInput={handleInput}
          placeholder="让 AI Media Canvas 帮你设计..."
          disabled={disabled}
          rows={2}
          className="w-full resize-none bg-transparent px-3 pt-3 pb-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 sm:px-4 sm:pt-4"
        />

        <div className="flex items-center justify-between px-2 pb-2 sm:px-3 sm:pb-3">
          <div className="flex items-center gap-0.5">
            {onAddFiles ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) {
                      onAddFiles(Array.from(files));
                      event.target.value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="添加图片附件"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <svg viewBox={toolbarButtons[0].viewBox} className="h-4 w-4 fill-current">
                    <path d={toolbarButtons[0].path} />
                  </svg>
                </button>
              </>
            ) : null}

            <button
              ref={agentBtnRef}
              type="button"
              aria-label="图片生成偏好"
              onClick={() => setModelPopoverOpen((current) => !current)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <svg viewBox={toolbarButtons[1].viewBox} className="h-4 w-4 fill-current">
                <path d={toolbarButtons[1].path} />
              </svg>
            </button>

            <div className="ml-1">
              <AgentModelSelector compact />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || isUploading || !hasContent}
            aria-label="提交 prompt"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/25"
          >
            <svg viewBox={submitIcon.viewBox} className="h-4 w-4 fill-current">
              <path d={submitIcon.path} />
            </svg>
          </button>
        </div>

        <ImageModelPreferencePopover
          open={modelPopoverOpen}
          onClose={() => setModelPopoverOpen(false)}
          anchorRef={agentBtnRef}
        />
      </div>
    );
  },
);
