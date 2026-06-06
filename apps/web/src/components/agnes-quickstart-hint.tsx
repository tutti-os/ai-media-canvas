"use client";

const AGNES_API_KEYS_URL = "https://platform.agnes-ai.com/settings/apiKeys";
const AGNES_QUICKSTART_URL = "https://agnes-ai.com/doc/quick-start";

export function AgnesQuickstartHint() {
  return (
    <div className="aimc-notice-surface flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="aimc-notice-badge rounded-full border px-2 py-0.5 text-[11px] font-semibold">
        Free
      </span>
      <span className="text-muted-foreground">
        Agnes offers a free starter route.
      </span>
      <a
        href={AGNES_API_KEYS_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
      >
        Get Agnes API Key
      </a>
      <a
        href={AGNES_QUICKSTART_URL}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
      >
        Quick Start Docs
      </a>
    </div>
  );
}
