"use client";

type MissingModelConfiguration = "agent" | "image" | "video";

const MODEL_LABELS: Record<MissingModelConfiguration, string> = {
  agent: "Agent 模型",
  image: "图片模型",
  video: "视频模型",
};

const AGNES_API_KEYS_URL = "https://platform.agnes-ai.com/settings/apiKeys";

function formatMissingLabels(missing: MissingModelConfiguration[]) {
  return missing.map((item) => MODEL_LABELS[item]).join("、");
}

export function ModelConfigurationBanner({
  missing,
  onConfigureAgent,
  onConfigureMedia,
}: {
  missing: MissingModelConfiguration[];
  onConfigureAgent: () => void;
  onConfigureMedia: () => void;
}) {
  if (missing.length === 0) return null;

  const missingMedia = missing.some(
    (item) => item === "image" || item === "video",
  );

  return (
    <div className="aimc-notice-surface flex flex-col gap-3 rounded-lg border px-3 py-2.5 text-left md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 text-xs leading-relaxed text-foreground">
        <div className="font-medium">未配置 {formatMissingLabels(missing)}</div>
        <div className="text-muted-foreground">
          Agnes 提供免费的文本、生图、生视频模型能力，可以申请 API Key 后配置。
          <a
            href={AGNES_API_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 whitespace-nowrap font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
          >
            申请 Agnes API Key
          </a>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 self-start md:self-center">
        {missing.includes("agent") ? (
          <button
            type="button"
            onClick={onConfigureAgent}
            className="h-7 rounded-md border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
          >
            配置 Agent
          </button>
        ) : null}
        {missingMedia ? (
          <button
            type="button"
            onClick={onConfigureMedia}
            className="h-7 rounded-md border border-foreground bg-foreground px-2.5 text-xs font-medium text-background transition-colors hover:bg-foreground/85"
          >
            配置媒体模型
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { MissingModelConfiguration };
