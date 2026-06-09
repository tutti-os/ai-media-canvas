// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomePrompt } from "../src/components/home-prompt";
import { i18n } from "../src/i18n";
import type { HomeExampleSelection } from "../src/lib/home-example-seeds";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";

const {
  agentModelRequirementMock,
  fetchImageModelsMock,
  fetchVideoModelsMock,
  fetchWorkspaceSettingsMock,
  settingsDialogSpy,
} = vi.hoisted(() => ({
  agentModelRequirementMock: vi.fn(),
  fetchImageModelsMock: vi.fn(),
  fetchVideoModelsMock: vi.fn(),
  fetchWorkspaceSettingsMock: vi.fn(),
  settingsDialogSpy: vi.fn(),
}));

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => <div data-testid="agent-model-selector" />,
}));

vi.mock("../src/components/settings-dialog", () => ({
  SettingsDialog: ({
    open,
    initialTab,
  }: {
    open: boolean;
    initialTab?: "agent" | "media";
  }) => {
    settingsDialogSpy({ open, initialTab });
    return open ? (
      <div>
        {initialTab === "media" ? "Mock Media Settings" : "Mock Agent Settings"}
      </div>
    ) : null;
  },
}));

vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: ({
    open,
    onOpenSettings,
  }: {
    open: boolean;
    onOpenSettings?: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onOpenSettings}>
        Open media settings
      </button>
    ) : null,
}));

vi.mock("../src/lib/server-api", () => ({
  fetchImageModels: fetchImageModelsMock,
  fetchVideoModels: fetchVideoModelsMock,
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
}));

vi.mock("../src/hooks/use-agent-model-requirement", () => ({
  AGENT_MODEL_REQUIRED_MESSAGE: "请先配置或选择一个 Agent 模型。",
  useAgentModelRequirement: () => agentModelRequirementMock(),
}));

vi.mock("../src/hooks/use-image-model-preference", () => ({
  useImageModelPreference: () => ({
    preference: { mode: "auto", models: [] },
  }),
}));

vi.mock("../src/hooks/use-video-model-preference", () => ({
  useVideoModelPreference: () => ({
    preference: { mode: "auto", models: [] },
  }),
}));

describe("HomePrompt", () => {
  afterEach(() => {
    cleanup();
    agentModelRequirementMock.mockReset();
    agentModelRequirementMock.mockReturnValue({
      model: "local:assistant",
      isAgentModelConfigured: true,
      ensureAgentModelConfigured: vi.fn().mockResolvedValue(true),
    });
    settingsDialogSpy.mockClear();
    vi.clearAllMocks();
  });

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

  it("sends selected example image mentions as initial attachments", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const selectedSeed: HomeExampleSelection = {
      categoryKey: "visual-concepts",
      categoryLabel: "Visual Concepts",
      exampleId: "visual-magazine-cover",
      title: "Turn a selfie into a magazine cover",
      prompt: "Make this editorial",
      previewImages: [],
      inputMentions: [
        {
          type: "image",
          name: "Selfie",
          imgSrc: "/images/home-seeds/generated/input-selfie-source.png",
        },
      ],
    };

    render(
      <HomePrompt
        onSubmit={onSubmit}
        attachments={[]}
        readyAttachments={[]}
        selectedSeed={selectedSeed}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("让 AI Media Canvas 帮你设计..."),
      "请把这张自拍扩展成时尚杂志封面方案",
    );
    await user.click(screen.getByRole("button", { name: "提交 prompt" }));

    expect(onSubmit).toHaveBeenCalledWith(
      "请把这张自拍扩展成时尚杂志封面方案",
      [
        expect.objectContaining({
          assetId: "seed-visual-concepts-0-selfie",
          mimeType: "image/png",
          name: "Selfie",
          source: "upload",
          url: expect.stringMatching(
            /\/images\/home-seeds\/generated\/input-selfie-source\.png$/,
          ),
        }),
      ],
      undefined,
      undefined,
      "local:assistant",
    );
  });

  it("does not render an empty preview strip when the selected seed has no image mentions", () => {
    const onSubmit = vi.fn();
    const designSeed = homeExampleSeedCategories.find(
      (category) => category.key === "design",
    )?.examples[0];

    expect(designSeed).toBeDefined();

    const { container } = render(
      <HomePrompt
        onSubmit={onSubmit}
        selectedSeed={{
          categoryKey: "design",
          categoryLabel: "Design",
          exampleId: designSeed?.id ?? "",
          title: designSeed?.title ?? "",
          prompt: designSeed?.prompt ?? "",
          previewImages: designSeed?.previewImages ?? [],
          inputMentions: designSeed?.inputMentions ?? [],
        }}
      />,
    );

    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).not.toBeInTheDocument();
  });

  it("opens agent settings instead of submitting when no agent model is configured", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    agentModelRequirementMock.mockReturnValue({
      model: null,
      ensureAgentModelConfigured: vi.fn().mockResolvedValue(false),
    });

    render(<HomePrompt onSubmit={onSubmit} />);

    await user.type(
      screen.getByPlaceholderText("让 AI Media Canvas 帮你设计..."),
      "生成一张海报",
    );
    await user.click(screen.getByRole("button", { name: "提交 prompt" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText("Mock Agent Settings")).toBeInTheDocument();
    expect(
      screen.queryByText("请先配置或选择一个 Agent 模型。"),
    ).not.toBeInTheDocument();
  });

  it("renders a configuration banner above the prompt when agent and media models are missing", async () => {
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

    render(<HomePrompt onSubmit={vi.fn()} />);

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

  it("uses provider settings instead of model catalog entries when deciding media configuration", async () => {
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

    render(<HomePrompt onSubmit={vi.fn()} />);

    expect(
      await screen.findByText("未配置 图片模型、视频模型"),
    ).toBeInTheDocument();
  });

  it("renders tooltip labels for prompt toolbar icon buttons", () => {
    render(<HomePrompt onSubmit={vi.fn()} onAddFiles={vi.fn()} />);

    expect(screen.getByText("添加图片")).toBeInTheDocument();
    expect(screen.getByText("添加图片")).toHaveClass("top-full");
    expect(screen.getByText("图片/视频模型")).toBeInTheDocument();
    expect(screen.getByText("图片/视频模型")).toHaveClass("top-full");
    expect(
      screen.getByRole("button", { name: "图片/视频模型" }),
    ).toBeInTheDocument();
  });

  it("opens the media settings tab from the image/video model popover", async () => {
    const user = userEvent.setup();

    render(<HomePrompt onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "图片/视频模型" }));
    await user.click(
      screen.getByRole("button", { name: "Open media settings" }),
    );

    expect(await screen.findByText("Mock Media Settings")).toBeInTheDocument();
    expect(settingsDialogSpy).toHaveBeenLastCalledWith({
      open: true,
      initialTab: "media",
    });
  });
});
