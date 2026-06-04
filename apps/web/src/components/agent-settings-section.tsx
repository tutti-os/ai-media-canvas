"use client";

import { Cloud, RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ModelInfo, WorkspaceSettings } from "@aimc/shared";

import {
  type AgentModelSourceTab,
  formatLocalCliProviderLabel,
  isApiProvider,
  isLocalCliProvider,
} from "@/lib/agent-model-groups";
import { fetchModels } from "@/lib/server-api";
import { AgnesQuickstartHint } from "./agnes-quickstart-hint";
import { LocalCliProviderIcon } from "./local-cli-provider-icon";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface AgentSettingsSectionProps {
  settings: WorkspaceSettings;
  onSave: (settings: WorkspaceSettings) => Promise<void>;
  surface?: "page" | "dialog";
}

type AgentProtocolId = "agnes" | "openai" | "google" | "vertex" | "anthropic";

type ProviderModels = WorkspaceSettings["providerModels"];
type LocalCliProviderGroup = {
  provider: string;
  label: string;
  models: ModelInfo[];
};
type LocalCliProviderDisplayGroup = LocalCliProviderGroup & {
  installed: boolean;
};
type ApiProviderPreset = {
  provider: AgentProtocolId;
  label: string;
  baseUrl: string;
  model: string;
  models: string[];
};

const CUSTOM_LOCAL_MODEL_VALUE = "__custom__";
const LOCAL_CLI_PROVIDER_ORDER = [
  "codex",
  "claude",
  "gemini",
  "opencode",
  "qwen",
  "kimi",
  "cursor",
  "devin",
  "hermes",
  "kiro",
  "kilo",
  "qoder",
  "vibe",
];
const PINNED_LOCAL_CLI_PROVIDERS = ["codex", "claude"];

const AGENT_PROTOCOLS: Array<{
  id: AgentProtocolId;
  label: string;
  description: string;
}> = [
  {
    id: "agnes",
    label: "Agnes",
    description: "Agnes OpenAI-compatible chat route",
  },
  {
    id: "openai",
    label: "OpenAI-compatible",
    description: "OpenAI and OpenAI-compatible gateways",
  },
  {
    id: "google",
    label: "Google Gemini",
    description: "Google API key route for Gemini models",
  },
  {
    id: "vertex",
    label: "Vertex AI",
    description:
      "Google Cloud hosted route for Gemini and Vertex-backed models",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude API route for Anthropic-hosted models",
  },
];

const API_PROVIDER_PRESETS: ApiProviderPreset[] = [
  {
    provider: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
  },
  {
    provider: "anthropic",
    label: "DeepSeek - Anthropic",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-chat",
    models: [
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ],
  },
  {
    provider: "anthropic",
    label: "MiniMax - Anthropic",
    baseUrl: "https://api.minimaxi.com/anthropic",
    model: "MiniMax-M2.7-highspeed",
    models: [
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.7",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2",
    ],
  },
  {
    provider: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  },
  {
    provider: "openai",
    label: "DeepSeek - OpenAI",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    models: [
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ],
  },
  {
    provider: "openai",
    label: "MiniMax - OpenAI",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M2.7-highspeed",
    models: [
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.7",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2",
    ],
  },
  {
    provider: "openai",
    label: "MiMo (Xiaomi) - OpenAI",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    model: "mimo-v2.5-pro",
    models: ["mimo-v2.5-pro"],
  },
  {
    provider: "anthropic",
    label: "MiMo (Xiaomi) - Anthropic",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    model: "mimo-v2.5-pro",
    models: ["mimo-v2.5-pro"],
  },
];

function getInitialProtocol(settings: WorkspaceSettings): AgentProtocolId {
  const provider = settings.defaultModel.split(":")[0];
  if (
    provider === "agnes" ||
    provider === "google" ||
    provider === "vertex" ||
    provider === "anthropic"
  ) {
    return provider;
  }
  return "openai";
}

function buildModelId(provider: AgentProtocolId, value: string): string {
  return value.includes(":") ? value : `${provider}:${value}`;
}

