"use client";

import { useEffect, useMemo, useState } from "react";

import type { ModelInfo, WorkspaceSettings } from "@aimc/shared";

import { fetchModels } from "@/lib/server-api";
import { AgnesQuickstartHint } from "./agnes-quickstart-hint";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface AgentSettingsSectionProps {
  settings: WorkspaceSettings;
  onSave: (settings: WorkspaceSettings) => Promise<void>;
}

type AgentProtocolId = "agnes" | "openai" | "google" | "vertex" | "anthropic";

type ProviderModels = WorkspaceSettings["providerModels"];

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
    description: "Google Cloud hosted route for Gemini and Vertex-backed models",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude API route for Anthropic-hosted models",
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
    AGENT_PROTOCOLS.find((protocol) => protocol.id === provider)?.label ?? provider
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
            <div key={`${provider}-${index}`} className="flex items-center gap-2">
              <Input
                aria-label={`${getProviderLabel(provider)} model ${index + 1}`}
                value={modelId}
                onChange={(event) => {
                  const nextValues = [...configuredModels];
                  nextValues[index] = buildModelId(provider, event.target.value.trim());
                  onChange(nextValues.filter(Boolean));
                }}
                placeholder={`${provider}:model-id`}
              />
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
        <Input
          aria-label={`Add ${getProviderLabel(provider)} model`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`${provider}:model-id`}
        />
        <Button type="button" size="sm" onClick={addModel}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function AgentSettingsSection({
  settings: initialSettings,
  onSave,
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
  const [activeProtocol, setActiveProtocol] =
    useState<AgentProtocolId>(() => getInitialProtocol(initialSettings));
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
    setActiveProtocol(getInitialProtocol(initialSettings));
  }, [initialSettings]);

  useEffect(() => {
    let canceled = false;

    fetchModels()
      .then((response) => {
        if (!canceled) {
          setAvailableModels(response.models);
        }
      })
      .catch(() => {
        if (!canceled) {
          setAvailableModels([]);
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    initialSettings.openAIApiBase,
    initialSettings.openAIApiKey,
    initialSettings.anthropicApiKey,
    initialSettings.anthropicBaseUrl,
    initialSettings.agnesApiKey,
    initialSettings.googleApiKey,
    initialSettings.googleVertexProject,
    initialSettings.googleVertexLocation,
  ]);

  const normalizedInitial = useMemo(
    () => JSON.stringify(initialSettings),
    [initialSettings],
  );
  const normalizedCurrent = JSON.stringify(settings);
  const hasChanges = normalizedInitial !== normalizedCurrent;
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
      availableModels.find((model) => model.id === settings.defaultModel)?.name ??
      settings.defaultModel,
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
      setFeedback({ type: "success", message: "Local agent settings updated." });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to update local agent settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Agent</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Default model</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick the workspace default from the model lists configured below.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Default LLM Model
              </p>
              <p className="mt-2 truncate text-sm text-foreground">
                {selectedModelName || "No default model selected"}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {settings.defaultModel || "Configure models below, then pick one here."}
              </p>
            </div>
            {modelPickerGroups.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm" className="shrink-0" />
                  }
                  aria-label="Browse available models"
                >
                  Choose model
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="w-72">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-foreground">
                      Workspace models
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose from the model lists configured under each provider.
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {modelPickerGroups.map((protocol) => (
                      <DropdownMenuSub key={protocol.id}>
                        <DropdownMenuSubTrigger>
                          {protocol.label}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-80">
                          <DropdownMenuLabel>
                            {protocol.label} models
                          </DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={settings.defaultModel}
                            onValueChange={(value) =>
                              updateField("defaultModel", value as string)
                            }
                          >
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
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
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
            <h3 className="text-base font-semibold">Protocol credentials</h3>
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
                  onChange={(event) => updateField("googleApiKey", event.target.value)}
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
                  <Label htmlFor="googleVertexProject">Vertex Project</Label>
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
                  <Label htmlFor="googleVertexLocation">Vertex Location</Label>
                  <Input
                    id="googleVertexLocation"
                    value={settings.googleVertexLocation}
                    onChange={(event) =>
                      updateField("googleVertexLocation", event.target.value)
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
                      updateField("googleVertexVideoLocation", event.target.value)
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
                  <Label htmlFor="anthropicBaseUrl">Anthropic Base URL</Label>
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
                    applyProviderModelUpdate(current, "anthropic", nextValues),
                  )
                }
              />
            </div>
          ) : null}
        </section>

        {feedback && (
          <p
            className={`text-sm ${
              feedback.type === "success"
                ? "text-success"
                : "text-destructive"
            }`}
          >
            {feedback.message}
          </p>
        )}

        <Button type="submit" disabled={saving || !hasChanges} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}
