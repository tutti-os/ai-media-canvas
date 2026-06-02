"use client";

import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSettings } from "@aimc/shared";

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
  status?: "coming-soon";
}> = [
  {
    id: "openai",
    label: "OpenAI-compatible",
    description: "OpenAI and OpenAI-compatible gateways",
  },
  {
    id: "agnes",
    label: "Agnes",
    description: "Agnes OpenAI-compatible chat route",
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
    description: "Reserved for a future runtime integration",
    status: "coming-soon",
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

  const normalizedInitial = useMemo(
    () => JSON.stringify(initialSettings),
    [initialSettings],
  );
  const normalizedCurrent = JSON.stringify(settings);
  const hasChanges = normalizedInitial !== normalizedCurrent;

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
              .
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultModel">Default LLM Model</Label>
            <Input
              id="defaultModel"
              value={settings.defaultModel}
              onChange={(event) => updateField("defaultModel", event.target.value)}
              placeholder="openai:gpt-4.1, agnes:agnes-2.0-flash, or google:gemini-2.5-flash"
            />
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
                onClick={() => {
                  if (protocol.status === "coming-soon") return;
                  setActiveProtocol(protocol.id);
                }}
                className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                  protocol.status === "coming-soon"
                    ? "cursor-not-allowed border-dashed border-border bg-muted/50 text-muted-foreground"
                    : activeProtocol === protocol.id
                      ? "border-accent/40 bg-accent/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {protocol.label}
                {protocol.status === "coming-soon" ? " · Soon" : ""}
              </button>
            ))}
          </div>

          {activeProtocol === "agnes" ? (
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
          ) : null}

          {activeProtocol === "openai" ? (
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
            <div className="rounded-xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
              Anthropic will need a real runtime provider before it becomes a
              live protocol here. This tab is reserved so the structure matches
              the future protocol layout, but AIMC currently runs only the
              OpenAI-compatible and Google / Vertex routes.
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