function getModelName(provider: AgentProtocolId, value: string): string {
  const prefix = `${provider}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function getProviderModelIds(
  settings: WorkspaceSettings,
  provider: AgentProtocolId,
): string[] {
  return settings.providerModels?.[provider] ?? [];
}

function updateProviderModelList(
  current: ProviderModels,
  provider: AgentProtocolId,
  nextValues: string[],
): ProviderModels {
  return {
    ...current,
    [provider]: nextValues,
  };
}

function getProviderLabel(provider: AgentProtocolId): string {
  return (
    AGENT_PROTOCOLS.find((protocol) => protocol.id === provider)?.label ??
    provider
  );
}

function getModelProvider(modelId: string) {
  return modelId.includes(":") ? (modelId.split(":", 1)[0] ?? "") : "";
}

function getLocalCliModelDisplayName(model: ModelInfo) {
  const providerLabel = formatLocalCliProviderLabel(model.provider);
  if (model.name && model.name !== providerLabel) return model.name;
  const prefix = `${model.provider}:`;
  return model.id.startsWith(prefix) ? model.id.slice(prefix.length) : model.id;
}

function buildLocalCliModelId(provider: string, value: string) {
  return value.includes(":") ? value : `${provider}:${value}`;
}

function groupLocalCliModels(models: ModelInfo[]): LocalCliProviderGroup[] {
  const groups = new Map<string, LocalCliProviderGroup>();

  for (const model of models) {
    const existing = groups.get(model.provider);
    if (existing) {
      existing.models.push(model);
    } else {
      groups.set(model.provider, {
        provider: model.provider,
        label: formatLocalCliProviderLabel(model.provider),
        models: [model],
      });
    }
  }

  return Array.from(groups.values()).sort((first, second) => {
    const firstIndex = LOCAL_CLI_PROVIDER_ORDER.indexOf(first.provider);
    const secondIndex = LOCAL_CLI_PROVIDER_ORDER.indexOf(second.provider);
    const firstRank =
      firstIndex === -1 ? LOCAL_CLI_PROVIDER_ORDER.length : firstIndex;
    const secondRank =
      secondIndex === -1 ? LOCAL_CLI_PROVIDER_ORDER.length : secondIndex;

    if (firstRank !== secondRank) return firstRank - secondRank;
    return first.label.localeCompare(second.label);
  });
}

function getLocalCliProviderDefaultModel(group: LocalCliProviderGroup) {
  return (
    group.models.find((model) => model.id === `${group.provider}:default`) ??
    group.models[0] ??
    null
  );
}

function getFirstConfiguredModel(providerModels: ProviderModels): string {
  for (const protocol of AGENT_PROTOCOLS) {
    const firstModel = providerModels[protocol.id]?.[0];
    if (firstModel) return firstModel;
  }
  return "";
}

function applyProviderModelUpdate(
  current: WorkspaceSettings,
  provider: AgentProtocolId,
  nextValues: string[],
): WorkspaceSettings {
  const normalizedValues = Array.from(
    new Set(
      nextValues
        .map((value) => buildModelId(provider, value.trim()))
        .filter(Boolean),
    ),
  );
  const providerModels = updateProviderModelList(
    current.providerModels,
    provider,
    normalizedValues,
  );
  const allConfiguredModels = AGENT_PROTOCOLS.flatMap(
    (protocol) => providerModels[protocol.id],
  );

  return {
    ...current,
    providerModels,
    defaultModel: allConfiguredModels.includes(current.defaultModel)
      ? current.defaultModel
      : getFirstConfiguredModel(providerModels),
  };
}

function getApiProviderBaseUrl(
  settings: WorkspaceSettings,
  provider: AgentProtocolId,
) {
  if (provider === "openai") return settings.openAIApiBase;
  if (provider === "anthropic") return settings.anthropicBaseUrl;
  return "";
}

function withApiProviderBaseUrl(
  settings: WorkspaceSettings,
  provider: AgentProtocolId,
  baseUrl: string,
): WorkspaceSettings {
  if (provider === "openai") return { ...settings, openAIApiBase: baseUrl };
  if (provider === "anthropic") return { ...settings, anthropicBaseUrl: baseUrl };
  return settings;
}

function applyApiProviderPreset(
  current: WorkspaceSettings,
  provider: AgentProtocolId,
  preset: ApiProviderPreset | null,
): WorkspaceSettings {
  const modelIds = preset
    ? preset.models.map((model) => buildModelId(provider, model))
    : [];
  const providerModels = updateProviderModelList(
    current.providerModels,
    provider,
    modelIds,
  );
  const defaultModel = preset
    ? buildModelId(provider, preset.model)
    : getModelProvider(current.defaultModel) === provider
      ? getFirstConfiguredModel(providerModels)
      : current.defaultModel;

  return withApiProviderBaseUrl(
    {
      ...current,
      providerModels,
      defaultModel,
    },
    provider,
    preset?.baseUrl ?? "",
  );
}

function QuickFillProviderField({
  provider,
  settings,
  onChange,
}: {
  provider: AgentProtocolId;
  settings: WorkspaceSettings;
  onChange: (preset: ApiProviderPreset | null) => void;
}) {
  const presets = API_PROVIDER_PRESETS.filter(
    (preset) => preset.provider === provider,
  );
  if (presets.length === 0) return null;

  const currentBaseUrl = getApiProviderBaseUrl(settings, provider);
  const selectedPreset = presets.find(
    (preset) => preset.baseUrl === currentBaseUrl,
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={`${provider}QuickFillProvider`}>
        Quick fill provider
      </Label>
      <select
        id={`${provider}QuickFillProvider`}
        aria-label="Quick fill provider"
        value={selectedPreset?.baseUrl ?? ""}
        onChange={(event) => {
          const preset =
            presets.find((candidate) => candidate.baseUrl === event.target.value) ??
            null;
          onChange(preset);
        }}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-accent focus:ring-3 focus:ring-accent/20"
      >
        <option value="">Custom provider</option>
        {presets.map((preset) => (
          <option key={`${preset.provider}-${preset.baseUrl}`} value={preset.baseUrl}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProviderModelListEditor({
  provider,
  settings,
  availableModels,
  onChange,
}: {
  provider: AgentProtocolId;
  settings: WorkspaceSettings;
  availableModels: ModelInfo[];
  onChange: (nextValues: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const configuredModels = settings.providerModels[provider];
  const detectedModels = availableModels
    .filter((model) => model.provider === provider)
    .map((model) => model.id);

  function addModel() {
    const nextValue = buildModelId(provider, draft.trim());
    if (!draft.trim() || configuredModels.includes(nextValue)) return;
    onChange([...configuredModels, nextValue]);
    setDraft("");
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {getProviderLabel(provider)} models
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add, edit, or remove the model IDs you want this provider to expose.
          </p>
        </div>
        {configuredModels.length === 0 && detectedModels.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(detectedModels)}
          >
            Import detected
          </Button>
        ) : null}
      </div>

      {configuredModels.length > 0 ? (
        <div className="space-y-2">
          {configuredModels.map((modelId, index) => (
            <div
              key={`${provider}-${modelId}`}
              className="flex items-center gap-2"
            >
              <div className="flex min-w-0 flex-1 items-center rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <span className="border-r border-input px-2.5 text-sm text-muted-foreground">
                  {provider}:
                </span>
                <Input
                  aria-label={`${getProviderLabel(provider)} model ${index + 1}`}
                  value={getModelName(provider, modelId)}
                  onChange={(event) => {
                    const nextValues = [...configuredModels];
                    nextValues[index] = buildModelId(
                      provider,
                      event.target.value.trim(),
                    );
                    onChange(nextValues.filter(Boolean));
                  }}
                  placeholder="model-id"
                  className="border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onChange(
                    configuredModels.filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No models configured yet for {getProviderLabel(provider)}.
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <span className="border-r border-input px-2.5 text-sm text-muted-foreground">
            {provider}:
          </span>
          <Input
            aria-label={`Add ${getProviderLabel(provider)} model`}
            value={getModelName(provider, draft)}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="model-id"
            className="border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        </div>
        <Button type="button" size="sm" onClick={addModel}>
          Add
        </Button>
      </div>
    </div>
  );
}

function LocalCliProviderModelPicker({
  providerGroups,
  activeProvider,
  selectedModel,
  onProviderChange,
  onSelect,
  onRescan,
}: {
  providerGroups: LocalCliProviderGroup[];
  activeProvider: string;
  selectedModel: string;
  onProviderChange: (provider: string) => void;
  onSelect: (modelId: string) => void;
  onRescan: () => void;
}) {
  const effectiveActiveProvider =
    activeProvider || getModelProvider(selectedModel);
  const activeGroup =
    providerGroups.find((group) => group.provider === effectiveActiveProvider) ??
    null;
  const displayGroups = useMemo<LocalCliProviderDisplayGroup[]>(() => {
    const groups = new Map<string, LocalCliProviderDisplayGroup>();

    for (const provider of PINNED_LOCAL_CLI_PROVIDERS) {
      groups.set(provider, {
        provider,
        label: formatLocalCliProviderLabel(provider),
        models: [],
        installed: false,
      });
    }

    for (const group of providerGroups) {
      groups.set(group.provider, { ...group, installed: true });
    }

    return Array.from(groups.values()).sort((first, second) => {
      const firstIndex = LOCAL_CLI_PROVIDER_ORDER.indexOf(first.provider);
      const secondIndex = LOCAL_CLI_PROVIDER_ORDER.indexOf(second.provider);
      const firstRank =
        firstIndex === -1 ? LOCAL_CLI_PROVIDER_ORDER.length : firstIndex;
      const secondRank =
        secondIndex === -1 ? LOCAL_CLI_PROVIDER_ORDER.length : secondIndex;

      if (firstRank !== secondRank) return firstRank - secondRank;
      return first.label.localeCompare(second.label);
    });
  }, [providerGroups]);
  const activeModelPrefix = activeGroup ? `${activeGroup.provider}:` : "";
  const selectedModelBelongsToActiveProvider = activeModelPrefix
    ? selectedModel.startsWith(activeModelPrefix)
    : false;
  const selectedDetectedModel = activeGroup?.models.some(
    (model) => model.id === selectedModel,
  );
  const customSelectedModel =
    activeGroup && selectedModelBelongsToActiveProvider && !selectedDetectedModel
      ? selectedModel.slice(activeModelPrefix.length)
      : "";
  const [customModelDraft, setCustomModelDraft] =
    useState(customSelectedModel);
  const [customProviderDrafting, setCustomProviderDrafting] = useState<
    string | null
  >(null);

  useEffect(() => {
    setCustomModelDraft(customSelectedModel);
  }, [customSelectedModel]);

  const modelSelectValue =
    customProviderDrafting === activeGroup?.provider
      ? CUSTOM_LOCAL_MODEL_VALUE
      : selectedDetectedModel
        ? selectedModel
        : customSelectedModel
          ? CUSTOM_LOCAL_MODEL_VALUE
          : "";

  function updateCustomModel(value: string) {
    setCustomModelDraft(value);
    const trimmed = value.trim();
    if (activeGroup && trimmed) {
      onSelect(buildLocalCliModelId(activeGroup.provider, trimmed));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Local CLI</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the CLI route generations should use.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onRescan}>
          <RefreshCw className="size-3.5" />
          Rescan
        </Button>
      </div>

      {displayGroups.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Detected CLI
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {displayGroups.map((group) => {
                const selected = activeGroup?.provider === group.provider;

                return (
                  <button
                    key={group.provider}
                    type="button"
                    aria-pressed={selected}
                    disabled={!group.installed}
                    onClick={() => {
                      if (!group.installed) return;
                      onProviderChange(group.provider);
                      setCustomProviderDrafting(null);
                      setCustomModelDraft("");
                      const defaultModel = getLocalCliProviderDefaultModel(group);
                      if (defaultModel) {
                        onSelect(defaultModel.id);
                      }
                    }}
                    className={`flex min-h-20 w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors ${
                      !group.installed
                        ? "cursor-not-allowed border-border opacity-55"
                        : selected
                          ? "border-accent bg-accent/10 shadow-sm"
                          : "border-border hover:border-accent/40 hover:bg-background/70"
                    }`}
                  >
                    <LocalCliProviderIcon
                      provider={group.provider}
                      label={group.label}
                      className="size-7 rounded-md"
                      iconSize={24}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {group.label}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {group.installed
                          ? `${group.models.length} ${
                              group.models.length === 1 ? "model" : "models"
                            }`
                          : "Install required"}
                      </span>
                    </span>
                    <span
                      className={`size-2.5 rounded-full ${
                        selected ? "bg-accent" : "bg-muted-foreground/20"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            {providerGroups.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Install Codex or Claude Code, then rescan to enable local agent
                routes.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="localCliModel"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Model
                </Label>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">
                  {activeGroup?.label ?? "No CLI selected"}
                </p>
              </div>
            </div>

            <select
              id="localCliModel"
              aria-label="Model"
              value={modelSelectValue}
              disabled={!activeGroup}
              onChange={(event) => {
                if (!activeGroup) return;
                if (event.target.value === CUSTOM_LOCAL_MODEL_VALUE) {
                  setCustomProviderDrafting(activeGroup.provider);
                  setCustomModelDraft("");
                  return;
                }
                setCustomProviderDrafting(null);
                onSelect(event.target.value);
              }}
              className="h-12 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-accent focus:ring-3 focus:ring-accent/20"
            >
              {modelSelectValue ? null : (
                <option value="">
                  {activeGroup ? "Select a model..." : "Select a CLI first..."}
                </option>
              )}
              {activeGroup?.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {getLocalCliModelDisplayName(model)}
                </option>
              ))}
              {activeGroup ? (
                <option value={CUSTOM_LOCAL_MODEL_VALUE}>
                  Custom (type below)...
                </option>
              ) : null}
            </select>

            {modelSelectValue === CUSTOM_LOCAL_MODEL_VALUE ? (
              <div className="mt-4 space-y-2">
                <Label
                  htmlFor="localCliCustomModel"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Custom model id
                </Label>
                <Input
                  id="localCliCustomModel"
                  value={customModelDraft}
                  onChange={(event) => updateCustomModel(event.target.value)}
                  placeholder="e.g. my-model"
                />
              </div>
            ) : null}

            <p className="mt-3 text-sm text-muted-foreground">
              Fetched from the CLI when it exposes models. Custom lets you type
              any model id this CLI accepts.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/20 p-5 text-sm text-muted-foreground">
          No local CLI models detected yet. Rescan after installing or signing
          in to a supported local CLI.
        </div>
      )}
    </section>
  );
}

