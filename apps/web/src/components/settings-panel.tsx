"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceSettings } from "@aimc/shared";

import { AgentSettingsSection } from "@/components/agent-settings-section";
import { MediaSettingsSection } from "@/components/media-settings-section";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AppLocale,
  persistLocalePreference,
  supportedLocales,
  useAppTranslation,
} from "@/i18n";
import type { AgentModelSourceTab } from "@/lib/agent-model-groups";
import {
  fetchWorkspaceSettings,
  updateWorkspaceSettings,
} from "@/lib/server-api";
import { notifyWorkspaceSettingsUpdated } from "@/lib/workspace-settings-events";

export type SettingsTab = "general" | "agent" | "media";

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    id: "general",
    labelKey: "tabs.general.label",
    descriptionKey: "tabs.general.description",
  },
  {
    id: "agent",
    labelKey: "tabs.agent.label",
    descriptionKey: "tabs.agent.description",
  },
  {
    id: "media",
    labelKey: "tabs.media.label",
    descriptionKey: "tabs.media.description",
  },
];

function syncLocalePreference(locale: AppLocale) {
  persistLocalePreference(locale);
  document.documentElement.setAttribute("lang", locale);
  window.setTimeout(() => {
    document.documentElement.setAttribute("lang", locale);
  }, 0);
}

export function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

interface SettingsPanelProps {
  initialTab?: SettingsTab;
  initialAgentSourceTab?: AgentModelSourceTab | undefined;
  onSaved?: (() => void) | undefined;
  surface?: "page" | "dialog";
}

export function SettingsPanel({
  initialTab = "agent",
  initialAgentSourceTab,
  onSaved,
  surface = "page",
}: SettingsPanelProps) {
  const { t } = useAppTranslation("settings");
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [workspaceSettings, setWorkspaceSettings] =
    useState<WorkspaceSettings | null>(null);
  const [panelLoading, setPanelLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadData = useCallback(async () => {
    setPanelLoading(true);

    try {
      const settingsResponse = await fetchWorkspaceSettings();
      setWorkspaceSettings(settingsResponse.settings);
      setLoadError(null);
    } catch {
      setLoadError(t("status.loadFailed"));
    } finally {
      setPanelLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData]);

  const handleWorkspaceSettingsSave = useCallback(
    async (settings: WorkspaceSettings) => {
      const result = await updateWorkspaceSettings(settings);
      setWorkspaceSettings(result.settings);
      notifyWorkspaceSettingsUpdated();
    },
    [],
  );

  const activeSection = useMemo(() => {
    if (!workspaceSettings) return null;
    switch (activeTab) {
      case "general":
        return <GeneralSettingsSection />;
      case "agent":
        return (
          <AgentSettingsSection
            initialSourceTab={initialAgentSourceTab}
            onSaved={onSaved}
            settings={workspaceSettings}
            onSave={handleWorkspaceSettingsSave}
            surface={surface}
          />
        );
      case "media":
        return (
          <MediaSettingsSection
            settings={workspaceSettings}
            onSave={handleWorkspaceSettingsSave}
          />
        );
    }
  }, [
    activeTab,
    handleWorkspaceSettingsSave,
    initialAgentSourceTab,
    onSaved,
    surface,
    workspaceSettings,
  ]);

  if (panelLoading) {
    return <SettingsSkeleton />;
  }

  if (!workspaceSettings) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {loadError ?? t("status.loadUnavailable")}
        </p>
        <Button className="mt-4" onClick={() => void loadData()} size="sm">
          {t("common:actions.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        surface === "dialog"
          ? "flex min-h-0 flex-1 flex-col md:flex-row"
          : "overflow-hidden rounded-[28px] border bg-card shadow-sm"
      }
    >
      <aside className="border-b bg-muted/20 p-4 md:w-64 md:shrink-0 md:border-b-0 md:border-r lg:w-72">
        <nav className="grid gap-3">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                activeTab === tab.id
                  ? "border-accent/40 bg-background shadow-sm"
                  : "border-transparent bg-transparent hover:border-border hover:bg-background/70"
              }`}
            >
              <div className="text-sm font-medium text-foreground">
                {t(tab.labelKey)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t(tab.descriptionKey)}
              </div>
            </button>
          ))}
        </nav>
      </aside>

      <section
        className={
          surface === "dialog"
            ? "flex min-w-0 flex-1 flex-col md:min-w-[560px] lg:min-w-[700px]"
            : "min-h-[640px] flex-1 p-6 md:p-8"
        }
      >
        {loadError ? (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {surface === "dialog" && activeTab === "general" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
            {activeSection}
          </div>
        ) : surface === "dialog" && activeTab === "media" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
            {activeSection}
          </div>
        ) : (
          activeSection
        )}
      </section>
    </div>
  );
}

function GeneralSettingsSection() {
  const { i18n, t } = useAppTranslation("settings");
  const currentLocale =
    i18n.language === "en" || i18n.language === "zh-CN"
      ? i18n.language
      : "zh-CN";
  const localeItems = supportedLocales.map((locale) => ({
    label:
      locale === "en"
        ? t("general.languageOptions.en")
        : t("general.languageOptions.zhCN"),
    value: locale,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {t("general.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("general.description")}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <label
            htmlFor="aimc-language-select"
            className="text-sm font-medium text-foreground"
          >
            {t("general.languageLabel")}
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("general.languageDescription")}
          </p>
        </div>
        <Select
          items={localeItems}
          onValueChange={(locale) => {
            const nextLocale = locale as AppLocale;
            syncLocalePreference(nextLocale);
            void i18n.changeLanguage(nextLocale).finally(() => {
              syncLocalePreference(nextLocale);
            });
          }}
          value={currentLocale}
        >
          <SelectTrigger
            id="aimc-language-select"
            aria-label={t("general.languageLabel")}
            className="h-9 min-w-48 bg-background"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {localeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
