import { describe, expect, it } from "vitest";

import { summarizeImageAttachments } from "./attachments.js";

describe("summarizeImageAttachments", () => {
  it("summarizes attachment URLs without logging full data URLs", () => {
    const summary = summarizeImageAttachments([
      {
        assetId: "canvas-image-1",
        url: "data:image/png;base64,QUFBQQ==",
        mimeType: "image/png",
        name: "Canvas selection abc123",
      },
      {
        assetId: "uploaded-1",
        url: "http://127.0.0.1:3001/local-assets/asset-1",
        mimeType: "image/png",
      },
    ]);

    expect(summary).toEqual([
      {
        assetId: "canvas-image-1",
        index: 1,
        mimeType: "image/png",
        name: "Canvas selection abc123",
        source: "unknown",
        urlBytes: 30,
        urlKind: "data",
        dataMimeType: "image/png",
        estimatedDataBytes: 4,
      },
      {
        assetId: "uploaded-1",
        index: 2,
        mimeType: "image/png",
        source: "unknown",
        urlBytes: 42,
        urlKind: "http",
        urlHost: "127.0.0.1:3001",
        urlPath: "/local-assets/asset-1",
      },
    ]);
    expect(JSON.stringify(summary)).not.toContain("QUFBQQ==");
  });
});
