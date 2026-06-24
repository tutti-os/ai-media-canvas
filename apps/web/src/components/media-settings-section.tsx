"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import type { WorkspaceSettings } from "@aimc/shared";

import { useAppTranslation } from "@/i18n";
import { AgnesQuickstartHint } from "./agnes-quickstart-hint";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface MediaSettingsSectionProps {
  settings: WorkspaceSettings;
  onSave: (settings: WorkspaceSettings) => Promise<void>;
  onSaved?: (() => void) | undefined;
}

type StringSettingsKey = Exclude<
  {
    [Key in keyof WorkspaceSettings]: undefined extends WorkspaceSettings[Key]
      ? never
      : WorkspaceSettings[Key] extends string
        ? Key
        : never;
  }[keyof WorkspaceSettings],
  "codexImagegenDelegation" | undefined
>;

type MediaCapability = "image" | "video";
type MediaProviderId = "agnes" | "kie" | "replicate" | "google" | "openai";
type Translate = ReturnType<typeof useAppTranslation>["t"];
type MediaProviderModel = {
  capabilities: MediaCapability[];
  label: string;
};

type MediaProviderCard = {
  id: MediaProviderId;
  label: string;
  capabilities: MediaCapability[];
  summaryKey: string;
  remarkKey?: string;
  models: MediaProviderModel[];
  fields: Array<{
    key: StringSettingsKey;
    label: string;
    placeholder: string;
    defaultValue?: string;
    apiKeyUrl?: string;
    advanced?: boolean;
  }>;
};

const CODEX_IMAGEGEN_DELEGATION_OPTIONS = [
  "ask",
  "always",
  "never",
] as const satisfies readonly WorkspaceSettings["codexImagegenDelegation"][];

const GOOGLE_AI_STUDIO_API_KEYS_URL = "https://aistudio.google.com/app/apikey";
const KIE_API_KEYS_URL = "https://kie.ai/api-key";
const OPENAI_API_KEYS_URL = "https://platform.openai.com/api-keys";
const REPLICATE_API_TOKENS_URL = "https://replicate.com/account/api-tokens";

const MEDIA_PROVIDER_CARDS: readonly MediaProviderCard[] = [
  {
    id: "agnes",
    label: "Agnes",
    capabilities: ["image", "video"],
    summaryKey: "media.cards.agnes.summary",
    remarkKey: "media.cards.agnes.remark",
    models: [
      { label: "Agnes Image 2.1 Flash", capabilities: ["image"] },
      { label: "Agnes Image 2.0 Flash", capabilities: ["image"] },
      { label: "Agnes Video v2.0", capabilities: ["video"] },
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
        defaultValue: "https://apihub.agnes-ai.com/v1",
        advanced: true,
      },
    ],
  },
  {
    id: "kie",
    label: "Kie.ai",
    capabilities: ["image", "video"],
    summaryKey: "media.cards.kie.summary",
    remarkKey: "media.cards.kie.remark",
    models: [
      { label: "Z-Image", capabilities: ["image"] },
      { label: "Seedream 5.0 Lite", capabilities: ["image"] },
      { label: "GPT Image 2", capabilities: ["image"] },
      { label: "Qwen2", capabilities: ["image"] },
      { label: "Nano Banana Pro", capabilities: ["image"] },
      { label: "Runway Gen-4 Turbo", capabilities: ["video"] },
      { label: "Grok Imagine 1.5 Preview", capabilities: ["image", "video"] },
      { label: "Hailuo Pro", capabilities: ["video"] },
      { label: "Veo 3.1", capabilities: ["video"] },
      { label: "Kling 2.6", capabilities: ["video"] },
      { label: "Seedance 2.0", capabilities: ["video"] },
      { label: "HappyHorse 1.0", capabilities: ["video"] },
    ],
    fields: [
      {
        key: "kieApiKey",
        label: "Kie API Key",
        placeholder: "kie-...",
        apiKeyUrl: KIE_API_KEYS_URL,
      },
      {
        key: "kieBaseUrl",
        label: "Kie Base URL",
        placeholder: "https://api.kie.ai",
        defaultValue: "https://api.kie.ai",
        advanced: true,
      },
    ],
  },
  {
    id: "replicate",
    label: "Replicate",
    capabilities: ["video"],
    summaryKey: "media.cards.replicate.summary",
    remarkKey: "media.cards.replicate.remark",
    models: [
      { label: "Seedream 5 Lite", capabilities: ["video"] },
      { label: "Seedream 4.5", capabilities: ["video"] },
      { label: "Seedream 4", capabilities: ["video"] },
      { label: "Seedance 1.5 Pro", capabilities: ["video"] },
      { label: "Kling 3.0 / Omni / 2.6 / O1", capabilities: ["video"] },
      { label: "Veo 3 / 3.1", capabilities: ["video"] },
    ],
    fields: [
      {
        key: "replicateApiToken",
        label: "Replicate API Token",
        placeholder: "r8_...",
        apiKeyUrl: REPLICATE_API_TOKENS_URL,
      },
    ],
  },
  {
    id: "google",
    label: "Google",
    capabilities: ["image", "video"],
    summaryKey: "media.cards.google.summary",
    models: [
      { label: "Nano Banana", capabilities: ["image"] },
      { label: "Nano Banana 2", capabilities: ["image"] },
      { label: "Nano Banana Pro", capabilities: ["image"] },
      { label: "Veo", capabilities: ["video"] },
    ],
    fields: [
      {
        key: "googleApiKey",
        label: "Google API Key",
        placeholder: "AIza...",
        apiKeyUrl: GOOGLE_AI_STUDIO_API_KEYS_URL,
      },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    capabilities: ["image"],
    summaryKey: "media.cards.openai.summary",
    models: [
      { label: "GPT Image 1.5", capabilities: ["image"] },
      { label: "GPT Image 1", capabilities: ["image"] },
      { label: "GPT Image 1 Mini", capabilities: ["image"] },
    ],
    fields: [
      {
        key: "openAIApiKey",
        label: "OpenAI API Key",
        placeholder: "sk-...",
        apiKeyUrl: OPENAI_API_KEYS_URL,
      },
      {
        key: "openAIApiBase",
        label: "OpenAI Base URL",
        placeholder: "http://127.0.0.1:4000/v1",
        defaultValue: "http://127.0.0.1:4000/v1",
        advanced: true,
      },
    ],
  },
];

