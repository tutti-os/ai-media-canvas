"use client";

import { Film, Settings2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import { useAppTranslation } from "../i18n";
import { isMediaProviderConfigured } from "../lib/media-provider-configuration";
import { formatProviderLabel } from "../lib/provider-labels";
import type { ImageModelInfo } from "../lib/server-api";
import type { VideoModelInfo } from "../lib/server-api";
import {
  fetchImageModels,
  fetchVideoModels,
  fetchWorkspaceSettings,
} from "../lib/server-api";

export function ImageModelPreferencePopover({
  open,
  onClose,
  anchorRef,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  onOpenSettings?: () => void;
}) {
  const { t } = useAppTranslation("chat");
  const { preference, setMode, toggleModel } = useImageModelPreference();
  const {
    preference: videoPreference,
    setMode: setVideoMode,
    toggleModel: toggleVideoModel,
  } = useVideoModelPreference();
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [videoModels, setVideoModels] = useState<VideoModelInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"image" | "video">("image");
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);
  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      setPos(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const popoverHeight = 400;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < popoverHeight && rect.top > spaceBelow;
    const nextPos = {
      top: openAbove ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, rect.right - 380),
      above: openAbove,
    };
    setPos((current) =>
      current &&
      current.top === nextPos.top &&
      current.left === nextPos.left &&
      current.above === nextPos.above
        ? current
        : nextPos,
    );
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function refreshModels() {
      try {
        const [imageData, videoData, settingsData] = await Promise.all([
          fetchImageModels(),
          fetchVideoModels(),
          fetchWorkspaceSettings(),
        ]);
        if (cancelled) return;

        setModels(
          imageData.models.filter((model) =>
            isMediaProviderConfigured(
              model.provider,
              "image",
              settingsData.settings,
            ),
          ),
        );
        setVideoModels(
          videoData.models.filter((model) =>
            isMediaProviderConfigured(
              model.provider,
              "video",
              settingsData.settings,
            ),
          ),
        );
      } catch {
        if (cancelled) return;
        setModels([]);
        setVideoModels([]);
      }
    }

    void refreshModels();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Calculate position — auto-detect direction based on available space
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    let frame = 0;
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    };
    const options = { capture: true, passive: true } as const;

    window.addEventListener("scroll", scheduleUpdate, options);
    window.addEventListener("resize", scheduleUpdate, options);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate, options);
    window.visualViewport?.addEventListener("resize", scheduleUpdate, options);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate, options);
      window.removeEventListener("resize", scheduleUpdate, options);
      window.visualViewport?.removeEventListener(
        "scroll",
        scheduleUpdate,
        options,
      );
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleUpdate,
        options,
      );
    };
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !pos) return null;

  const currentPreference =
    activeTab === "image" ? preference : videoPreference;
  const currentModels = activeTab === "image" ? models : videoModels;
  const currentSetMode = activeTab === "image" ? setMode : setVideoMode;
  const currentToggleModel =
    activeTab === "image" ? toggleModel : toggleVideoModel;
  const handleOpenSettings = () => {
    onClose();
    onOpenSettings?.();
  };

  return createPortal(
    <div
      ref={popoverRef}
      data-testid="image-model-preference-popover"
      style={{
        top: pos.above ? undefined : pos.top,
        bottom: pos.above ? window.innerHeight - pos.top : undefined,
        left: pos.left,
      }}
      className="fixed z-[9999] w-[380px] rounded-xl border-[0.5px] border-border bg-card p-1 shadow-card"
    >
      <div className="flex flex-col gap-3 py-2">
        <div className="px-3">
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["image", "video"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "image"
                  ? t("mediaModelPreference.tabs.image")
                  : t("mediaModelPreference.tabs.video")}
              </button>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {activeTab === "image"
                ? t("mediaModelPreference.title.image")
                : t("mediaModelPreference.title.video")}
            </span>
            <div className="flex items-center gap-1.5">
              {onOpenSettings ? (
                <button
                  type="button"
                  aria-label={t("mediaModelPreference.openSettings")}
                  onClick={handleOpenSettings}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  currentSetMode(
                    currentPreference.mode === "auto" ? "manual" : "auto",
                  )
                }
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  currentPreference.mode === "auto"
                    ? "bg-accent/15 text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    currentPreference.mode === "auto"
                      ? "bg-accent"
                      : "bg-muted-foreground"
                  }`}
                />
                {currentPreference.mode === "auto"
                  ? t("mediaModelPreference.mode.auto")
                  : t("mediaModelPreference.mode.manual")}
              </button>
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {currentPreference.mode === "auto"
              ? activeTab === "image"
                ? t("mediaModelPreference.description.autoImage")
                : t("mediaModelPreference.description.autoVideo")
              : activeTab === "image"
                ? t("mediaModelPreference.description.manualImage")
                : t("mediaModelPreference.description.manualVideo")}
          </span>
        </div>

        {/* Model list */}
        <div className="scrollbar-hidden max-h-[300px] space-y-0.5 overflow-y-auto px-1">
          {currentModels.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
              <span>
                {activeTab === "image"
                  ? t("mediaModelPreference.empty.image")
                  : t("mediaModelPreference.empty.video")}
              </span>
              {onOpenSettings ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleOpenSettings}
                >
                  <Settings2 data-icon="inline-start" />
                  {t("mediaModelPreference.configure")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {currentModels.map((m) => {
            const selected = currentPreference.models.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => currentToggleModel(m.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                  selected
                    ? "bg-accent/10 hover:bg-accent/15"
                    : "hover:bg-muted"
                }`}
              >
                {m.iconUrl && (
                  <img
                    src={m.iconUrl}
                    alt={m.displayName}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="flex flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">
                      {m.displayName}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {formatProviderLabel(m.provider)}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
                    {activeTab === "video" ? (
                      <Film className="h-3 w-3 shrink-0" />
                    ) : null}
                    {m.description}
                  </span>
                </div>
                {selected && (
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-accent-foreground"
                    viewBox="0 0 14 14"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.08 3.087a.583.583 0 0 1 0 .825L5.661 10.33a.583.583 0 0 1-.824 0L1.92 7.412a.583.583 0 0 1 .825-.825L5.25 9.092l6.004-6.005a.583.583 0 0 1 .825 0"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
