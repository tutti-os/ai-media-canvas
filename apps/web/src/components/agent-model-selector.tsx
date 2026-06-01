"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAgentModel } from "@/hooks/use-agent-model";
import { fetchModels } from "@/lib/server-api";

type ModelOption = { id: string; name: string; provider: string };

// Sparkle icon SVG path from design spec
const SPARKLE_ICON_PATH =
  "M7.314 1.451a5.527 5.527 0 0 0 5.519 5.242v.614a5.527 5.527 0 0 0-5.519 5.242l-.007.284h-.614l-.007-.284a5.527 5.527 0 0 0-5.519-5.242v-.614a5.527 5.527 0 0 0 5.519-5.242l.007-.284h.614zm4.31 8.125c.042.835.733 1.5 1.58 1.5v.176c-.847 0-1.538.664-1.58 1.5l-.002.081h-.176l-.002-.081a1.58 1.58 0 0 0-1.579-1.5v-.176c.846 0 1.537-.665 1.58-1.5l.001-.08h.176zM7 4.204A6.6 6.6 0 0 1 4.205 7 6.6 6.6 0 0 1 7 9.795 6.6 6.6 0 0 1 9.794 7 6.6 6.6 0 0 1 7 4.204";

const CHECK_PATH =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0";

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "local") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5 9.91 5.37l4.27.62-3.09 3.01.73 4.25L8 11.24l-3.82 2.01.73-4.25-3.09-3.01 4.27-.62L8 1.5Z" />
      </svg>
    );
  }
  return null;
}

export function AgentModelSelector({ compact }: { compact?: boolean } = {}) {
  const { model, setModel } = useAgentModel();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch available models
  useEffect(() => {
    fetchModels()
      .then((data) => setModels(data.models))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const isActive = model !== null;
  const selectedModel = models.find((m) => m.id === model);
  const displayLabel = selectedModel ? selectedModel.name : "Agent";

  // Auto-positioning popover (above or below based on available space)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const popoverHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < popoverHeight && rect.top > spaceBelow;

    if (openAbove) {
      setPopoverStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        zIndex: 9999,
      });
    } else {
      setPopoverStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left: rect.left,
        zIndex: 9999,
      });
    }
  }, [open]);

  // Deduplicate provider list from actual models
  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center gap-1 box-border rounded-full border-[0.5px] cursor-pointer font-inter transition-[border-color,background-color] duration-100 ease-in-out ${
          compact ? "h-8 px-2.5" : "h-8 px-3"
        } ${
          isActive
            ? "border-accent bg-accent/10 text-foreground hover:bg-accent/20 active:bg-accent/30"
            : "border-border text-foreground hover:bg-muted"
        } bg-transparent`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          fill="none"
          viewBox="0 0 14 14"
          className="[&_path]:fill-current"
        >
          <path fill="currentColor" d={SPARKLE_ICON_PATH} />
        </svg>
        <span className={compact ? "text-[11px]" : "text-xs"}>{displayLabel}</span>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="w-56 rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              Assistant Mode
            </div>
            {/* Auto option */}
            <button
              type="button"
              onClick={() => {
                setModel(null);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                !isActive
                  ? "bg-accent/10 text-accent-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <span className="flex-1 text-left">Local Assistant (recommended)</span>
              {!isActive && (
                <svg
                  className="h-3 w-3 text-accent-foreground"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d={CHECK_PATH} />
                </svg>
              )}
            </button>
            {/* Group by provider */}
            {providers.map((provider) => {
              const providerModels = models.filter(
                (m) => m.provider === provider,
              );
              if (providerModels.length === 0) return null;
              return (
                <div key={provider} className="mt-2">
                  <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    <ProviderLogo provider={provider} />
                    {provider === "local"
                      ? "Local"
                      : provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </div>
                  {providerModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setModel(m.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                        model === m.id
                          ? "bg-accent/10 text-accent-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="flex-1 text-left">{m.name}</span>
                      {model === m.id && (
                        <svg
                          className="h-3 w-3 text-accent-foreground"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d={CHECK_PATH} />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
