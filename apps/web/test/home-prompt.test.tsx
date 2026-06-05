// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeExampleSelection } from "../src/lib/home-example-seeds";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";
import { HomePrompt } from "../src/components/home-prompt";

const {
  agentModelRequirementMock,
  settingsDialogSpy,
} = vi.hoisted(() => ({
  agentModelRequirementMock: vi.fn(),
  settingsDialogSpy: vi.fn(),
}));

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => <div data-testid="agent-model-selector" />,
}));

vi.mock("../src/components/settings-dialog", () => ({
  SettingsDialog: ({
    open,
  }: {
    open: boolean;
  }) => {
    settingsDialogSpy({ open });
    return open ? <div>Mock Agent Settings</div> : null;
  },
}));

vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
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
    agentModelRequirementMock.mockReturnValue({
      model: "local:assistant",
      isAgentModelConfigured: true,
      ensureAgentModelConfigured: vi.fn().mockResolvedValue(true),
    });
  });

  it("sends selected example image mentions as initial attachments", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const selectedSeed: HomeExampleSelection = {
      categoryKey: "visual-concepts",
      categoryLabel: "Visual Concepts",
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
    const designSeed = homeExampleSeedCategories
      .find((category) => category.key === "design")!
      .examples[0]!;

    const { container } = render(
      <HomePrompt
        onSubmit={onSubmit}
        selectedSeed={{
          categoryKey: "design",
          categoryLabel: "Design",
          title: designSeed.title,
          prompt: designSeed.prompt,
          previewImages: designSeed.previewImages,
          inputMentions: designSeed.inputMentions,
        }}
      />,
    );

    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(
      container.querySelector(".overflow-x-auto"),
    ).not.toBeInTheDocument();
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
      screen.getByText("请先配置或选择一个 Agent 模型。"),
    ).toBeInTheDocument();
  });

  it("renders tooltip labels for prompt toolbar icon buttons", () => {
    render(
      <HomePrompt
        onSubmit={vi.fn()}
        onAddFiles={vi.fn()}
      />,
    );

    expect(screen.getByText("Attach images")).toBeInTheDocument();
    expect(screen.getByText("Attach images")).toHaveClass("top-full");
    expect(screen.getByText("Image/Video model")).toBeInTheDocument();
    expect(screen.getByText("Image/Video model")).toHaveClass("top-full");
    expect(
      screen.getByRole("button", { name: "Image/Video model" }),
    ).toBeInTheDocument();
  });
});
