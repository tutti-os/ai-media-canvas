// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "../src/components/chat-input";
import { i18n } from "../src/i18n";

const {
  agentModelRequirementMock,
  fetchImageModelsMock,
  fetchVideoModelsMock,
  fetchWorkspaceSettingsMock,
} = vi.hoisted(() => ({
  agentModelRequirementMock: vi.fn(),
  fetchImageModelsMock: vi.fn(),
  fetchVideoModelsMock: vi.fn(),
  fetchWorkspaceSettingsMock: vi.fn(),
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
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
}));

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => <div>Agent model selector</div>,
}));

vi.mock("../src/components/image-attachment-bar", () => ({
  ImageAttachmentBar: () => <div>Attachment bar</div>,
}));

vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: ({ trigger }: { trigger?: ReactNode }) => (
    <>{trigger}</>
  ),
}));

vi.mock("../src/components/settings-dialog", () => ({
  SettingsDialog: () => null,
}));

describe("ChatInput", () => {
  beforeEach(() => {
    void i18n.changeLanguage("zh-CN");
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
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        agnesApiKey: "sk-local-agnes",
        replicateApiToken: "",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        openAIApiKey: "",
        volcesApiKey: "",
      },
    });
  });

  afterEach(() => {
    cleanup();
    agentModelRequirementMock.mockReset();
    fetchImageModelsMock.mockReset();
    fetchVideoModelsMock.mockReset();
    fetchWorkspaceSettingsMock.mockReset();
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

  it("renders tooltip labels for prompt toolbar icon buttons", async () => {
    render(<ChatInput onSend={vi.fn()} onAddFiles={vi.fn()} />);

    expect(
      await screen.findByRole("textbox", { name: "输入消息" }),
    ).toBeInTheDocument();
    expect(screen.getByText("添加图片")).toBeInTheDocument();
    expect(screen.getByText("图片/视频模型")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "图片/视频模型" }),
    ).toBeInTheDocument();
  });

  it("shows a cancel button while a response is running", () => {
    const onCancel = vi.fn();

    render(<ChatInput onSend={vi.fn()} onCancel={onCancel} isRunning />);

    const cancelButton = screen.getByRole("button", { name: "取消生成" });
    expect(cancelButton).toBeInTheDocument();

    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows an immediate pending indicator before a run can be canceled", () => {
    render(<ChatInput onSend={vi.fn()} isRunning />);

    const pendingButton = screen.getByRole("button", { name: "思考中" });
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pendingButton).toBeDisabled();
  });

  it("delegates agent model validation to the chat session owner", async () => {
    const ensureAgentModelConfigured = vi.fn().mockResolvedValue(false);
    const onSend = vi.fn().mockReturnValue(true);
    agentModelRequirementMock.mockReturnValue({
      model: null,
      isAgentModelConfigured: false,
      ensureAgentModelConfigured,
    });

    render(<ChatInput onSend={onSend} />);

    fireEvent.change(await screen.findByRole("textbox", { name: "输入消息" }), {
      target: { value: "保留单一校验责任" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSend).toHaveBeenCalledWith("保留单一校验责任");
    expect(ensureAgentModelConfigured).not.toHaveBeenCalled();
  });

  it("does not render a persistent configuration banner when agent and media models are missing", () => {
    agentModelRequirementMock.mockReturnValue({
      model: null,
      isAgentModelConfigured: false,
      ensureAgentModelConfigured: vi.fn().mockResolvedValue(false),
    });
    fetchImageModelsMock.mockResolvedValueOnce({ models: [] });
    fetchVideoModelsMock.mockResolvedValueOnce({ models: [] });
    fetchWorkspaceSettingsMock.mockResolvedValueOnce({
      settings: {
        agnesApiKey: "",
        replicateApiToken: "",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        openAIApiKey: "",
        volcesApiKey: "",
      },
    });

    render(<ChatInput onSend={vi.fn()} />);

    expect(
      screen.queryByText("未配置 Agent 模型、图片模型、视频模型"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "配置 Agent" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "去连接" }),
    ).not.toBeInTheDocument();
  });

  it("does not render a persistent media banner when media providers are missing", () => {
    fetchImageModelsMock.mockResolvedValueOnce({
      models: [{ id: "agnes-image", displayName: "Agnes Image" }],
    });
    fetchVideoModelsMock.mockResolvedValueOnce({
      models: [{ id: "agnes-video", displayName: "Agnes Video" }],
    });
    fetchWorkspaceSettingsMock.mockResolvedValueOnce({
      settings: {
        agnesApiKey: "",
        replicateApiToken: "",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        openAIApiKey: "",
        volcesApiKey: "",
      },
    });

    render(<ChatInput onSend={vi.fn()} />);

    expect(
      screen.queryByText("未配置 图片模型、视频模型"),
    ).not.toBeInTheDocument();
  });
});
