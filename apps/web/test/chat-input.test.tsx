// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "../src/components/chat-input";

const {
  agentModelRequirementMock,
  fetchImageModelsMock,
  fetchVideoModelsMock,
} = vi.hoisted(() => ({
  agentModelRequirementMock: vi.fn(),
  fetchImageModelsMock: vi.fn(),
  fetchVideoModelsMock: vi.fn(),
}));

vi.mock("../src/hooks/use-agent-model-requirement", () => ({
  useAgentModelRequirement: () => agentModelRequirementMock(),
}));

vi.mock("../src/hooks/use-image-model-preference", () => ({
  useImageModelPreference: () => ({
    preference: { mode: "auto" },
  }),
}));

vi.mock("../src/hooks/use-video-model-preference", () => ({
  useVideoModelPreference: () => ({
    preference: { mode: "auto" },
  }),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchImageModels: fetchImageModelsMock,
  fetchVideoModels: fetchVideoModelsMock,
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
  beforeEach(() => {
    agentModelRequirementMock.mockReturnValue({
      model: "local:assistant",
      isAgentModelConfigured: true,
      ensureAgentModelConfigured: vi.fn().mockResolvedValue(true),
    });
    fetchImageModelsMock.mockResolvedValue({
      models: [{ id: "agnes-image", displayName: "Agnes Image" }],
    });
    fetchVideoModelsMock.mockResolvedValue({
      models: [{ id: "agnes-video", displayName: "Agnes Video" }],
    });
  });

  afterEach(() => {
    cleanup();
    agentModelRequirementMock.mockReset();
    fetchImageModelsMock.mockReset();
    fetchVideoModelsMock.mockReset();
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
    render(<ChatInput onSend={vi.fn()} onAddFiles={vi.fn()} />);

    expect(screen.getByText("Attach images")).toBeInTheDocument();
    expect(screen.getByText("Image/Video model")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Image/Video model" }),
    ).toBeInTheDocument();
  });

  it("renders a configuration banner above the input when agent and media models are missing", async () => {
    agentModelRequirementMock.mockReturnValue({
      model: null,
      isAgentModelConfigured: false,
      ensureAgentModelConfigured: vi.fn().mockResolvedValue(false),
    });
    fetchImageModelsMock.mockResolvedValueOnce({ models: [] });
    fetchVideoModelsMock.mockResolvedValueOnce({ models: [] });

    render(<ChatInput onSend={vi.fn()} />);

    expect(
      await screen.findByText("未配置 Agent 模型、图片模型、视频模型"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Agnes 提供免费的文本、生图、生视频模型能力/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "配置 Agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "配置媒体模型" }),
    ).toBeInTheDocument();
  });
});
