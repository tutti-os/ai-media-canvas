// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentBlock } from "@aimc/shared";
import { ChatMessage } from "../src/components/chat-message";

describe("ChatMessage", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a thinking indicator while an empty assistant message is streaming", () => {
    renderAssistantMessage([]);

    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("keeps a thinking indicator below a completed tool while streaming continues", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Bash",
        status: "completed",
        outputSummary: "done",
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("keeps the generic thinking indicator below a running tool", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Bash",
        status: "running",
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.getByText("思考中")).toBeInTheDocument();
  });

  it("uses the bottom thinking indicator instead of a markdown cursor while a tool is running", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "我会先生成一张图。" },
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "Agnes Image 2.1 Flash",
        status: "running",
      },
    ];

    const { container } = renderAssistantMessage(blocks);

    expect(screen.getByText("思考中")).toBeInTheDocument();
    expect(
      container.querySelector(".markdown-content .animate-pulse"),
    ).toBeNull();
  });

  it("does not show a media failure card for deferred image jobs", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "generate_image",
        status: "completed",
        outputSummary:
          "Image generation has started. It will automatically appear on the canvas once ready.",
        output: {
          summary:
            "Image generation has started. It will automatically appear on the canvas once ready.",
          title: "Storyboard panel",
          jobId: "job-image-1",
          jobType: "image_generation",
          status: "generating",
        },
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.queryByText("图片生成失败")).not.toBeInTheDocument();
    expect(screen.getByText("图片生成中...")).toBeInTheDocument();
  });

  it("renders a media capability card with a settings action", async () => {
    const user = userEvent.setup();
    const openMediaSettings = vi.fn();
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "generate_image",
        status: "completed",
        outputSummary: "先连接图片生成能力",
        output: {
          error: "media_provider_configuration_required",
          errorCode: "media_provider_configuration_required",
          capabilityRequired: {
            kind: "media_provider_configuration_required",
            capability: "image_generation",
            title: "先连接图片生成能力",
            description:
              "连接后，我会继续按你的描述生成图片。",
            action: {
              type: "open_settings",
              tab: "media",
              label: "去连接",
            },
          },
        },
      },
    ];

    render(
      <ChatMessage
        contentBlocks={blocks}
        isStreaming={false}
        role={"assistant" as const}
        onOpenMediaSettings={openMediaSettings}
      />,
    );

    expect(screen.getByText("先连接图片生成能力")).toBeInTheDocument();
    expect(
      screen.getByText("连接后，我会继续按你的描述生成图片。"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "去连接" }));

    expect(openMediaSettings).toHaveBeenCalledTimes(1);
  });

  it("shows one image capability card when multiple image generations need setup", async () => {
    const user = userEvent.setup();
    const openMediaSettings = vi.fn();
    const imageCapabilityRequired = {
      kind: "media_provider_configuration_required",
      capability: "image_generation",
      title: "先连接图片生成能力",
      description: "连接后，我会继续按你的描述生成图片。",
      action: {
        type: "open_settings",
        tab: "media",
        label: "去连接",
      },
    };
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-image-1",
        toolName: "generate_image",
        status: "completed",
        outputSummary: "先连接图片生成能力",
        output: {
          error: "media_provider_configuration_required",
          errorCode: "media_provider_configuration_required",
          capabilityRequired: imageCapabilityRequired,
        },
      },
      {
        type: "tool",
        toolCallId: "tool-image-2",
        toolName: "generate_image",
        status: "completed",
        outputSummary: "先连接图片生成能力",
        output: {
          error: "media_provider_configuration_required",
          errorCode: "media_provider_configuration_required",
          capabilityRequired: imageCapabilityRequired,
        },
      },
    ];

    render(
      <ChatMessage
        contentBlocks={blocks}
        isStreaming={false}
        role={"assistant" as const}
        onOpenMediaSettings={openMediaSettings}
      />,
    );

    expect(screen.getAllByText("先连接图片生成能力")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "去连接" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "去连接" }));

    expect(openMediaSettings).toHaveBeenCalledTimes(1);
  });

  it("hides unavailable model labels on media capability cards", () => {
    const blocks: ContentBlock[] = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "generate_video",
        status: "completed",
        input: {
          model: "Unavailable",
        },
        output: {
          error: "media_provider_configuration_required",
          errorCode: "media_provider_configuration_required",
          capabilityRequired: {
            kind: "media_provider_configuration_required",
            capability: "video_generation",
            title: "先连接视频生成能力",
            description: "连接后，我会继续按你的描述生成视频。",
            action: {
              type: "open_settings",
              tab: "media",
              label: "去连接",
            },
          },
        },
      },
    ];

    renderAssistantMessage(blocks);

    expect(screen.getByText("生成视频")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(
      screen.getByText("连接后，我会继续按你的描述生成视频。"),
    ).toBeInTheDocument();
  });

  it("renders local asset image pills with runtime asset urls", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "看看这张图" },
      {
        type: "image",
        assetId: "canvas-image-1",
        url: "/local-assets/asset-1",
        mimeType: "image/png",
        source: "canvas-ref",
        name: "Canvas selection",
      },
    ];

    render(<ChatMessage contentBlocks={blocks} role={"user" as const} />);

    const image = screen.getByAltText("Canvas selection");
    expect(image).toHaveAttribute(
      "src",
      "http://localhost:3000/local-assets/asset-1",
    );
  });
});

function renderAssistantMessage(contentBlocks: ContentBlock[]) {
  return render(
    <ChatMessage
      contentBlocks={contentBlocks}
      isStreaming
      role={"assistant" as const}
    />,
  );
}
