"use client";

import type {
  AgentModelSource,
  ImageGenerationPreference,
  VideoGenerationPreference,
} from "@aimc/shared";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { AgentModelSelector } from "@/components/agent-model-selector";
import { ImageAttachmentBar } from "@/components/image-attachment-bar";
import { ImageModelPreferencePopover } from "@/components/image-model-preference";
import {
  type MissingModelConfiguration,
  ModelConfigurationBanner,
} from "@/components/model-configuration-banner";
import { SettingsDialog } from "@/components/settings-dialog";
import { useAgentModelRequirement } from "@/hooks/use-agent-model-requirement";
import type {
  ImageAttachmentState,
  ReadyAttachment,
} from "@/hooks/use-image-attachments";
import { useImageModelPreference } from "@/hooks/use-image-model-preference";
import { useMediaModelConfigurationStatus } from "@/hooks/use-media-model-configuration-status";
import { useVideoModelPreference } from "@/hooks/use-video-model-preference";
import { useAppTranslation } from "@/i18n";
import type { HomeExampleSelection } from "@/lib/home-example-seeds";

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
    modelSource?: AgentModelSource,
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

function PromptToolbarTooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

function buildSeedImageAttachments(
  selectedSeed: HomeExampleSelection | null | undefined,
): ReadyAttachment[] {
  if (!selectedSeed) return [];

  return selectedSeed.inputMentions
    .filter((mention) => mention.type === "image")
    .map((mention, index) => ({
      assetId: `seed-${selectedSeed.categoryKey}-${index}-${mention.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
      url: new URL(mention.imgSrc, window.location.origin).href,
      mimeType: inferImageMimeType(mention.imgSrc),
      source: "upload" as const,
      name: mention.name,
    }));
}

function inferImageMimeType(src: string): string {
  const path = src.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.startsWith("data:image/svg+xml")) return "image/svg+xml";
  return "image/png";
}

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
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<
      "agent" | "media"
    >("agent");
    const { t } = useAppTranslation("home");
    const agentBtnRef = useRef<HTMLButtonElement>(null);
    const { preference } = useImageModelPreference();
    const { preference: videoPreference } = useVideoModelPreference();
    const agentRequirement = useAgentModelRequirement();
    const {
      isAgentModelConfigured,
      model: agentModel,
      modelSource: agentModelSource,
      ensureAgentModelConfigured,
    } = agentRequirement;
    const { missingImageModel, missingVideoModel } =
      useMediaModelConfigurationStatus();
    const isAgentModelConfigurationLoaded =
      agentRequirement.isAgentModelConfigurationLoaded ?? true;
    const missingModelConfiguration = useMemo(() => {
      const missing: MissingModelConfiguration[] = [];
      if (isAgentModelConfigurationLoaded && !isAgentModelConfigured) {
        missing.push("agent");
      }
      if (missingImageModel) missing.push("image");
      if (missingVideoModel) missing.push("video");
      return missing;
    }, [
      isAgentModelConfigurationLoaded,
      isAgentModelConfigured,
      missingImageModel,
      missingVideoModel,
    ]);
    const seedImageMentions =
      selectedSeed?.inputMentions.filter(
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

    const handleSubmit = useCallback(async () => {
      const trimmed = value.trim();
      if (
        (!trimmed &&
          (!attachments || attachments.length === 0) &&
          !selectedSeed) ||
        disabled ||
        isUploading
      ) {
        return;
      }

      if (!(await ensureAgentModelConfigured())) {
        setSettingsInitialTab("agent");
        setSettingsOpen(true);
        return;
      }

      const seedAttachments = buildSeedImageAttachments(selectedSeed);
      const mergedAttachments = [
        ...(readyAttachments ?? []),
        ...seedAttachments,
      ];

      onSubmit(
        trimmed,
        mergedAttachments.length > 0 ? mergedAttachments : undefined,
        !missingImageModel &&
          preference.mode === "manual" &&
          preference.models.length > 0
          ? preference
          : undefined,
        !missingVideoModel &&
          videoPreference.mode === "manual" &&
          videoPreference.models.length > 0
          ? videoPreference
          : undefined,
        agentModel ?? undefined,
        agentModel ? agentModelSource ?? undefined : undefined,
      );
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [
      agentModel,
      agentModelSource,
      attachments,
      disabled,
      ensureAgentModelConfigured,
      isUploading,
      onSubmit,
      preference,
      readyAttachments,
      selectedSeed,
      videoPreference,
      value,
      missingImageModel,
      missingVideoModel,
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

    const handleOpenMediaSettings = useCallback(() => {
      setModelPopoverOpen(false);
      setSettingsInitialTab("media");
      setSettingsOpen(true);
    }, []);

    const handleOpenAgentSettings = useCallback(() => {
      setModelPopoverOpen(false);
      setSettingsInitialTab("agent");
      setSettingsOpen(true);
    }, []);

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
      <div className="space-y-2">
        <ModelConfigurationBanner
          missing={missingModelConfiguration}
          onConfigureAgent={handleOpenAgentSettings}
          onConfigureMedia={handleOpenMediaSettings}
        />
        <div className="overflow-visible rounded-xl border-[0.5px] border-border bg-muted shadow-[0_4px_8px_rgba(0,0,0,0.04)] sm:rounded-2xl">
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
                    {t("prompt.clear")}
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
            placeholder={t("prompt.placeholder")}
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
                    aria-label={t("prompt.attachImages")}
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox={toolbarButtons[0].viewBox}
                      className="h-4 w-4 fill-current"
                    >
                      <path d={toolbarButtons[0].path} />
                    </svg>
                    <PromptToolbarTooltip label={t("prompt.attachImages")} />
                  </button>
                </>
              ) : null}

              <button
                ref={agentBtnRef}
                type="button"
                aria-label={t("prompt.modelPreference")}
                onClick={() => setModelPopoverOpen((current) => !current)}
                className="group relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <svg
                  aria-hidden="true"
                  viewBox={toolbarButtons[1].viewBox}
                  className="h-4 w-4 fill-current"
                >
                  <path d={toolbarButtons[1].path} />
                </svg>
                <PromptToolbarTooltip label={t("prompt.modelPreference")} />
              </button>

              <div className="ml-1">
                <AgentModelSelector compact tooltipPlacement="bottom" />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || isUploading || !hasContent}
              aria-label={t("prompt.submit")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/25"
            >
              <svg
                aria-hidden="true"
                viewBox={submitIcon.viewBox}
                className="h-4 w-4 fill-current"
              >
                <path d={submitIcon.path} />
              </svg>
            </button>
          </div>

          <ImageModelPreferencePopover
            open={modelPopoverOpen}
            onClose={() => setModelPopoverOpen(false)}
            anchorRef={agentBtnRef}
            onOpenSettings={handleOpenMediaSettings}
          />
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            initialTab={settingsInitialTab}
          />
        </div>
      </div>
    );
  },
);
