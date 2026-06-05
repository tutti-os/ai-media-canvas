"use client";

import { useAgentModel } from "@/hooks/use-agent-model";
import {
  type AgentModelSourceTab,
  formatLocalCliProviderLabel,
  getAgentModelSourceTab,
  isApiProvider,
  isLocalCliProvider,
} from "@/lib/agent-model-groups";
import { fetchModels, fetchWorkspaceSettings } from "@/lib/server-api";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "@/lib/workspace-settings-events";
import { Cloud, Settings2, Terminal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { LocalCliProviderIcon } from "./local-cli-provider-icon";
import { SettingsDialog } from "./settings-dialog";

type ModelOption = { id: string; name: string; provider: string };

// Sparkle icon SVG path from design spec
const SPARKLE_ICON_PATH =
  "M7.314 1.451a5.527 5.527 0 0 0 5.519 5.242v.614a5.527 5.527 0 0 0-5.519 5.242l-.007.284h-.614l-.007-.284a5.527 5.527 0 0 0-5.519-5.242v-.614a5.527 5.527 0 0 0 5.519-5.242l.007-.284h.614zm4.31 8.125c.042.835.733 1.5 1.58 1.5v.176c-.847 0-1.538.664-1.58 1.5l-.002.081h-.176l-.002-.081a1.58 1.58 0 0 0-1.579-1.5v-.176c.846 0 1.537-.665 1.58-1.5l.001-.08h.176zM7 4.204A6.6 6.6 0 0 1 4.205 7 6.6 6.6 0 0 1 7 9.795 6.6 6.6 0 0 1 9.794 7 6.6 6.6 0 0 1 7 4.204";

const CHECK_PATH =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0";

const PROVIDER_PRIORITY = [
  "agnes",
  "openai",
  "anthropic",
  "google",
  "vertex",
  "codex",
  "local",
];

function formatProviderLabel(provider: string) {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "agnes":
      return "Agnes";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google";
    case "vertex":
      return "Vertex";
    case "codex":
      return "Codex";
    case "local":
      return "Local";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

function formatDefaultModelLabel(
  modelId: string | null,
  models: ModelOption[],
) {
  if (!modelId) return null;
  const provider = getModelProvider(modelId);
  if (
    provider &&
    isLocalCliProvider(provider) &&
    modelId === `${provider}:default`
  ) {
    const concreteModel = models.find(
      (model) => model.provider === provider && model.id !== modelId,
    );
    if (concreteModel) return concreteModel.name;
  }
  const matchingModel = models.find((model) => model.id === modelId);
  if (matchingModel) return matchingModel.name;
  const [, scopedId = modelId] = modelId.split(":");
  return scopedId;
}

function resolveExecutableModelId(modelId: string, models: ModelOption[]) {
  const provider = getModelProvider(modelId);
  if (
    provider &&
    isLocalCliProvider(provider) &&
    modelId === `${provider}:default`
  ) {
    return (
      models.find((item) => item.provider === provider && item.id !== modelId)
        ?.id ?? modelId
    );
  }
  return modelId;
}

function getModelProvider(modelId: string | null | undefined) {
  return modelId?.includes(":") ? (modelId.split(":", 1)[0] ?? "") : "";
}

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "local" || provider === "codex") {
    return (
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M8 1.5 9.91 5.37l4.27.62-3.09 3.01.73 4.25L8 11.24l-3.82 2.01.73-4.25-3.09-3.01 4.27-.62L8 1.5Z" />
      </svg>
    );
  }
  return null;
}

