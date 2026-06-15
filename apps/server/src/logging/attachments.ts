type AttachmentLike = {
  assetId?: string | undefined;
  mimeType?: string | undefined;
  name?: string | undefined;
  source?: string | undefined;
  url?: string | undefined;
};

export type AttachmentLogSummary = {
  assetId: string;
  index: number;
  mimeType: string;
  name?: string;
  source: string;
  urlBytes: number;
  urlKind: string;
  dataMimeType?: string;
  estimatedDataBytes?: number;
  urlHost?: string;
  urlPath?: string;
};

export function summarizeImageAttachments(
  attachments: readonly AttachmentLike[] | undefined,
): AttachmentLogSummary[] {
  return (attachments ?? []).map((attachment, index) => {
    const url = attachment.url ?? "";
    const summary: AttachmentLogSummary = {
      assetId: attachment.assetId ?? "unknown",
      index: index + 1,
      mimeType: attachment.mimeType ?? "unknown",
      ...(attachment.name ? { name: attachment.name } : {}),
      source: attachment.source ?? "unknown",
      urlBytes: Buffer.byteLength(url, "utf8"),
      urlKind: classifyUrl(url),
    };

    const dataUriMatch = /^data:([^;]+);base64,(.*)$/s.exec(url);
    if (dataUriMatch) {
      return {
        ...summary,
        dataMimeType: dataUriMatch[1] ?? "unknown",
        estimatedDataBytes: estimateBase64Bytes(dataUriMatch[2] ?? ""),
      };
    }

    try {
      const parsed = new URL(url);
      return {
        ...summary,
        urlHost: parsed.host,
        urlPath: parsed.pathname,
      };
    } catch {
      return summary;
    }
  });
}

function classifyUrl(url: string) {
  if (url.startsWith("data:")) return "data";
  if (url.startsWith("blob:")) return "blob";
  try {
    return new URL(url).protocol.replace(/:$/, "") || "unknown";
  } catch {
    return "invalid";
  }
}

function estimateBase64Bytes(base64: string) {
  const normalized = base64.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}
