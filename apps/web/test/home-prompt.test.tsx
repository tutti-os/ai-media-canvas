// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HomePrompt } from "../src/components/home-prompt";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => <div>AgentModelSelector</div>,
}));

vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
}));

vi.mock("../src/hooks/use-agent-model", () => ({
  useAgentModel: () => ({
    model: "agnes:agnes-2.0-flash",
  }),
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
  it("does not send seed reference images as real attachments", () => {
    const onSubmit = vi.fn();
    const storyboardSeed = homeExampleSeedCategories
      .find((category) => category.key === "storyboard-video")!
      .examples[0]!;

    render(
      <HomePrompt
        onSubmit={onSubmit}
        selectedSeed={{
          categoryKey: "storyboard-video",
          categoryLabel: "Storyboard",
          title: storyboardSeed.title,
          prompt: storyboardSeed.prompt,
          previewImages: storyboardSeed.previewImages,
          inputMentions: storyboardSeed.inputMentions,
        }}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("让 AI Media Canvas 帮你设计..."),
      { target: { value: storyboardSeed.prompt } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交 prompt" }));

    expect(onSubmit).toHaveBeenCalledWith(
      storyboardSeed.prompt,
      undefined,
      undefined,
      undefined,
      "agnes:agnes-2.0-flash",
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