export function AgentSettingsSection({
  settings: initialSettings,
  onSave,
  surface = "page",
}: AgentSettingsSectionProps) {
  const [settings, setSettings] = useState<WorkspaceSettings>({
    ...initialSettings,
    providerModels: {
      openai: initialSettings.providerModels?.openai ?? [],
      anthropic: initialSettings.providerModels?.anthropic ?? [],
      agnes: initialSettings.providerModels?.agnes ?? [],
      google: initialSettings.providerModels?.google ?? [],
      vertex: initialSettings.providerModels?.vertex ?? [],
    },
  });
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [activeProtocol, setActiveProtocol] = useState<AgentProtocolId>(() =>
    getInitialProtocol(initialSettings),
  );
  const [activeLocalProvider, setActiveLocalProvider] = useState(() =>
    getModelProvider(initialSettings.defaultModel),
  );
  const [activeSourceTab, setActiveSourceTab] =
    useState<AgentModelSourceTab>("local-cli");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setSettings({
      ...initialSettings,
      providerModels: {
        openai: initialSettings.providerModels?.openai ?? [],
        anthropic: initialSettings.providerModels?.anthropic ?? [],
        agnes: initialSettings.providerModels?.agnes ?? [],
        google: initialSettings.providerModels?.google ?? [],
        vertex: initialSettings.providerModels?.vertex ?? [],
      },
    });
  }, [initialSettings]);

  const refreshAvailableModels = useCallback(() => {
    fetchModels()
      .then((response) => setAvailableModels(response.models))
      .catch(() => setAvailableModels([]));
  }, []);

  useEffect(() => {
    refreshAvailableModels();
  }, [refreshAvailableModels]);

  const normalizedInitial = useMemo(
    () => JSON.stringify(initialSettings),
    [initialSettings],
  );
  const normalizedCurrent = JSON.stringify(settings);
  const hasChanges = normalizedInitial !== normalizedCurrent;
  const localCliModels = useMemo(
    () => availableModels.filter((model) => isLocalCliProvider(model.provider)),
    [availableModels],
  );
  const localCliProviderGroups = useMemo(
    () => groupLocalCliModels(localCliModels),
    [localCliModels],
  );
  const localCliProviderCount = localCliProviderGroups.length;
  const selectedLocalProvider = getModelProvider(settings.defaultModel);

  useEffect(() => {
    if (localCliProviderGroups.length === 0) {
      setActiveLocalProvider("");
      return;
    }

    if (!selectedLocalProvider) {
      setActiveLocalProvider("");
      return;
    }

    const hasActiveProvider = localCliProviderGroups.some(
      (group) => group.provider === activeLocalProvider,
    );
    if (hasActiveProvider) return;

    const selectedProviderGroup = localCliProviderGroups.find(
      (group) => group.provider === selectedLocalProvider,
    );
    setActiveLocalProvider(
      selectedProviderGroup?.provider ?? "",
    );
  }, [activeLocalProvider, localCliProviderGroups, selectedLocalProvider]);

  const modelPickerGroups = useMemo(
    () =>
      AGENT_PROTOCOLS.map((protocol) => ({
        ...protocol,
        models: getProviderModelIds(settings, protocol.id).map((modelId) => ({
          id: modelId,
          name:
            availableModels.find((model) => model.id === modelId)?.name ??
            modelId.replace(`${protocol.id}:`, ""),
          provider: protocol.id,
        })),
      })).filter((protocol) => protocol.models.length > 0),
    [availableModels, settings],
  );
  const selectedModelName = useMemo(
    () =>
      isApiProvider(settings.defaultModel.split(":")[0] ?? "")
        ? (availableModels.find((model) => model.id === settings.defaultModel)
            ?.name ?? settings.defaultModel)
        : "",
    [availableModels, settings.defaultModel],
  );

  function updateField<Key extends keyof WorkspaceSettings>(
    key: Key,
    value: WorkspaceSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await onSave({
        ...settings,
        agnesDefaultModel:
          settings.providerModels.agnes[0] || settings.agnesDefaultModel,
      });
      refreshAvailableModels();
      setFeedback({
        type: "success",
        message: "Local agent settings updated.",
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to update local agent settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const isDialog = surface === "dialog";

  return (
    <div className={isDialog ? "flex min-h-0 flex-1 flex-col" : "space-y-6"}>
      <div className={isDialog ? "px-6 pt-6 md:px-8" : undefined}>
        <h2 className="text-lg font-semibold">Agent</h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className={
          isDialog ? "flex min-h-0 flex-1 flex-col" : "space-y-5"
        }
      >
        <div
          className={
            isDialog
              ? "min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-5 md:px-8"
              : "space-y-5 pb-24"
          }
        >
          <div className="grid grid-cols-2 rounded-xl border bg-muted/30 p-1">
            {[
              {
                id: "local-cli" as const,
                label: "Local CLI",
                description: `${localCliProviderCount} detected`,
                icon: Terminal,
              },
              {
                id: "api-provider" as const,
                label: "API provider",
                description: "BYOK",
                icon: Cloud,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const selected = activeSourceTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-label={tab.label}
                  aria-pressed={selected}
                  onClick={() => setActiveSourceTab(tab.id)}
                  className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-border bg-background shadow-sm"
                      : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {tab.label}
                    </span>
                    <span className="block text-xs">{tab.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {activeSourceTab === "local-cli" ? (
            <LocalCliProviderModelPicker
              providerGroups={localCliProviderGroups}
              activeProvider={activeLocalProvider}
              selectedModel={settings.defaultModel}
              onProviderChange={setActiveLocalProvider}
              onSelect={(modelId) => updateField("defaultModel", modelId)}
              onRescan={refreshAvailableModels}
            />
          ) : null}

          {activeSourceTab === "api-provider" ? (
            <>
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-base font-semibold">Default model</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick the workspace default from the model lists configured
                  below.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Default LLM Model
                  </p>
                  <p className="mt-2 truncate text-sm text-foreground">
                    {selectedModelName || "No API provider model selected"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {selectedModelName
                      ? settings.defaultModel
                      : "Choose an API provider model below."}
                  </p>
                </div>
                {modelPickerGroups.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                        />
                      }
                      aria-label="Browse available models"
                    >
                      Choose model
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={6}
                      className="w-72"
                    >
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium text-foreground">
                          Workspace models
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Choose from the model lists configured under each
                          provider.
                        </p>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuRadioGroup
                          value={settings.defaultModel}
                          onValueChange={(value) =>
                            updateField("defaultModel", value as string)
                          }
                        >
                          {modelPickerGroups.map((protocol, groupIndex) => (
                            <div key={protocol.id}>
                              <DropdownMenuLabel>
                                {protocol.label}
                              </DropdownMenuLabel>
                              {protocol.models.map((model) => (
                                <DropdownMenuRadioItem
                                  key={model.id}
                                  value={model.id}
                                  aria-label={`Use ${model.name}`}
                                >
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">
                                      {model.name}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      {model.id}
                                    </div>
                                  </div>
                                </DropdownMenuRadioItem>
                              ))}
                              {groupIndex < modelPickerGroups.length - 1 ? (
                                <DropdownMenuSeparator />
                              ) : null}
                            </div>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled>
                    No models yet
                  </Button>
                )}
              </div>
              </section>

              <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-base font-semibold">
                  Protocol credentials
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick a protocol to edit its credentials.
                </p>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {AGENT_PROTOCOLS.map((protocol) => (
                  <button
                    key={protocol.id}
                    type="button"
                    onClick={() => setActiveProtocol(protocol.id)}
                    className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                      activeProtocol === protocol.id
                        ? "border-accent/40 bg-accent/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {protocol.label}
                  </button>
                ))}
              </div>

              {activeProtocol === "agnes" ? (
                <div className="space-y-4">
                  <AgnesQuickstartHint />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="agnesApiKey">Agnes API Key</Label>
                      <Input
                        id="agnesApiKey"
                        value={settings.agnesApiKey}
                        onChange={(event) =>
                          updateField("agnesApiKey", event.target.value)
                        }
                        placeholder="sk-..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agnesBaseUrl">Agnes Base URL</Label>
                      <Input
                        id="agnesBaseUrl"
                        value={settings.agnesBaseUrl}
                        onChange={(event) =>
                          updateField("agnesBaseUrl", event.target.value)
                        }
                        placeholder="https://apihub.agnes-ai.com/v1"
                      />
                    </div>
                  </div>
                  <ProviderModelListEditor
                    provider="agnes"
                    settings={settings}
                    availableModels={availableModels}
                    onChange={(nextValues) =>
                      setSettings((current) =>
                        applyProviderModelUpdate(current, "agnes", nextValues),
                      )
                    }
                  />
                </div>
              ) : null}

              {activeProtocol === "openai" ? (
                <div className="space-y-4">
                  <QuickFillProviderField
                    provider="openai"
                    settings={settings}
                    onChange={(preset) =>
                      setSettings((current) =>
                        applyApiProviderPreset(current, "openai", preset),
                      )
                    }
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="openAIApiKey">OpenAI API Key</Label>
                      <Input
                        id="openAIApiKey"
                        value={settings.openAIApiKey}
                        onChange={(event) =>
                          updateField("openAIApiKey", event.target.value)
                        }
                        placeholder="sk-..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="openAIApiBase">OpenAI Base URL</Label>
                      <Input
                        id="openAIApiBase"
                        value={settings.openAIApiBase}
                        onChange={(event) =>
                          updateField("openAIApiBase", event.target.value)
                        }
                        placeholder="http://127.0.0.1:4000/v1"
                      />
                    </div>
                  </div>
                  <ProviderModelListEditor
                    provider="openai"
                    settings={settings}
                    availableModels={availableModels}
                    onChange={(nextValues) =>
                      setSettings((current) =>
                        applyProviderModelUpdate(current, "openai", nextValues),
                      )
                    }
                  />
                </div>
              ) : null}

              {activeProtocol === "google" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="googleApiKey">Google API Key</Label>
                    <Input
                      id="googleApiKey"
                      value={settings.googleApiKey}
                      onChange={(event) =>
                        updateField("googleApiKey", event.target.value)
                      }
                      placeholder="AIza..."
                    />
                  </div>
                  <ProviderModelListEditor
                    provider="google"
                    settings={settings}
                    availableModels={availableModels}
                    onChange={(nextValues) =>
                      setSettings((current) =>
                        applyProviderModelUpdate(current, "google", nextValues),
                      )
                    }
                  />
                </div>
              ) : null}

              {activeProtocol === "vertex" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="googleVertexProject">
                        Vertex Project
                      </Label>
                      <Input
                        id="googleVertexProject"
                        value={settings.googleVertexProject}
                        onChange={(event) =>
                          updateField("googleVertexProject", event.target.value)
                        }
                        placeholder="my-gcp-project"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="googleVertexLocation">
                        Vertex Location
                      </Label>
                      <Input
                        id="googleVertexLocation"
                        value={settings.googleVertexLocation}
                        onChange={(event) =>
                          updateField(
                            "googleVertexLocation",
                            event.target.value,
                          )
                        }
                        placeholder="global"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="googleVertexVideoLocation">
                        Vertex Video Location
                      </Label>
                      <Input
                        id="googleVertexVideoLocation"
                        value={settings.googleVertexVideoLocation}
                        onChange={(event) =>
                          updateField(
                            "googleVertexVideoLocation",
                            event.target.value,
                          )
                        }
                        placeholder="us-central1"
                      />
                    </div>
                  </div>
                  <ProviderModelListEditor
                    provider="vertex"
                    settings={settings}
                    availableModels={availableModels}
                    onChange={(nextValues) =>
                      setSettings((current) =>
                        applyProviderModelUpdate(current, "vertex", nextValues),
                      )
                    }
                  />
                </div>
              ) : null}

              {activeProtocol === "anthropic" ? (
                <div className="space-y-4">
                  <QuickFillProviderField
                    provider="anthropic"
                    settings={settings}
                    onChange={(preset) =>
                      setSettings((current) =>
                        applyApiProviderPreset(current, "anthropic", preset),
                      )
                    }
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="anthropicApiKey">Anthropic API Key</Label>
                      <Input
                        id="anthropicApiKey"
                        value={settings.anthropicApiKey}
                        onChange={(event) =>
                          updateField("anthropicApiKey", event.target.value)
                        }
                        placeholder="sk-ant-..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="anthropicBaseUrl">
                        Anthropic Base URL
                      </Label>
                      <Input
                        id="anthropicBaseUrl"
                        value={settings.anthropicBaseUrl}
                        onChange={(event) =>
                          updateField("anthropicBaseUrl", event.target.value)
                        }
                        placeholder="https://api.anthropic.com"
                      />
                    </div>
                  </div>
                  <ProviderModelListEditor
                    provider="anthropic"
                    settings={settings}
                    availableModels={availableModels}
                    onChange={(nextValues) =>
                      setSettings((current) =>
                        applyProviderModelUpdate(
                          current,
                          "anthropic",
                          nextValues,
                        ),
                      )
                    }
                  />
                </div>
              ) : null}
              </section>
            </>
          ) : null}
        </div>

        <div
          data-testid="agent-settings-save-footer"
          className={
            isDialog
              ? "shrink-0 border-t bg-card px-6 py-4 md:px-8"
              : "sticky bottom-0 z-10 -mx-6 -mb-6 flex items-center justify-between gap-3 border-t bg-card/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:-mx-8 md:-mb-8 md:px-8"
          }
        >
          <div className="flex w-full items-center gap-3">
            {feedback ? (
              <p
                className={`min-w-0 flex-1 text-sm ${
                  feedback.type === "success"
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {feedback.message}
              </p>
            ) : (
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {hasChanges ? "Unsaved changes" : "Settings are up to date"}
              </span>
            )}

            <Button
              type="submit"
              disabled={saving || !hasChanges}
              className="ml-auto min-w-24"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
