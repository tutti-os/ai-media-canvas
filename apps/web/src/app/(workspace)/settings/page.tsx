"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsPanel, isSettingsTab } from "@/components/settings-panel";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab = isSettingsTab(requestedTab) ? requestedTab : "agent";

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <h1 className="mb-4 text-base font-semibold sm:mb-6 sm:text-lg">
        Settings
      </h1>
      <div className="max-w-6xl">
        <SettingsPanel initialTab={initialTab} surface="page" />
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
