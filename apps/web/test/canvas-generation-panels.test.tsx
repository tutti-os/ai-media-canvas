// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageGeneratorPanel } from "../src/components/canvas/image-generator-panel";
import { VideoGeneratorPanel } from "../src/components/canvas/video-generator-panel";
import { ToastProvider } from "../src/components/toast";

const {
  fetchImageModelsMock,
  fetchVideoModelsMock,
  generateImageDirectMock,
  generateVideoDirectMock,
} = vi.hoisted(() => ({
  fetchImageModelsMock: vi.fn(),
  fetchVideoModelsMock: vi.fn(),
  generateImageDirectMock: vi.fn(),
  generateVideoDirectMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchImageModels: fetchImageModelsMock,
  fetchVideoModels: fetchVideoModelsMock,
  generateImageDirect: generateImageDirectMock,
  generateVideoDirect: generateVideoDirectMock,
}));

function createExcalidrawApiStub() {
  return {
    addFiles: vi.fn(),
    getSceneElements: vi.fn(() => []),
    updateScene: vi.fn(),
  };
}

function findPositionedPanel(start: HTMLElement): HTMLElement {
  let current: HTMLElement | null = start;
  while (current && !current.style.left) {
    current = current.parentElement;
  }
  if (!current) {
    throw new Error("Unable to find positioned panel");
  }
  return current;
}

