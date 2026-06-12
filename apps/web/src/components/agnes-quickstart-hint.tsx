"use client";

import { useAppTranslation } from "@/i18n";

const AGNES_API_KEYS_URL = "https://platform.agnes-ai.com/settings/apiKeys";
const AGNES_QUICKSTART_URL = "https://agnes-ai.com/doc/quick-start";

export function AgnesQuickstartHint() {
  const { t } = useAppTranslation("settings");

  return (
    <div className="aimc-notice-surface flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="aimc-notice-badge rounded-full border px-2 py-0.5 text-[11px] font-semibold">
        {t("media.agnesHint.free")}
      </span>
      <span className="text-muted-foreground">
        {t("media.agnesHint.description")}
      </span>
      <a
        href={AGNES_API_KEYS_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
      >
        {t("media.agnesHint.getKey")}
      </a>
      <a
        href={AGNES_QUICKSTART_URL}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
      >
        {t("media.agnesHint.quickStart")}
      </a>
    </div>
  );
}
