"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceSettings } from "@aimc/shared";

import { AgentSettingsSection } from "@/components/agent-settings-section";
import { MediaSettingsSection } from "@/components/media-settings-section";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { Button } from "@/components/ui/button";
import {
  fetchWorkspaceSettings,
  updateWorkspaceSettings,
} from "@/lib/server-api";

export type SettingsTab = "agent" | "media";

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  description: string;
}> = [
  {
    id: "agent",
    label: "Agent",
    description: "LLM protocols and default model",
  },
  {
    id: "media",
    label: "Media",
    description: "Image and video provider routing",
  },
];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

interface SettingsPanelProps {
  initialTab?: SettingsTab;
  surface?: "page" | "dialog";
}

export function SettingsPanel({
  initialTab = "agent",
  surface = "page",
}: SettingsPanelProps) {
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
      setLoadError("Failed to load local settings. Please try again.");
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData]);

  const handleWorkspaceSettingsSave = useCallback(
    async (settings: WorkspaceSettings) => {
      const result = await updateWorkspaceSettings(settings);
      setWorkspaceSettings(result.settings);
    },
    [],
  );

  const activeSection = useMemo(() => {
    if (!workspaceSettings) return null;
    switch (activeTab) {
      case "agent":
        return (
          <AgentSettingsSection
            settings={workspaceSettings}
            onSave={handleWorkspaceSettingsSave}
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
  }, [activeTab, handleWorkspaceSettingsSave, workspaceSettings]);

  if (panelLoading) {
    return <SettingsSkeleton />;
  }

  if (!workspaceSettings) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Settings</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {loadError ?? "Unable to load local settings right now."}
        </p>
        <Button className="mt-4" onClick={() => void loadData()} size="sm">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        surface === "dialog"
          ? "flex min-h-[64vh] flex-col md:flex-row"
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
                {tab.label}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {tab.description}
              </div>
            </button>
          ))}
        </nav>
      </aside>

      <section
        className={
          surface === "dialog"
            ? "max-h-[78vh] min-w-0 flex-1 overflow-y-auto p-6 md:min-w-[560px] lg:min-w-[700px]"
            : "min-h-[640px] flex-1 p-6 md:p-8"
        }
      >
        {loadError ? (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {activeSection}
      </section>
    </div>
  );
}
