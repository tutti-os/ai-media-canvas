"use client";

import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSettings } from "@aimc/shared";

import { useAppTranslation } from "@/i18n";
import { AgnesQuickstartHint } from "./agnes-quickstart-hint";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface MediaSettingsSectionProps {
  settings: WorkspaceSettings;
  onSave: (settings: WorkspaceSettings) => Promise<void>;
}

type StringSettingsKey = Exclude<
  {
    [Key in keyof WorkspaceSettings]: undefined extends WorkspaceSettings[Key]
      ? never
      : WorkspaceSettings[Key] extends string
        ? Key
        : never;
  }[keyof WorkspaceSettings],
  undefined
>;

type MediaProviderCard = {
  id: "agnes" | "openai" | "google" | "vertex" | "replicate" | "volces";
  label: string;
  capabilitiesKey: string;
  summaryKey: string;
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
    capabilitiesKey: "media.capabilities.imageVideo",
    summaryKey: "media.cards.agnes.summary",
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
    capabilitiesKey: "media.capabilities.imageVideo",
    summaryKey: "media.cards.replicate.summary",
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
    capabilitiesKey: "media.capabilities.image",
    summaryKey: "media.cards.volces.summary",
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
    capabilitiesKey: "media.capabilities.imageVideo",
    summaryKey: "media.cards.google.summary",
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
    capabilitiesKey: "media.capabilities.imageVideo",
    summaryKey: "media.cards.vertex.summary",
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
    capabilitiesKey: "media.capabilities.image",
    summaryKey: "media.cards.openai.summary",
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
  const { t } = useAppTranslation("settings");
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
        message: t("media.feedback.updated"),
      });
    } catch {
      setFeedback({
        type: "error",
        message: t("media.feedback.updateFailed"),
      });
    } finally {
      setSavingCard(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("media.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("media.description")}
        </p>
      </div>

      <div className="rounded-2xl border bg-card/50 p-4 text-sm text-muted-foreground">
        <p>
          {t("media.providerNotes.replicate", {
            provider: "Replicate",
          })}
        </p>
        <p className="mt-2">
          {t("media.providerNotes.volces", {
            provider: "Volces",
          })}
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
                      {t(card.capabilitiesKey)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        isConfigured
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isConfigured
                        ? t("media.status.configured")
                        : t("media.status.notConfigured")}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    {t(card.summaryKey)}
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
                  {t("media.affectedModels")}
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
                  {t("media.localStorageNote")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={!hasChanges || savingCard !== null}
                  onClick={() => void handleSave(card.id)}
                >
                  {savingCard === card.id
                    ? t("media.actions.saving")
                    : t("media.actions.save")}
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
