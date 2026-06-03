// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeExampleSelection } from "../src/lib/home-example-seeds";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";
import { HomePrompt } from "../src/components/home-prompt";

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => <div data-testid="agent-model-selector" />,
}));

vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
}));

vi.mock("../src/hooks/use-agent-model", () => ({
  useAgentModel: () => ({ model: "local:assistant" }),
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
    vi.clearAllMocks();
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
});
