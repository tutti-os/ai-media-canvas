// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "../src/components/chat-input";

vi.mock("../src/hooks/use-image-model-preference", () => ({
  useImageModelPreference: () => ({
    preference: { mode: "auto" },
  }),
}));

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => <div>Agent model selector</div>,
}));

vi.mock("../src/components/image-attachment-bar", () => ({
  ImageAttachmentBar: () => <div>Attachment bar</div>,
}));

vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
}));

vi.mock("../src/components/settings-dialog", () => ({
  SettingsDialog: () => null,
}));

describe("ChatInput", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not enable send for attachments that are not ready to send", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        attachments={[
          {
            id: "uploading-1",
            status: "failed",
            file: new File(["x"], "broken.png", { type: "image/png" }),
            previewUrl: "blob://broken",
            error: "Upload failed",
          },
        ]}
        canSendAttachments={false}
        onRemoveAttachment={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.at(-1)).toBeDisabled();
  });

  it("renders tooltip labels for prompt toolbar icon buttons", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onAddFiles={vi.fn()}
      />,
    );

    expect(screen.getByText("Attach images")).toBeInTheDocument();
    expect(screen.getByText("Image/Video model")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Image/Video model" }),
    ).toBeInTheDocument();
  });
});
