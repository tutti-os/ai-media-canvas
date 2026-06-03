"use client";

const AGNES_API_KEYS_URL = "https://platform.agnes-ai.com/settings/apiKeys";
const AGNES_QUICKSTART_URL = "https://agnes-ai.com/doc/quick-start";

export function AgnesQuickstartHint() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm">
      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
        Free
      </span>
      <span className="text-foreground">Agnes offers a free starter route.</span>
      <a
        href={AGNES_API_KEYS_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-emerald-700 underline underline-offset-2 transition-colors hover:text-emerald-800"
      >
        Get Agnes API Key
      </a>
      <a
        href={AGNES_QUICKSTART_URL}
        target="_blank"
        rel="noreferrer"
        className="text-emerald-700/80 underline underline-offset-2 transition-colors hover:text-emerald-800"
      >
        Quick Start Docs
      </a>
    </div>
  );
}