describe("canvas generation panels", () => {
  beforeEach(() => {
    fetchImageModelsMock.mockReset();
    fetchImageModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes-image/agnes-image-2.1-flash",
          displayName: "Agnes Image 2.1 Flash",
          description: "Agnes image route",
          provider: "agnes-image",
        },
      ],
    });

    fetchVideoModelsMock.mockReset();
    fetchVideoModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes-video/agnes-video-v2.0",
          displayName: "Agnes Video v2.0",
          description: "Agnes video route",
          provider: "agnes-video",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an image model picker and omits the hard-coded storage copy", async () => {
    render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="el-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "",
            model: "agnes-image/agnes-image-2.1-flash",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(fetchImageModelsMock).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByText("远端生图，本地落库"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /agnes image 2.1 flash/i }),
    ).toBeInTheDocument();
  });

  it("centers the image generator panel below the selected generator", async () => {
    render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="el-image"
          elementBounds={{ x: 100, y: 50, width: 640, height: 360 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "",
            model: "agnes-image/agnes-image-2.1-flash",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    const panel = findPositionedPanel(
      screen.getByPlaceholderText("今天我们要创作什么"),
    );
    expect(panel.style.left).toBe("195px");
  });

  it("blocks image generation when no providers are configured", async () => {
    fetchImageModelsMock.mockResolvedValueOnce({ models: [] });

    render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="el-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "生成一张海报",
            model: "black-forest-labs/flux-kontext-pro",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    expect(
      await screen.findByText(
        "未配置可用生图模型，请先在设置中配置 Replicate、Agnes 或 Volces provider。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成图片" })).toBeDisabled();
  });

  it("surfaces a backend-unavailable hint when image models cannot load", async () => {
    fetchImageModelsMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="el-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "生成一张海报",
            model: "black-forest-labs/flux-kontext-pro",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    expect(
      await screen.findByText("生图服务不可用，请确认本地 3001 服务已启动。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成图片" })).toBeDisabled();
  });

  it("omits the hard-coded storage copy in the video generator", async () => {
    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "",
            model: "agnes-video/agnes-video-v2.0",
            aspectRatio: "16:9",
            duration: 5,
            resolution: "720p",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          projectId="project-1"
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(fetchVideoModelsMock).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByText("远端生成，本地落库"),
    ).not.toBeInTheDocument();
  });

  it("shows the video model provider only once in the model picker", async () => {
    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "",
            model: "agnes-video/agnes-video-v2.0",
            aspectRatio: "16:9",
            duration: 5,
            resolution: "720p",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          projectId="project-1"
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Agnes Video v2.0 · Agnes Video",
      }),
    );

    expect(screen.getAllByText("Agnes Video")).toHaveLength(1);
  });

  it("centers the video generator panel below the selected generator", async () => {
    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 100, y: 50, width: 640, height: 360 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "",
            model: "agnes-video/agnes-video-v2.0",
            aspectRatio: "16:9",
            duration: 5,
            resolution: "720p",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          projectId="project-1"
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    const panel = findPositionedPanel(
      screen.getByPlaceholderText("描述你想要的视频镜头、动作、节奏与画面氛围"),
    );
    expect(panel.style.left).toBe("160px");
  });

  it("falls back to the first available video model when the current model is unavailable", async () => {
    const excalidrawApi = createExcalidrawApiStub();

    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "",
            model: "google-official/veo-3.1-generate-preview",
            aspectRatio: "16:9",
            duration: 5,
            resolution: "720p",
          }}
          excalidrawApi={excalidrawApi}
          projectId="project-1"
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(fetchVideoModelsMock).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /agnes video v2\.0/i }),
      ).toBeInTheDocument(),
    );
    expect(excalidrawApi.updateScene).toHaveBeenCalledWith({
      elements: [],
      captureUpdate: "IMMEDIATELY",
    });
  });

  it("shows per-frame loading and preview when uploading video keyframes", async () => {
    const originalFileReader = globalThis.FileReader;
    let pendingReader: {
      onload: null | (() => void);
      result: string | ArrayBuffer | null;
    } | null = null;
    class PendingFileReader {
      onload: null | (() => void) = null;
      result: string | ArrayBuffer | null = null;
      readAsDataURL() {
        pendingReader = this;
      }
    }
    globalThis.FileReader = PendingFileReader as typeof FileReader;

    try {
      render(
        <ToastProvider>
          <VideoGeneratorPanel
            elementId="el-video"
            elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
            canvasId="canvas-1"
            data={{
              type: "video-generator",
              status: "idle",
              prompt: "",
              model: "agnes-video/agnes-video-v2.0",
              aspectRatio: "16:9",
              duration: 5,
              resolution: "720p",
            }}
            excalidrawApi={createExcalidrawApiStub()}
            projectId="project-1"
            canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
            onClose={() => {}}
          />
        </ToastProvider>,
      );

      const file = new File(["fake"], "first.png", { type: "image/png" });
      await userEvent.upload(screen.getByLabelText("上传首帧"), file);

      expect(screen.getByText("首帧上传中")).toBeInTheDocument();
      expect(pendingReader).not.toBeNull();

      pendingReader!.result = "data:image/png;base64,ZmFrZQ==";
      pendingReader!.onload?.();

      expect(await screen.findByAltText("首帧预览")).toBeInTheDocument();
      expect(screen.queryByText("首帧上传中")).not.toBeInTheDocument();
    } finally {
      globalThis.FileReader = originalFileReader;
    }
  });

  it("keeps video keyframe upload tiles visually lightweight and horizontal", async () => {
    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "",
            model: "agnes-video/agnes-video-v2.0",
            aspectRatio: "16:9",
            duration: 5,
            resolution: "720p",
          }}
          excalidrawApi={createExcalidrawApiStub()}
          projectId="project-1"
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("button", { name: "首帧" })).toHaveClass(
      "h-[48px]",
      "w-[104px]",
      "text-[11px]",
      "border-border/55",
      "hover:border-border/80",
      "cursor-pointer",
    );
    expect(screen.getByRole("button", { name: "尾帧" })).toHaveClass(
      "h-[48px]",
      "w-[104px]",
      "text-[11px]",
      "border-border/55",
      "hover:border-border/80",
      "cursor-pointer",
    );
    expect(
      screen.getByRole("button", { name: "agnes-video/agnes-video-v2.0" }),
    ).toHaveClass("cursor-pointer");
    expect(screen.getByRole("button", { name: "16:9 · 5s" })).toHaveClass(
      "cursor-pointer",
    );
  });
});