const MEDIA_PROVIDER_FIELD_KEYS = MEDIA_PROVIDER_CARDS.flatMap((card) =>
  card.fields.map((field) => field.key),
);

function applyMediaFieldDefaults(
  settings: WorkspaceSettings,
): WorkspaceSettings {
  const defaults: Partial<Record<StringSettingsKey, string>> = {};

  for (const card of MEDIA_PROVIDER_CARDS) {
    for (const field of card.fields) {
      if (!field.defaultValue) continue;
      if (String(settings[field.key] ?? "").trim()) continue;
      defaults[field.key] = field.defaultValue;
    }
  }

  return Object.keys(defaults).length > 0
    ? { ...settings, ...defaults }
    : settings;
}

function getCodexImagegenDelegation(settings: WorkspaceSettings) {
  return CODEX_IMAGEGEN_DELEGATION_OPTIONS.includes(
    settings.codexImagegenDelegation,
  )
    ? settings.codexImagegenDelegation
    : "ask";
}

function hasMediaProviderCardChanges(
  card: MediaProviderCard,
  current: WorkspaceSettings,
  initial: WorkspaceSettings,
) {
  return card.fields.some((field) => current[field.key] !== initial[field.key]);
}

function isMediaProviderConfigured(
  card: MediaProviderCard,
  settings: WorkspaceSettings,
) {
  return card.fields.some(
    (field) =>
      !field.defaultValue &&
      String(settings[field.key] ?? "").trim().length > 0,
  );
}

function getModelsForCapability(
  card: MediaProviderCard,
  capability: MediaCapability,
) {
  return card.models.filter((model) => model.capabilities.includes(capability));
}

function mergeMediaSettingsPreservingDirtyFields(
  current: WorkspaceSettings,
  previousBaseline: WorkspaceSettings,
  nextBaseline: WorkspaceSettings,
) {
  const merged: WorkspaceSettings = { ...nextBaseline };

  if (
    getCodexImagegenDelegation(current) !==
    getCodexImagegenDelegation(previousBaseline)
  ) {
    merged.codexImagegenDelegation = current.codexImagegenDelegation;
  }

  for (const key of MEDIA_PROVIDER_FIELD_KEYS) {
    if (current[key] !== previousBaseline[key]) {
      merged[key] = current[key];
    }
  }

  return merged;
}

