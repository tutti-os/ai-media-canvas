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
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-left shadow-[0_2px_8px_rgba(146,64,14,0.08)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-xs leading-relaxed text-amber-950">
        <div className="font-medium">未配置 {formatMissingLabels(missing)}</div>
        <div className="text-amber-900/80">
          Agnes 提供免费的文本、生图、生视频模型能力，可以申请 API Key 后配置。
          <a
            href={AGNES_API_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 font-medium underline underline-offset-2 transition-colors hover:text-amber-700"
          >
            申请 Agnes API Key
          </a>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {missing.includes("agent") ? (
          <button
            type="button"
            onClick={onConfigureAgent}
            className="h-7 rounded-md border border-amber-300 bg-white/80 px-2.5 text-xs font-medium text-amber-950 transition-colors hover:bg-white"
          >
            配置 Agent
          </button>
        ) : null}
        {missingMedia ? (
          <button
            type="button"
            onClick={onConfigureMedia}
            className="h-7 rounded-md bg-amber-950 px-2.5 text-xs font-medium text-white transition-colors hover:bg-amber-900"
          >
            配置媒体模型
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { MissingModelConfiguration };
