"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ProfileSection } from "@/components/profile-section";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { Button } from "@/components/ui/button";
import {
  fetchViewer,
  updateProfile,
} from "@/lib/server-api";

type SettingsTab = "general";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "General" },
];

function SettingsPageContent() {
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get("tab") as SettingsTab) ?? "general";
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabs.some((t) => t.id === initialTab) ? initialTab : "general",
  );
  const [profile, setProfile] = useState<{ displayName: string } | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasInitialized = useRef(false);

  const loadData = useCallback(async () => {
    setPageLoading(true);

    try {
      const viewer = await fetchViewer();

      setProfile({
        displayName: viewer.profile.displayName,
      });
      setLoadError(null);
    } catch {
      setLoadError("Failed to load local settings. Please try again.");
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData]);

  const handleProfileSave = useCallback(
    async (displayName: string) => {
      const result = await updateProfile({ displayName });
      setProfile({
        displayName: result.profile.displayName,
      });
    },
    [],
  );

  if (pageLoading) {
    return <SettingsSkeleton />;
  }

  if (!profile) {
    return (
      <div className="px-4 py-10 sm:px-6 md:p-8">
        <div className="max-w-md rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-base font-semibold text-foreground">
            Settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError ?? "Unable to load local settings right now."}
          </p>
          <Button className="mt-4" onClick={() => void loadData()} size="sm">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <h1 className="mb-4 text-base font-semibold sm:mb-6 sm:text-lg">
        Settings
      </h1>

      {loadError && (
        <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {/* Tab bar -- scrollable on small screens, 44px min touch target */}
      <div className="mb-6 overflow-x-auto sm:mb-8">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] whitespace-nowrap rounded-md px-4 py-1.5 text-sm transition-colors sm:min-h-0 sm:px-3 ${
                activeTab === tab.id
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-xl">
        <ProfileSection
          displayName={profile.displayName}
          onSave={handleProfileSave}
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsPageContent />
    </Suspense>
  );
}