function applyMediaSaveScope(
  baseline: WorkspaceSettings,
  current: WorkspaceSettings,
  scope: string,
) {
  const next: WorkspaceSettings = { ...baseline };

  if (scope === "codex-imagegen") {
    next.codexImagegenDelegation = current.codexImagegenDelegation;
    return next;
  }

  const card = MEDIA_PROVIDER_CARDS.find((item) => item.id === scope);
  if (!card) return next;

  for (const field of card.fields) {
    next[field.key] = current[field.key];
  }

  return next;
}

function SectionHeading({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="shrink-0 text-sm font-semibold text-foreground">
        {title}
      </h3>
      <div className="min-w-0 flex-1">
        <Separator />
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MediaSettingsSection({
  settings: initialSettings,
  onSave,
  onSaved,
}: MediaSettingsSectionProps) {
  const { t } = useAppTranslation("settings");
  const initialMediaSettings = useMemo(
    () => applyMediaFieldDefaults(initialSettings),
    [initialSettings],
  );
  const [baselineSettings, setBaselineSettings] = useState(
    () => initialMediaSettings,
  );
  const [settings, setSettings] = useState(() => initialMediaSettings);
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [codexSettingsOpen, setCodexSettingsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<MediaProviderId | null>(
    null,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedCapability, setSelectedCapability] =
    useState<MediaCapability>("image");

  useEffect(() => {
    setBaselineSettings((previousBaseline) => {
      setSettings((current) =>
        mergeMediaSettingsPreservingDirtyFields(
          current,
          previousBaseline,
          initialMediaSettings,
        ),
      );
      return initialMediaSettings;
    });
  }, [initialMediaSettings]);

  const codexImagegenDelegation = getCodexImagegenDelegation(settings);
  const codexHasChanges =
    codexImagegenDelegation !== getCodexImagegenDelegation(baselineSettings);
  const codexEnabled = codexImagegenDelegation !== "never";
  const configuredCards = MEDIA_PROVIDER_CARDS.filter((card) =>
    isMediaProviderConfigured(card, settings),
  );
  const configuredCardsForCapability = configuredCards.filter((card) =>
    card.capabilities.includes(selectedCapability),
  );
  const availableCardsForCapability = MEDIA_PROVIDER_CARDS.filter(
    (card) =>
      card.capabilities.includes(selectedCapability) &&
      !isMediaProviderConfigured(card, settings),
  );
  const imageReady =
    codexEnabled ||
    configuredCards.some((card) => card.capabilities.includes("image"));
  const videoReady = configuredCards.some((card) =>
    card.capabilities.includes("video"),
  );
  const codexVisible = selectedCapability === "image" && codexEnabled;
  const hasConnectedServices =
    codexVisible || configuredCardsForCapability.length > 0;

  useEffect(() => {
    if (!activeProvider) return;
    const activeCard = MEDIA_PROVIDER_CARDS.find(
      (card) => card.id === activeProvider,
    );
    if (!activeCard?.capabilities.includes(selectedCapability)) {
      setActiveProvider(null);
      setAdvancedOpen(false);
    }
  }, [activeProvider, selectedCapability]);

  function updateField<Key extends keyof WorkspaceSettings>(
    key: Key,
    value: WorkspaceSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function showProviderForm(providerId: MediaProviderId) {
    setManualOpen(true);
    setActiveProvider((current) =>
      current === providerId ? null : providerId,
    );
    setAdvancedOpen(false);
  }

  function selectCapability(capability: MediaCapability) {
    setSelectedCapability(capability);
  }

  function handleCapabilityValueChange(value: unknown) {
    if (value === "image" || value === "video") {
      selectCapability(value);
    }
  }

  async function handleSave(scope: string) {
    setSavingCard(scope);
    setFeedback(null);
    const baselineAtSubmit = baselineSettings;
    const scopedSettings = applyMediaSaveScope(
      baselineAtSubmit,
      settings,
      scope,
    );

    try {
      await onSave(scopedSettings);
      setBaselineSettings(scopedSettings);
      setSettings((current) =>
        mergeMediaSettingsPreservingDirtyFields(
          current,
          baselineAtSubmit,
          scopedSettings,
        ),
      );
      setFeedback({
        type: "success",
        message: t("media.feedback.updated"),
      });
      if (scope !== "codex-imagegen") {
        setActiveProvider(null);
      }
      onSaved?.();
    } catch {
      setFeedback({
        type: "error",
        message: t("media.feedback.updateFailed"),
      });
    } finally {
      setSavingCard(null);
    }
  }

  const capabilitySections = (
    <>
      {hasConnectedServices && (
        <section className="flex flex-col gap-3">
          <SectionHeading title={t("media.sections.connected")} />
          {codexVisible ? (
            <div className="rounded-xl border bg-background px-4 py-3">
              <ConnectedServiceRow
                capabilities={["image"]}
                meta={t("media.connected.codexMeta", {
                  mode: t(
                    `media.codexImagegen.options.${codexImagegenDelegation}.label`,
                  ),
                })}
                name="Codex Image 2.0"
                onSettings={() => setCodexSettingsOpen((open) => !open)}
                settingsLabel={t("media.actions.settings")}
                status={t("media.status.enabled")}
                tCapability={(capability) =>
                  capability === "image"
                    ? t("media.capabilities.image")
                    : t("media.capabilities.video")
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("media.connected.codexNote")}
              </p>
              {codexSettingsOpen ? (
                <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                  <CodexPermissionControl
                    disabled={savingCard !== null}
                    hasChanges={codexHasChanges}
                    onSave={() => void handleSave("codex-imagegen")}
                    onValueChange={(value) =>
                      updateField("codexImagegenDelegation", value)
                    }
                    saving={savingCard === "codex-imagegen"}
                    t={t}
                    value={codexImagegenDelegation}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {configuredCardsForCapability.map((card) => (
            <div
              key={card.id}
              className="rounded-xl border bg-background px-4 py-3"
            >
              <ConnectedServiceRow
                capabilities={card.capabilities}
                meta={t("media.connected.providerMeta", {
                  count: getModelsForCapability(card, selectedCapability)
                    .length,
                })}
                name={card.label}
                onSettings={() => showProviderForm(card.id)}
                settingsLabel={t("media.actions.settings")}
                status={t("media.status.enabled")}
                tCapability={(capability) =>
                  capability === "image"
                    ? t("media.capabilities.image")
                    : t("media.capabilities.video")
                }
              />
            </div>
          ))}
        </section>
      )}

      {selectedCapability === "image" ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            action={
              <span className="text-xs text-muted-foreground">
                {codexEnabled
                  ? t("media.localDetection.enabled")
                  : t("media.localDetection.detected")}
              </span>
            }
            title={t("media.sections.localDetection")}
          />
          <div className="rounded-xl border bg-background px-4 py-3">
            <ConnectedServiceRow
              capabilities={["image"]}
              meta={t("media.localDetection.codexMeta")}
              name={t("media.localDetection.codexTitle")}
              onSettings={() => setCodexSettingsOpen((open) => !open)}
              settingsLabel={
                codexEnabled
                  ? t("media.actions.settings")
                  : t("media.actions.enable")
              }
              status={codexEnabled ? t("media.status.enabled") : undefined}
              tCapability={(capability) =>
                capability === "image"
                  ? t("media.capabilities.image")
                  : t("media.capabilities.video")
              }
            />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading
          action={
            <Button
              onClick={() => {
                setManualOpen((open) => !open);
                setActiveProvider(null);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {manualOpen ? (
                <ChevronDown data-icon="inline-start" />
              ) : (
                <ChevronRight data-icon="inline-start" />
              )}
              {manualOpen
                ? t("media.actions.collapse")
                : t("media.actions.expand")}
            </Button>
          }
          title={t("media.sections.manualAdd")}
        />
        <div className="rounded-xl border bg-background px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("media.manualAdd.description", {
              count: availableCardsForCapability.length,
            })}
          </p>
          {manualOpen ? (
            <div className="mt-3 flex flex-col gap-2">
              {availableCardsForCapability.map((card) => (
                <ProviderAddRow
                  active={activeProvider === card.id}
                  card={card}
                  disabled={savingCard !== null}
                  key={card.id}
                  onAdd={() => showProviderForm(card.id)}
                  t={t}
                >
                  {activeProvider === card.id ? (
                    <ProviderForm
                      advancedOpen={advancedOpen}
                      card={card}
                      disabled={savingCard !== null}
                      hasChanges={hasMediaProviderCardChanges(
                        card,
                        settings,
                        baselineSettings,
                      )}
                      onAdvancedToggle={() => setAdvancedOpen((open) => !open)}
                      onCancel={() => setActiveProvider(null)}
                      onFieldChange={updateField}
                      onSave={() => void handleSave(card.id)}
                      saving={savingCard === card.id}
                      settings={settings}
                      selectedCapability={selectedCapability}
                      t={t}
                    />
                  ) : null}
                </ProviderAddRow>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {feedback ? (
        <p
          className={`text-sm ${
            feedback.type === "success" ? "text-success" : "text-destructive"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("media.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("media.description")}
        </p>
      </div>

      <Tabs
        className="gap-6"
        onValueChange={handleCapabilityValueChange}
        value={selectedCapability}
      >
        <TabsList className="grid h-auto min-h-16 w-full grid-cols-2 items-stretch justify-stretch gap-2 rounded-2xl border bg-muted/20 p-2 shadow-inner">
          <CapabilityStatus
            ready={imageReady}
            label={t("media.capabilities.image")}
            readyLabel={t("media.status.ready")}
            unconfiguredLabel={t("media.status.notConfigured")}
            value="image"
          />
          <CapabilityStatus
            ready={videoReady}
            label={t("media.capabilities.video")}
            readyLabel={t("media.status.ready")}
            unconfiguredLabel={t("media.status.notConfigured")}
            value="video"
          />
        </TabsList>
        <TabsContent value="image" className="flex flex-col gap-6">
          {selectedCapability === "image" ? capabilitySections : null}
        </TabsContent>
        <TabsContent value="video" className="flex flex-col gap-6">
          {selectedCapability === "video" ? capabilitySections : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CapabilityStatus({
  label,
  ready,
  readyLabel,
  unconfiguredLabel,
  value,
}: {
  label: string;
  ready: boolean;
  readyLabel: string;
  unconfiguredLabel: string;
  value: MediaCapability;
}) {
  return (
    <TabsTrigger
      className="h-auto min-h-12 justify-start rounded-xl px-4 py-3 text-left data-active:border-border data-active:bg-background data-active:shadow-md"
      value={value}
    >
      <span
        className={`size-2 rounded-full ${
          ready
            ? "bg-success"
            : "border border-muted-foreground/60 bg-transparent"
        }`}
      />
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-sm font-normal text-muted-foreground">
          {ready ? readyLabel : unconfiguredLabel}
        </span>
      </span>
    </TabsTrigger>
  );
}

function ConnectedServiceRow({
  capabilities,
  meta,
  name,
  onSettings,
  settingsLabel,
  status,
  tCapability,
}: {
  capabilities: MediaCapability[];
  meta: string;
  name: string;
  onSettings: () => void;
  settingsLabel: string;
  status?: string | undefined;
  tCapability: (capability: MediaCapability) => string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">{name}</h4>
          {capabilities.map((capability) => (
            <Badge key={capability} variant="secondary">
              {tCapability(capability)}
            </Badge>
          ))}
          {status ? (
            <span className="text-xs font-medium text-success">{status}</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      </div>
      <Button onClick={onSettings} size="sm" type="button" variant="outline">
        {settingsLabel}
      </Button>
    </div>
  );
}

function CodexPermissionControl({
  disabled,
  hasChanges,
  onSave,
  onValueChange,
  saving,
  t,
  value,
}: {
  disabled: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onValueChange: (value: WorkspaceSettings["codexImagegenDelegation"]) => void;
  saving: boolean;
  t: Translate;
  value: WorkspaceSettings["codexImagegenDelegation"];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Label htmlFor="codex-imagegen-delegation">
          {t("media.codexImagegen.title")}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(`media.codexImagegen.options.${value}.description`)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Select
          onValueChange={(nextValue) => {
            if (
              CODEX_IMAGEGEN_DELEGATION_OPTIONS.includes(
                nextValue as WorkspaceSettings["codexImagegenDelegation"],
              )
            ) {
              onValueChange(
                nextValue as WorkspaceSettings["codexImagegenDelegation"],
              );
            }
          }}
          value={value}
        >
          <SelectTrigger
            aria-label={t("media.codexImagegen.title")}
            className="h-8 w-[160px] bg-background"
            id="codex-imagegen-delegation"
          >
            <SelectValue>
              {t(`media.codexImagegen.options.${value}.label`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {CODEX_IMAGEGEN_DELEGATION_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`media.codexImagegen.options.${option}.label`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          disabled={!hasChanges || disabled}
          onClick={onSave}
          size="sm"
          type="button"
        >
          {saving ? t("media.actions.saving") : t("media.actions.save")}
        </Button>
      </div>
    </div>
  );
}

function ProviderAddRow({
  active,
  card,
  children,
  disabled,
  onAdd,
  t,
}: {
  active: boolean;
  card: MediaProviderCard;
  children: ReactNode;
  disabled: boolean;
  onAdd: () => void;
  t: Translate;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              {card.label}
            </h4>
            {card.capabilities.map((capability) => (
              <Badge key={capability} variant="secondary">
                {t(`media.capabilities.${capability}`)}
              </Badge>
            ))}
            {card.remarkKey ? (
              <span className="text-xs text-muted-foreground">
                {t(card.remarkKey)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(card.summaryKey)}
          </p>
        </div>
        <Button
          disabled={disabled}
          onClick={onAdd}
          size="sm"
          type="button"
          variant={active ? "secondary" : "outline"}
        >
          {active ? t("media.actions.adding") : t("media.actions.add")}
        </Button>
      </div>
      {children}
    </div>
  );
}

function ProviderForm({
  advancedOpen,
  card,
  disabled,
  hasChanges,
  onAdvancedToggle,
  onCancel,
  onFieldChange,
  onSave,
  saving,
  selectedCapability,
  settings,
  t,
}: {
  advancedOpen: boolean;
  card: MediaProviderCard;
  disabled: boolean;
  hasChanges: boolean;
  onAdvancedToggle: () => void;
  onCancel: () => void;
  onFieldChange: <Key extends keyof WorkspaceSettings>(
    key: Key,
    value: WorkspaceSettings[Key],
  ) => void;
  onSave: () => void;
  saving: boolean;
  selectedCapability: MediaCapability;
  settings: WorkspaceSettings;
  t: Translate;
}) {
  const primaryFields = card.fields.filter((field) => !field.advanced);
  const advancedFields = card.fields.filter((field) => field.advanced);
  const visibleModels = getModelsForCapability(card, selectedCapability);

  return (
    <div className="border-t bg-muted/20 p-3">
      <div className="grid gap-4 md:grid-cols-2">
        {primaryFields.map((field) => (
          <ProviderField
            card={card}
            field={field}
            key={field.key}
            onFieldChange={onFieldChange}
            settings={settings}
            t={t}
          />
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">
          {t("media.manualAdd.supportedModels")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {visibleModels.map((model) => (
            <Badge key={model.label} variant="outline">
              {model.label}
            </Badge>
          ))}
        </div>
      </div>

      {card.id === "agnes" ? (
        <div className="mt-4">
          <AgnesQuickstartHint />
        </div>
      ) : null}

      {advancedFields.length > 0 ? (
        <div className="mt-4">
          <Button
            onClick={onAdvancedToggle}
            size="sm"
            type="button"
            variant="ghost"
          >
            {advancedOpen ? (
              <ChevronDown data-icon="inline-start" />
            ) : (
              <ChevronRight data-icon="inline-start" />
            )}
            {t("media.manualAdd.advanced")}
          </Button>
          {advancedOpen ? (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {advancedFields.map((field) => (
                <ProviderField
                  card={card}
                  field={field}
                  key={field.key}
                  onFieldChange={onFieldChange}
                  settings={settings}
                  t={t}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t("media.localStorageNote")}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            disabled={disabled}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("media.actions.cancel")}
          </Button>
          <Button
            disabled={!hasChanges || disabled}
            onClick={onSave}
            size="sm"
            type="button"
          >
            {saving ? t("media.actions.saving") : t("media.actions.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProviderField({
  card,
  field,
  onFieldChange,
  settings,
  t,
}: {
  card: MediaProviderCard;
  field: MediaProviderCard["fields"][number];
  onFieldChange: <Key extends keyof WorkspaceSettings>(
    key: Key,
    value: WorkspaceSettings[Key],
  ) => void;
  settings: WorkspaceSettings;
  t: Translate;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${card.id}-${field.key}`}>{field.label}</Label>
      <Input
        id={`${card.id}-${field.key}`}
        onChange={(event) => onFieldChange(field.key, event.target.value)}
        placeholder={field.placeholder}
        value={settings[field.key]}
      />
      {field.apiKeyUrl ? (
        <a
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href={field.apiKeyUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("media.actions.getApiKey", {
            provider: card.label,
          })}
          <ExternalLink data-icon="inline-end" />
        </a>
      ) : null}
      {field.advanced ? (
        <p className="text-xs text-muted-foreground">
          {t("media.manualAdd.advancedHint")}
        </p>
      ) : null}
    </div>
  );
}
