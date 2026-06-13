// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generationJobWatchMock, convertToExcalidrawElementsMock } = vi.hoisted(
  () => ({
    generationJobWatchMock: vi.fn(),
    convertToExcalidrawElementsMock: vi.fn(
      (items: Array<Record<string, unknown>>) =>
        items.map((item, index) => ({
          id: `video-result-${index}`,
          ...item,
        })),
    ),
  }),
);

vi.mock("../src/lib/generation-job-service", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/generation-job-service")
  >("../src/lib/generation-job-service");
  return {
    ...actual,
    generationJobService: {
      ...actual.generationJobService,
      watch: generationJobWatchMock,
    },
  };
});

vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: convertToExcalidrawElementsMock,
}));

import {
  type CanvasGenerationRecoveryApi,
  type CanvasRecoveryElement,
  useCanvasGenerationJobRecovery,
} from "../src/hooks/use-canvas-generation-job-recovery";

type WatchOptions = {
  onSucceeded?: (result: Record<string, unknown>) => void;
};

function RecoveryHarness({
  excalidrawApi,
}: {
  excalidrawApi: CanvasGenerationRecoveryApi;
}) {
  useCanvasGenerationJobRecovery(excalidrawApi);
  return null;
}

describe("canvas generation job recovery", () => {
  const originalFileReader = globalThis.FileReader;

  beforeEach(() => {
    vi.clearAllMocks();
    generationJobWatchMock.mockImplementation(
      (_jobId: string, options: WatchOptions) => {
        const promise = Promise.resolve({
          signed_url: "http://localhost:3001/local-assets/video-1",
          mime_type: "video/mp4",
          width: 1280,
          height: 720,
          duration_seconds: 5,
        }).then((result) => {
          options?.onSucceeded?.(result);
          return result;
        });
        return {
          promise,
          unsubscribe: vi.fn(),
        };
      },
    );
    global.fetch = vi.fn(
      async () => new Response(new Blob(["image"], { type: "image/png" })),
    ) as typeof fetch;
    class TestFileReader {
      onload: null | (() => void) = null;
      result: string | ArrayBuffer | null = "data:image/png;base64,aW1hZ2U=";
      readAsDataURL() {
        this.onload?.();
      }
    }
    globalThis.FileReader = TestFileReader as typeof FileReader;
  });

  afterEach(() => {
    cleanup();
    globalThis.FileReader = originalFileReader;
  });

  it("resumes polling a persisted image generator job after canvas reload", async () => {
    let elements: CanvasRecoveryElement[] = [
      {
        id: "image-generator-1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 320,
        height: 320,
        isDeleted: false,
        customData: {
          type: "image-generator",
          status: "generating",
          jobId: "job-image-1",
          prompt: "小女孩跳舞的图片",
          model: "agnes-image/agnes-image-2.1-flash",
          aspectRatio: "1:1",
          quality: "hd",
        },
      },
    ];
    generationJobWatchMock.mockImplementationOnce(
      (_jobId: string, options: WatchOptions) => {
        const promise = Promise.resolve({
          signed_url: "http://localhost:3001/local-assets/image-1",
          mime_type: "image/png",
          width: 1024,
          height: 1024,
        }).then((result) => {
          options?.onSucceeded?.(result);
          return result;
        });
        return {
          promise,
          unsubscribe: vi.fn(),
        };
      },
    );
    const addFiles = vi.fn();
    const updateScene = vi.fn(
      ({ elements: next }: { elements: CanvasRecoveryElement[] }) => {
        elements = next;
      },
    );
    const excalidrawApi = {
      addFiles,
      getSceneElements: () => elements,
      updateScene,
      onChange: vi.fn(() => () => {}),
    };

    render(<RecoveryHarness excalidrawApi={excalidrawApi} />);

    await waitFor(() =>
      expect(generationJobWatchMock).toHaveBeenCalledWith(
        "job-image-1",
        expect.objectContaining({
          jobType: "image_generation",
        }),
      ),
    );
    await waitFor(() =>
      expect(addFiles).toHaveBeenCalledWith([
        expect.objectContaining({
          dataURL: "data:image/png;base64,aW1hZ2U=",
          mimeType: "image/png",
        }),
      ]),
    );
    expect(updateScene).toHaveBeenCalledWith({
      elements: expect.arrayContaining([
        expect.objectContaining({
          id: "image-generator-1",
          isDeleted: true,
        }),
        expect.objectContaining({
          type: "image",
          x: 10,
          y: 20,
          width: 320,
          height: 320,
        }),
      ]),
      captureUpdate: "IMMEDIATELY",
    });
  });

  it("resumes polling a persisted video generator job after canvas reload", async () => {
    let elements: CanvasRecoveryElement[] = [
      {
        id: "video-generator-1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 320,
        height: 180,
        isDeleted: false,
        customData: {
          type: "video-generator",
          status: "generating",
          jobId: "job-video-1",
          prompt: "小女孩跳舞的视频",
          model: "agnes-video/agnes-video-v2.0",
          aspectRatio: "16:9",
          duration: 5,
          resolution: "720p",
        },
      },
    ];
    const updateScene = vi.fn(
      ({ elements: next }: { elements: CanvasRecoveryElement[] }) => {
        elements = next;
      },
    );
    const excalidrawApi = {
      addFiles: vi.fn(),
      getSceneElements: () => elements,
      updateScene,
      onChange: vi.fn(() => () => {}),
    };

    render(<RecoveryHarness excalidrawApi={excalidrawApi} />);

    await waitFor(() =>
      expect(generationJobWatchMock).toHaveBeenCalledWith(
        "job-video-1",
        expect.objectContaining({
          jobType: "video_generation",
        }),
      ),
    );
    await waitFor(() =>
      expect(updateScene).toHaveBeenCalledWith({
        elements: expect.arrayContaining([
          expect.objectContaining({
            id: "video-generator-1",
            isDeleted: true,
          }),
          expect.objectContaining({
            id: "video-result-0",
            type: "embeddable",
            link: "/local-assets/video-1",
          }),
        ]),
        captureUpdate: "IMMEDIATELY",
      }),
    );
  });

  it("starts polling generator jobs that appear after the initial scan", async () => {
    let elements: CanvasRecoveryElement[] = [
      {
        id: "existing-shape",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        isDeleted: false,
      },
    ];
    let onChange:
      | ((
          elements: CanvasRecoveryElement[],
          appState: Record<string, unknown>,
        ) => void)
      | undefined;
    const excalidrawApi = {
      addFiles: vi.fn(),
      getSceneElements: () => elements,
      updateScene: vi.fn(
        ({ elements: next }: { elements: CanvasRecoveryElement[] }) => {
          elements = next;
        },
      ),
      onChange: vi.fn(
        (
          handler: (
            elements: CanvasRecoveryElement[],
            appState: Record<string, unknown>,
          ) => void,
        ) => {
          onChange = handler;
          return () => {};
        },
      ),
    };

    render(<RecoveryHarness excalidrawApi={excalidrawApi} />);

    expect(generationJobWatchMock).not.toHaveBeenCalled();

    elements = [
      ...elements,
      {
        id: "image-generator-2",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 320,
        height: 320,
        isDeleted: false,
        customData: {
          type: "image-generator",
          status: "generating",
          jobId: "job-image-2",
          prompt: "new image",
          model: "agnes-image/agnes-image-2.1-flash",
          aspectRatio: "1:1",
          quality: "hd",
        },
      },
    ];
    onChange?.(elements, {});

    await waitFor(() =>
      expect(generationJobWatchMock).toHaveBeenCalledWith(
        "job-image-2",
        expect.objectContaining({
          jobType: "image_generation",
        }),
      ),
    );
  });
});
