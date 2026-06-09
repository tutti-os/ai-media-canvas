"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { useAppTranslation } from "@/i18n";

export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useAppTranslation("navigation");

  return (
    <div className="flex h-[100dvh] flex-col md:flex-row">
      {/* Skip navigation link -- visible only on keyboard focus for a11y */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-md focus:shadow-lg"
      >
        {t("skipToMain")}
      </a>
      <AppSidebar />
      {/* pb-14 on mobile for the fixed bottom navigation bar, reset on md+ */}
      <main
        id="main"
        aria-label={t("mainRegion")}
        className="relative flex-1 overflow-auto pb-14 md:pb-0"
      >
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
