"use client";

import { useEffect, useMemo, useState } from "react";

import type { ModelInfo, WorkspaceSettings } from "@aimc/shared";

import { fetchModels } from "@/lib/server-api";
import { AgnesQuickstartHint } from "./agnes-quickstart-hint";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface AgentSettingsSectionProps {
  settings: WorkspaceSettings;
  onSave: (settings: WorkspaceSettings) => Promise<void>;
}

type AgentProtocolId = "agnes" | "openai" | "google" | "vertex" | "anthropic";

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

export function AgentSettingsSection({
  settings: initialSettings,
  onSave,
}: AgentSettingsSectionProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [activeProtocol, setActiveProtocol] =
    useState<AgentProtocolId>(() => getInitialProtocol(initialSettings));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setSettings(initialSettings);
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
  }, [initialSettings.openAIApiBase, initialSettings.openAIApiKey]);

  const normalizedInitial = useMemo(
    () => JSON.stringify(initialSettings),
    [initialSettings],
  );
  const normalizedCurrent = JSON.stringify(settings);
  const hasChanges = normalizedInitial !== normalizedCurrent;
  const openAIModelSuggestions = useMemo(
    () =>
      availableModels.filter((model) => model.provider === "openai"),
    [availableModels],
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
      await onSave(settings);
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
              Use a provider-scoped model ID like{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                openai:gpt-4.1
              </code>{" "}
              or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                agnes:agnes-2.0-flash
              </code>{" "}
              or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                google:gemini-2.5-flash
              </code>
              {" "}or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                anthropic:claude-sonnet-4-5
              </code>
              .
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultModel">Default LLM Model</Label>
            <Input
              id="defaultModel"
              list="defaultModelOptions"
              value={settings.defaultModel}
              onChange={(event) => updateField("defaultModel", event.target.value)}
              placeholder="openai:gpt-4.1, anthropic:claude-sonnet-4-5, agnes:agnes-2.0-flash, or google:gemini-2.5-flash"
            />
            <datalist id="defaultModelOptions">
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </datalist>
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
              <div className="grid gap-4 md:grid-cols-3">
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
                <div className="space-y-2">
                  <Label htmlFor="agnesDefaultModel">Agnes Default Model</Label>
                  <Input
                    id="agnesDefaultModel"
                    value={settings.agnesDefaultModel}
                    onChange={(event) =>
                      updateField("agnesDefaultModel", event.target.value)
                    }
                    placeholder="agnes:agnes-2.0-flash"
                  />
                </div>
              </div>
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

              {openAIModelSuggestions.length > 0 ? (
                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Detected OpenAI-compatible models
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick one to fill the default model, or keep typing any custom
                      model ID your gateway accepts.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {openAIModelSuggestions.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => updateField("defaultModel", model.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          settings.defaultModel === model.id
                            ? "border-accent/40 bg-accent/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                        aria-label={`Use ${model.name}`}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeProtocol === "google" ? (
            <div className="space-y-2">
              <Label htmlFor="googleApiKey">Google API Key</Label>
              <Input
                id="googleApiKey"
                value={settings.googleApiKey}
                onChange={(event) => updateField("googleApiKey", event.target.value)}
                placeholder="AIza..."
              />
            </div>
          ) : null}

          {activeProtocol === "vertex" ? (
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
          ) : null}

          {activeProtocol === "anthropic" ? (
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
