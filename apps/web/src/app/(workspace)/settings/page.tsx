"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ProfileSection } from "@/components/profile-section";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { LOCAL_ACCESS_TOKEN } from "@/lib/auth-context";
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
  const [profile, setProfile] = useState<{
    displayName: string;
    email: string;
  } | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const hasInitialized = useRef(false);

  const getToken = useCallback(() => LOCAL_ACCESS_TOKEN, []);

  const loadData = useCallback(async () => {
    setPageLoading(true);

    try {
      const viewer = await fetchViewer(getToken());

      setProfile({
        displayName: viewer.profile.displayName,
        email: viewer.profile.email,
      });
    } catch {
      setProfile(null);
    } finally {
      setPageLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData]);

  const handleProfileSave = useCallback(
    async (displayName: string) => {
      const result = await updateProfile(getToken(), { displayName });
      setProfile({
        displayName: result.profile.displayName,
        email: result.profile.email,
      });
    },
    [getToken],
  );

  if (pageLoading) {
    return <SettingsSkeleton />;
  }

  if (!profile) return null;

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <h1 className="mb-4 text-base font-semibold sm:mb-6 sm:text-lg">
        Settings
      </h1>

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
          email={profile.email}
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
