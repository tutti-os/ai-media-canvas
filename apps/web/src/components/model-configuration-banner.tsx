"use client";

import { useAppTranslation } from "@/i18n";

type MissingModelConfiguration = "agent" | "image" | "video";

export function ModelConfigurationBanner({
  missing,
  onConfigureAgent,
  onConfigureMedia,
}: {
  missing: MissingModelConfiguration[];
  onConfigureAgent: () => void;
  onConfigureMedia: () => void;
}) {
  const { i18n, t } = useAppTranslation("settings");
  if (missing.length === 0) return null;

  const missingMedia = missing.some(
    (item) => item === "image" || item === "video",
  );
  const listSeparator = i18n.language === "zh-CN" ? "、" : ", ";
  const missingLabels = missing
    .map((item) => t(`modelConfiguration.models.${item}`))
    .join(listSeparator);

  return (
    <div className="aimc-notice-surface flex flex-col gap-3 rounded-lg border px-3 py-2.5 text-left md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 text-xs leading-relaxed text-foreground">
        <div className="font-medium">
          {t("modelConfiguration.missing", { models: missingLabels })}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 self-start md:self-center">
        {missing.includes("agent") ? (
          <button
            type="button"
            onClick={onConfigureAgent}
            className="h-7 rounded-md border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
          >
            {t("modelConfiguration.configureAgent")}
          </button>
        ) : null}
        {missingMedia ? (
          <button
            type="button"
            onClick={onConfigureMedia}
            className="h-7 rounded-md border border-foreground bg-foreground px-2.5 text-xs font-medium text-background transition-colors hover:bg-foreground/85"
          >
            {t("modelConfiguration.configureMedia")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { MissingModelConfiguration };