export function AgentModelSelector({ compact }: { compact?: boolean } = {}) {
  const { model, setModel } = useAgentModel();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [workspaceDefaultModel, setWorkspaceDefaultModel] = useState<
    string | null
  >(null);
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [activeModelTab, setActiveModelTab] =
    useState<AgentModelSourceTab>("local-cli");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadModels = useCallback(() => {
    fetchModels()
      .then((data) => setModels(data.models))
      .catch(() => {});

    fetchWorkspaceSettings()
      .then((data) =>
        setWorkspaceDefaultModel(data.settings.defaultModel || null),
      )
      .catch(() => {});
  }, []);

  // Fetch available models on mount and whenever the picker opens so the
  // homepage selector stays in sync with recent settings changes.
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      loadModels();
    };
    window.addEventListener(
      WORKSPACE_SETTINGS_UPDATED_EVENT,
      handleSettingsUpdated,
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated,
      );
    };
  }, [loadModels]);

  useEffect(() => {
    if (!open) return;
    loadModels();
  }, [loadModels, open]);

  useEffect(() => {
    if (!open) return;
    setCustomModelDraft(model ?? workspaceDefaultModel ?? "");
    setActiveModelTab(getAgentModelSourceTab(model));
  }, [model, open, workspaceDefaultModel]);

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

  const selectedModel = models.find((m) => m.id === model);
  const selectedProvider = selectedModel?.provider || getModelProvider(model);
  const workspaceDefaultProvider = getModelProvider(workspaceDefaultModel);
  const triggerLocalProvider =
    selectedProvider && isLocalCliProvider(selectedProvider)
      ? selectedProvider
      : !model &&
          workspaceDefaultProvider &&
          isLocalCliProvider(workspaceDefaultProvider)
        ? workspaceDefaultProvider
        : "";
  const triggerLocalProviderLabel = triggerLocalProvider
    ? formatLocalCliProviderLabel(triggerLocalProvider)
    : null;
  const isActive = model !== null;
  const isTriggerActive = isActive || Boolean(triggerLocalProvider);
  const displayLabel =
    triggerLocalProviderLabel ??
    (selectedModel
      ? selectedModel.name
      : formatDefaultModelLabel(model, models)) ??
    "Agent";
  const defaultModelLabel = formatDefaultModelLabel(
    workspaceDefaultModel,
    models,
  );
  const trimmedCustomModelDraft = customModelDraft.trim();

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

  const visibleModels = models.filter((item) =>
    activeModelTab === "local-cli"
      ? isLocalCliProvider(item.provider)
      : isApiProvider(item.provider),
  );

  // Deduplicate provider list from actual models
  const providers = [...new Set(visibleModels.map((m) => m.provider))].sort(
    (left, right) => {
      const leftIndex = PROVIDER_PRIORITY.indexOf(left);
      const rightIndex = PROVIDER_PRIORITY.indexOf(right);
      const normalizedLeft =
        leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight =
        rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }

      return formatProviderLabel(left).localeCompare(
        formatProviderLabel(right),
      );
    },
  );

  function applyCustomModel() {
    if (!trimmedCustomModelDraft) return;
    setModel(trimmedCustomModelDraft);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center gap-1 box-border rounded-full border-[0.5px] cursor-pointer font-inter transition-[border-color,background-color] duration-100 ease-in-out ${
          compact ? "h-8 px-2.5" : "h-8 px-3"
        } ${
          isTriggerActive
            ? "border-accent bg-accent/10 text-foreground hover:bg-accent/20 active:bg-accent/30"
            : "border-border text-foreground hover:bg-muted"
        } bg-transparent`}
      >
        {triggerLocalProvider ? (
          <LocalCliProviderIcon
            provider={triggerLocalProvider}
            label={triggerLocalProviderLabel ?? displayLabel}
            className="size-4 rounded-sm"
            iconSize={15}
          />
        ) : (
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 14 14"
            className="[&_path]:fill-current"
          >
            <path fill="currentColor" d={SPARKLE_ICON_PATH} />
          </svg>
        )}
        <span className={compact ? "text-[11px]" : "text-xs"}>
          {displayLabel}
        </span>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="max-h-[min(28rem,calc(100vh-2rem))] w-56 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-2">
              <div className="text-xs font-medium text-muted-foreground">
                Assistant Mode
              </div>
              <button
                type="button"
                aria-label="Open agent settings"
                onClick={() => {
                  setOpen(false);
                  setSettingsOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings2 className="h-3 w-3" />
                Settings
              </button>
            </div>
            <div className="mb-2 grid grid-cols-2 rounded-full border border-border bg-muted/30 p-0.5">
              {[
                {
                  id: "local-cli" as const,
                  label: "Local agent",
                  icon: Terminal,
                },
                {
                  id: "api-provider" as const,
                  label: "API provider",
                  icon: Cloud,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const selected = activeModelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveModelTab(tab.id)}
                    className={`inline-flex h-8 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors ${
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {tab.label}
                  </button>
                );
              })}
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
              <span className="flex-1 text-left">
                <span className="block">Local Assistant</span>
                <span className="block text-xs text-muted-foreground">
                  {defaultModelLabel
                    ? `Uses default model: ${defaultModelLabel}`
                    : "Uses your configured default route"}
                </span>
              </span>
              {!isActive && (
                <svg
                  aria-hidden="true"
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
              const providerModels = visibleModels.filter(
                (m) => m.provider === provider,
              );
              if (providerModels.length === 0) return null;
              return (
                <div key={provider} className="mt-2">
                  <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    <ProviderLogo provider={provider} />
                    {formatProviderLabel(provider)}
                  </div>
                  {providerModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setModel(resolveExecutableModelId(m.id, models));
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
                          aria-hidden="true"
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
            {providers.length === 0 ? (
              <div className="rounded-lg px-2 py-4 text-xs text-muted-foreground">
                {activeModelTab === "local-cli"
                  ? "No local CLI models detected."
                  : "No API provider models configured."}
              </div>
            ) : null}
            {activeModelTab === "api-provider" ? (
              <form
                className="mt-3 border-t border-border pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyCustomModel();
                }}
              >
                <label
                  htmlFor="customModelId"
                  className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60"
                >
                  Custom model ID
                </label>
                <div className="mt-2 space-y-2 px-2">
                  <input
                    id="customModelId"
                    value={customModelDraft}
                    onChange={(event) =>
                      setCustomModelDraft(event.target.value)
                    }
                    placeholder="anthropic:minimax-m2.5"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={!trimmedCustomModelDraft}
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Use custom model
                  </button>
                </div>
              </form>
            ) : null}
          </div>,
          document.body,
        )}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab="agent"
      />
    </>
  );
}
