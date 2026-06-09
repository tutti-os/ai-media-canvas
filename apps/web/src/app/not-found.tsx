"use client";

import Link from "next/link";

import { useAppTranslation } from "@/i18n";

export default function NotFound() {
  const { t } = useAppTranslation("errors");

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-muted-foreground">{t("notFound.message")}</p>
      <Link
        href="/projects"
        className="text-sm text-foreground underline underline-offset-4 hover:opacity-70"
      >
        {t("notFound.backToProjects")}
      </Link>
    </div>
  );
}
