"use client";

import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSettings } from "@aimc/shared";

import { AgnesQuickstartHint } from "./agnes-quickstart-hint";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface MediaSettingsSectionProps {
  settings: WorkspaceSettings;
  onSave: (settings: WorkspaceSettings) => Promise<void>;
}

type StringSettingsKey = Exclude<{
  [Key in keyof WorkspaceSettings]: undefined extends WorkspaceSettings[Key]
    ? never
    : WorkspaceSettings[Key] extends string
      ? Key
      : never;
}[keyof WorkspaceSettings], undefined>;

type MediaProviderCard = {
  id: "agnes" | "openai" | "google" | "vertex" | "replicate" | "volces";
  label: string;
  capabilities: string;
  summary: string;
  models: string[];
  fields: Array<{
    key: StringSettingsKey;
    label: string;
    placeholder: string;
  }>;
};

const MEDIA_PROVIDER_CARDS: readonly MediaProviderCard[] = [
  {
    id: "agnes",
    label: "Agnes",
    capabilities: "Image + Video",
    summary:
      "Agnes multimodal route. Uses agnes-ai-cli for image/video generation, including compose and keyframe-capable video modes.",
    models: [
      "Agnes Image 2.1 Flash",
      "Agnes Image 2.0 Flash",
      "Agnes Video v2.0",
    ],
    fields: [
      {
        key: "agnesApiKey",
        label: "Agnes API Key",
        placeholder: "sk-...",
      },
      {
        key: "agnesBaseUrl",
        label: "Agnes Base URL",
        placeholder: "https://apihub.agnes-ai.com/v1",
      },
    ],
  },
  {
    id: "replicate",
    label: "Replicate",
    capabilities: "Image + Video",
    summary:
      "Third-party hosted models. Use this when you want Seedream, Seedance, Kling, or Replicate-routed Veo/Sora families.",
    models: [
      "Seedream 5 Lite",
      "Seedream 4.5",
      "Seedream 4",
      "Seedance 1.5 Pro",
      "Kling 3.0 / Omni / 2.6 / O1",
      "Veo 3 / 3.1",
    ],
    fields: [
      {
        key: "replicateApiToken",
        label: "Replicate API Token",
        placeholder: "r8_...",
      },
    ],
  },
  {
    id: "volces",
    label: "Volces",
    capabilities: "Image",
    summary:
      "ByteDance / Volcengine's official channel. Use this for Doubao Seedream models served through Ark.",
    models: ["Doubao Seedream 5.0"],
    fields: [
      {
        key: "volcesApiKey",
        label: "Volces API Key",
        placeholder: "volces-key",
      },
      {
        key: "volcesBaseUrl",
        label: "Volces Base URL",
        placeholder: "https://ark.cn-beijing.volces.com/api/v3",
      },
    ],
  },
  {
    id: "google",
    label: "Google",
    capabilities: "Image + Video",
    summary:
      "Google AI Studio / Developer API route. Best for Nano Banana and Google-official image/video families.",
    models: ["Nano Banana", "Nano Banana 2", "Nano Banana Pro", "Veo"],
    fields: [
      {
        key: "googleApiKey",
        label: "Google API Key",
        placeholder: "AIza...",
      },
    ],
  },
  {
    id: "vertex",
    label: "Vertex AI",
    capabilities: "Image + Video",
    summary:
      "Google Cloud hosted route. Uses Vertex project and locations, with service-account credentials still coming from env.",
    models: [
      "Nano Banana (Vertex)",
      "Nano Banana 2 (Vertex)",
      "Nano Banana Pro (Vertex)",
      "Veo 3 / 3.1 (Vertex)",
    ],
    fields: [
      {
        key: "googleVertexProject",
        label: "Vertex Project",
        placeholder: "my-gcp-project",
      },
      {
        key: "googleVertexLocation",
        label: "Vertex Location",
        placeholder: "global",
      },
      {
        key: "googleVertexVideoLocation",
        label: "Vertex Video Location",
        placeholder: "us-central1",
      },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    capabilities: "Image",
    summary:
      "OpenAI-compatible image route. Uses the same key/base URL pair as the OpenAI-compatible agent protocol.",
    models: ["GPT Image 1.5", "GPT Image 1", "GPT Image 1 Mini"],
    fields: [
      {
        key: "openAIApiKey",
        label: "OpenAI API Key",
        placeholder: "sk-...",
      },
      {
        key: "openAIApiBase",
        label: "OpenAI Base URL",
        placeholder: "http://127.0.0.1:4000/v1",
      },
    ],
  },
];

export function MediaSettingsSection({
  settings: initialSettings,
  onSave,
}: MediaSettingsSectionProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setSettings(initialSettings);
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

  async function handleSave(scope: string) {
    setSavingCard(scope);
    setFeedback(null);

    try {
      await onSave(settings);
      setFeedback({
        type: "success",
        message: "Local media provider settings updated.",
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to update local media provider settings. Please try again.",
      });
    } finally {
      setSavingCard(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Media Providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure image and video providers by platform. If the same model
          family exists on multiple platforms later, AIMC keeps them separate
          by provider-scoped model IDs so you can choose the route explicitly.
        </p>
      </div>

      <div className="rounded-2xl border bg-card/50 p-4 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Replicate</span> is a
          third-party hosting platform.
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Volces</span> is the
          ByteDance / Volcengine official channel.
        </p>
      </div>

      <div className="space-y-4">
        {MEDIA_PROVIDER_CARDS.map((card) => {
          const isConfigured = card.fields.some(
            (field) => String(settings[field.key] ?? "").trim().length > 0,
          );

          return (
            <section
              key={card.id}
              className="rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{card.label}</h3>
                    <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {card.capabilities}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        isConfigured
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isConfigured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    {card.summary}
                  </p>
                  {card.id === "agnes" ? (
                    <div className="mt-3">
                      <AgnesQuickstartHint />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Affected models
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card.models.map((model) => (
                    <span
                      key={model}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
                    >
                      {model}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {card.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`${card.id}-${field.key}`}>
                      {field.label}
                    </Label>
                    <Input
                      id={`${card.id}-${field.key}`}
                      value={settings[field.key]}
                      onChange={(event) =>
                        updateField(field.key, event.target.value)
                      }
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  These values are stored in the local sqlite settings database
                  and reused by the matching media providers.
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={!hasChanges || savingCard !== null}
                  onClick={() => void handleSave(card.id)}
                >
                  {savingCard === card.id ? "Saving..." : "Save"}
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      {feedback ? (
        <p
          className={`text-sm ${
            feedback.type === "success" ? "text-success" : "text-destructive"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
