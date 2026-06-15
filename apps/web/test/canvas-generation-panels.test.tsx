// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (elements: Array<Record<string, unknown>>) =>
    elements.map((element, index) => ({
      id: `converted-${index}`,
      ...element,
    })),
}));

function createExcalidrawApiStub(
  sceneElements: Array<Record<string, unknown>> = [],
) {
  return {
    addFiles: vi.fn(),
    getSceneElements: vi.fn(() => sceneElements),
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
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 18,
            maxResolution: "1080p",
            maxInputImages: 8,
          },
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

    await waitFor(() => expect(fetchImageModelsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("远端生图，本地落库")).not.toBeInTheDocument();
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

  it("closes the image generator panel when the user clicks back on the canvas", async () => {
    const onClose = vi.fn();
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
          onClose={onClose}
        />
      </ToastProvider>,
    );

    await screen.findByPlaceholderText("今天我们要创作什么");
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets image prompt and loading state when switching generator elements", async () => {
    const user = userEvent.setup();
    const excalidrawApi = createExcalidrawApiStub();
    const { rerender } = render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="old-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "generating",
            prompt: "生成小女孩跳舞的图片",
            model: "agnes-image/agnes-image-2.1-flash",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={excalidrawApi}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    rerender(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="new-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "",
            model: "agnes-image/agnes-image-2.1-flash",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={excalidrawApi}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    const promptInput = screen.getByPlaceholderText("今天我们要创作什么");
    await waitFor(() => expect(promptInput).toHaveValue(""));
    expect(promptInput).toBeEnabled();

    await user.type(promptInput, "新的提示语");
    expect(promptInput).toHaveValue("新的提示语");
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
    fetchImageModelsMock.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );

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

  it("keeps a submitted image generation polling after the panel unmounts", async () => {
    let capturedSignal: AbortSignal | undefined;
    generateImageDirectMock.mockImplementation(
      (_prompt: string, options: { signal?: AbortSignal }) => {
        capturedSignal = options.signal;
        return new Promise(() => {});
      },
    );

    const { unmount } = render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="el-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "生成一张跳舞图片",
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

    await userEvent.click(
      await screen.findByRole("button", { name: "生成图片" }),
    );
    expect(generateImageDirectMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(capturedSignal?.aborted).toBe(false);
  });

  it("skips inserting a generated image when the generator element was deleted", async () => {
    let resolveGeneration:
      | ((result: { url: string; mimeType: string }) => void)
      | undefined;
    generateImageDirectMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["fake"], { type: "image/png" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const excalidrawApi = createExcalidrawApiStub([
      { id: "el-image", isDeleted: true },
    ]);

    render(
      <ToastProvider>
        <ImageGeneratorPanel
          elementId="el-image"
          elementBounds={{ x: 0, y: 0, width: 320, height: 320 }}
          data={{
            type: "image-generator",
            status: "idle",
            prompt: "生成一张跳舞图片",
            model: "agnes-image/agnes-image-2.1-flash",
            aspectRatio: "1:1",
            quality: "hd",
          }}
          excalidrawApi={excalidrawApi}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={() => {}}
        />
      </ToastProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "生成图片" }),
    );
    expect(generateImageDirectMock).toHaveBeenCalledTimes(1);
    excalidrawApi.addFiles.mockClear();
    excalidrawApi.getSceneElements.mockClear();
    excalidrawApi.updateScene.mockClear();

    resolveGeneration?.({
      url: "https://example.com/generated.png",
      mimeType: "image/png",
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(excalidrawApi.getSceneElements).toHaveBeenCalledTimes(1),
    );
    expect(excalidrawApi.addFiles).not.toHaveBeenCalled();
    expect(excalidrawApi.updateScene).not.toHaveBeenCalled();
  });

  it("does not show a delete button in the image generator panel", async () => {
    const onClose = vi.fn();
    const excalidrawApi = createExcalidrawApiStub([
      {
        id: "el-image",
        isDeleted: false,
        customData: { type: "image-generator" },
      },
    ]);

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
          excalidrawApi={excalidrawApi}
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={onClose}
        />
      </ToastProvider>,
    );

    await screen.findByPlaceholderText("今天我们要创作什么");
    expect(
      screen.queryByRole("button", {
        name: "删除图片生成器卡片",
      }),
    ).not.toBeInTheDocument();
    expect(excalidrawApi.updateScene).not.toHaveBeenCalledWith(
      expect.objectContaining({
        elements: [
          expect.objectContaining({
            id: "el-image",
            isDeleted: true,
          }),
        ],
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
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

    await waitFor(() => expect(fetchVideoModelsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("远端生成，本地落库")).not.toBeInTheDocument();
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

  it("uses a bottom video mode menu without exposing text as a mode", async () => {
    fetchVideoModelsMock.mockResolvedValue({
      models: [
        {
          id: "kie/seedance-2",
          displayName: "Seedance 2.0",
          description: "Kie Seedance route",
          provider: "kie-video",
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 5,
            maxResolution: "720p",
            maxInputImages: 8,
          },
          schema: {
            type: "object",
            properties: {},
            "x-aimc-ui": {
              inputModes: [
                {
                  id: "text",
                  labelKey: "tools.schema.inputModes.text",
                  maxImages: 0,
                },
                {
                  id: "keyframes",
                  labelKey: "tools.schema.inputModes.keyframes",
                  videoMode: "keyframes",
                  minImages: 1,
                  maxImages: 2,
                  slots: ["firstFrame", "lastFrame"],
                },
                {
                  id: "reference",
                  labelKey: "tools.schema.inputModes.reference",
                  videoMode: "reference",
                  minImages: 1,
                  maxImages: 8,
                  slots: ["referenceImages"],
                },
              ],
            },
          },
        },
      ],
    });

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
            model: "kie/seedance-2",
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
      await screen.findByRole("button", { name: "首尾帧" }),
    );

    expect(
      screen.queryByRole("button", { name: "文本" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "参考图/视频" }));
    expect(screen.getByRole("button", { name: "参考图" })).toBeInTheDocument();
  });

  it("keeps text-to-video submission when no video mode assets are uploaded", async () => {
    generateVideoDirectMock.mockResolvedValue({
      url: "https://example.com/generated.mp4",
      assetId: "asset-video-1",
      mimeType: "video/mp4",
      durationSeconds: 5,
    });
    const excalidrawApi = createExcalidrawApiStub([
      {
        id: "el-video",
        isDeleted: false,
        customData: { type: "video-generator" },
      },
    ]);

    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "生成一段跳舞视频",
            model: "agnes-video/agnes-video-v2.0",
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

    await userEvent.click(
      await screen.findByRole("button", { name: "生成视频" }),
    );

    expect(generateVideoDirectMock).toHaveBeenCalledWith(
      "生成一段跳舞视频",
      expect.not.objectContaining({
        inputImages: expect.anything(),
        videoMode: expect.anything(),
      }),
    );
  });

  it("uses the selected video model limits for duration and resolution controls", async () => {
    fetchVideoModelsMock.mockResolvedValue({
      models: [
        {
          id: "kie/grok-imagine",
          displayName: "Grok Imagine",
          description: "Kie Grok route",
          provider: "kie-video",
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 6,
            allowedDurations: [6],
            maxResolution: "480p",
            maxInputImages: 1,
          },
        },
      ],
    });

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
            model: "kie/grok-imagine",
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
      await screen.findByRole("button", { name: "16:9 · 6s" }),
    );

    expect(screen.getByRole("button", { name: "6s" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "5s" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "480p" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "720p" }),
    ).not.toBeInTheDocument();
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
    expect(panel.style.left).toBe("100px");
  });

  it("closes the video generator panel when the user clicks back on the canvas", async () => {
    const onClose = vi.fn();
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
          onClose={onClose}
        />
      </ToastProvider>,
    );

    await screen.findByPlaceholderText(
      "描述你想要的视频镜头、动作、节奏与画面氛围",
    );
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
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

    await waitFor(() => expect(fetchVideoModelsMock).toHaveBeenCalledTimes(1));
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

      if (!pendingReader) {
        throw new Error("FileReader did not start.");
      }
      pendingReader.result = "data:image/png;base64,ZmFrZQ==";
      pendingReader.onload?.();

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

  it("keeps a submitted video generation polling after the panel unmounts", async () => {
    let capturedSignal: AbortSignal | undefined;
    generateVideoDirectMock.mockImplementation(
      (_prompt: string, options: { signal?: AbortSignal }) => {
        capturedSignal = options.signal;
        return new Promise(() => {});
      },
    );

    const { unmount } = render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "生成一段跳舞视频",
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
      await screen.findByRole("button", { name: "生成视频" }),
    );
    expect(generateVideoDirectMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(capturedSignal?.aborted).toBe(false);
  });

  it("skips inserting a generated video when the generator element was deleted", async () => {
    let resolveGeneration:
      | ((result: {
          url: string;
          mimeType: string;
          durationSeconds: number;
        }) => void)
      | undefined;
    generateVideoDirectMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    const excalidrawApi = createExcalidrawApiStub([
      { id: "el-video", isDeleted: true },
    ]);

    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "生成一段跳舞视频",
            model: "agnes-video/agnes-video-v2.0",
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

    await userEvent.click(
      await screen.findByRole("button", { name: "生成视频" }),
    );
    expect(generateVideoDirectMock).toHaveBeenCalledTimes(1);
    excalidrawApi.getSceneElements.mockClear();
    excalidrawApi.updateScene.mockClear();

    resolveGeneration?.({
      url: "https://example.com/generated.mp4",
      mimeType: "video/mp4",
      durationSeconds: 5,
    });

    await waitFor(() =>
      expect(excalidrawApi.getSceneElements).toHaveBeenCalledTimes(1),
    );
    expect(excalidrawApi.updateScene).not.toHaveBeenCalled();
  });

  it("stores generated video sources outside the Excalidraw link field", async () => {
    generateVideoDirectMock.mockResolvedValue({
      url: "https://example.com/generated.mp4",
      assetId: "asset-video-1",
      mimeType: "video/mp4",
      durationSeconds: 5,
    });
    const excalidrawApi = createExcalidrawApiStub([
      {
        id: "el-video",
        isDeleted: false,
        customData: { type: "video-generator" },
      },
    ]);

    render(
      <ToastProvider>
        <VideoGeneratorPanel
          elementId="el-video"
          elementBounds={{ x: 0, y: 0, width: 320, height: 180 }}
          canvasId="canvas-1"
          data={{
            type: "video-generator",
            status: "idle",
            prompt: "生成一段跳舞视频",
            model: "agnes-video/agnes-video-v2.0",
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

    await userEvent.click(
      await screen.findByRole("button", { name: "生成视频" }),
    );

    await waitFor(() => expect(excalidrawApi.updateScene).toHaveBeenCalled());
    const finalScene =
      excalidrawApi.updateScene.mock.calls[
        excalidrawApi.updateScene.mock.calls.length - 1
      ]?.[0];
    const inserted = finalScene?.elements.find(
      (element: Record<string, unknown>) =>
        element.type === "rectangle" && element.id !== "el-video",
    );

    expect(inserted).toEqual(
      expect.objectContaining({
        link: null,
        customData: expect.objectContaining({
          isVideo: true,
          videoUrl: "/local-assets/asset-video-1",
        }),
      }),
    );
  });

  it("does not show a delete button in the video generator panel", async () => {
    const onClose = vi.fn();
    const excalidrawApi = createExcalidrawApiStub([
      {
        id: "el-video",
        isDeleted: false,
        customData: { type: "video-generator" },
      },
    ]);

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
          excalidrawApi={excalidrawApi}
          projectId="project-1"
          canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
          onClose={onClose}
        />
      </ToastProvider>,
    );

    await screen.findByPlaceholderText(
      "描述你想要的视频镜头、动作、节奏与画面氛围",
    );
    expect(
      screen.queryByRole("button", { name: "删除视频生成器卡片" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
