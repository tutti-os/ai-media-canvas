// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoCanvasElement } from "../src/components/canvas/video-canvas-element";
import { ToastProvider } from "../src/components/toast";
import { i18n } from "../src/i18n";

describe("VideoCanvasElement", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderVideoCanvasElement(
    props: Partial<ComponentProps<typeof VideoCanvasElement>> = {},
  ) {
    return render(
      <ToastProvider>
        <VideoCanvasElement
          src="/local-assets/video.mp4"
          width={640}
          height={360}
          title="生成小女孩跳舞的视频"
          prompt="生成小女孩跳舞的视频"
          model="Hailuo 2.3"
          durationSeconds={5}
          resolution="768P"
          aspectRatio="16:9"
          zoom={0.5}
          mimeType="video/mp4"
          {...props}
        />
      </ToastProvider>,
    );
  }

  it("keeps video nodes compact and opens details/player only from corner actions", async () => {
    const user = userEvent.setup();
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const pauseMock = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});

    const { container } = renderVideoCanvasElement();

    expect(screen.getByText("00:05")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("video[controls]")).not.toBeInTheDocument();
    expect(container.querySelector(".bg-white")).not.toBeInTheDocument();

    const previewVideo = container.querySelector(
      "video:not([controls])",
    ) as HTMLVideoElement;
    expect(previewVideo).toBeInTheDocument();
    const previewSurface = previewVideo.parentElement as HTMLElement;
    expect(previewSurface).not.toHaveClass("rounded-lg");

    expect(screen.getByText("00:05")).toHaveStyle({
      transform: "scale(0.5)",
    });
    expect(screen.getByRole("button", { name: "查看视频信息" })).toHaveStyle({
      transform: "scale(0.5)",
    });
    expect(screen.getByRole("button", { name: "打开视频播放器" })).toHaveStyle({
      transform: "scale(0.5)",
    });

    fireEvent.mouseEnter(previewSurface);
    expect(playMock).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(previewSurface);
    expect(pauseMock).toHaveBeenCalledTimes(1);
    fireEvent.click(previewSurface);
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看视频信息" }));
    expect(
      await screen.findByRole("dialog", { name: "视频生成器" }),
    ).toBeInTheDocument();
    expect(screen.getByText("提示词")).toBeInTheDocument();
    expect(screen.getByText("生成小女孩跳舞的视频")).toBeInTheDocument();
    expect(screen.getByText("基础模型")).toBeInTheDocument();
    expect(screen.getByText("Hailuo 2.3")).toBeInTheDocument();
    expect(screen.getByText("尺寸")).toBeInTheDocument();
    expect(screen.getByText("16:9")).toBeInTheDocument();
    expect(screen.getByText("时长")).toBeInTheDocument();
    expect(screen.getByText("5s")).toBeInTheDocument();
    expect(screen.getByText("分辨率")).toBeInTheDocument();
    expect(screen.getByText("768P")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开视频播放器" }));
    expect(
      await screen.findByRole("dialog", { name: "播放视频" }),
    ).toBeInTheDocument();
    expect(document.querySelector("video[controls]")).toBeInTheDocument();
  });

  it("uses a native download link and shows a started toast", async () => {
    const user = userEvent.setup();

    renderVideoCanvasElement();

    await user.click(screen.getByRole("button", { name: "打开视频播放器" }));
    const dialog = await screen.findByRole("dialog", { name: "播放视频" });
    const playerVideo = dialog.querySelector("video[controls]");

    expect(playerVideo).toHaveAttribute("controlsList", "nodownload");

    const downloadLink = within(dialog).getByRole("link", {
      name: "下载 生成小女孩跳舞的视频",
    });
    expect(downloadLink).toHaveAttribute("href", "/local-assets/video.mp4");
    expect(downloadLink).toHaveAttribute("download");

    downloadLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(downloadLink);

    expect(screen.getByText("已开始下载")).toBeInTheDocument();
  });
});
