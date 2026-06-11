// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchCanvasMock,
  fetchProjectMock,
  generationJobWatchMock,
  replaceMock,
  refreshMock,
  insertImageOnCanvasMock,
  insertVideoOnCanvasMock,
  latestChatSidebarPropsRef,
  searchParamsRef,
} = vi.hoisted(() => ({
  fetchCanvasMock: vi.fn(),
  fetchProjectMock: vi.fn(),
  generationJobWatchMock: vi.fn(),
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  insertImageOnCanvasMock: vi.fn(),
  insertVideoOnCanvasMock: vi.fn(),
  latestChatSidebarPropsRef: {
    current: null as Record<string, unknown> | null,
  },
  searchParamsRef: {
    current: new URLSearchParams({ id: "canvas-1" }),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    replace: replaceMock,
  }),
  useSearchParams: () => searchParamsRef.current,
}));

vi.mock("../src/hooks/use-websocket", () => ({
  useWebSocket: () => ({
    connected: true,
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    registerRPC: vi.fn(() => () => {}),
    resumeCanvas: vi.fn(),
  }),
}));

vi.mock("../src/components/canvas-editor", () => ({
  CanvasEditor: ({ onApiReady }: { onApiReady?: (api: unknown) => void }) => {
    useEffect(() => {
      onApiReady?.({});
    }, [onApiReady]);
    return <div>Canvas Editor</div>;
  },
}));

vi.mock("../src/components/chat-sidebar", () => ({
  ChatSidebar: (props: Record<string, unknown>) => {
    latestChatSidebarPropsRef.current = props;
    return <aside>Chat Sidebar</aside>;
  },
}));

vi.mock("../src/components/canvas-empty-hint", () => ({
  CanvasEmptyHint: () => null,
}));

vi.mock("../src/components/canvas-bottom-bar", () => ({
  CanvasBottomBar: () => null,
}));

vi.mock("../src/components/canvas-files-panel", () => ({
  CanvasFilesPanel: () => null,
}));

vi.mock("../src/components/canvas-layers-panel", () => ({
  CanvasLayersPanel: () => null,
}));

vi.mock("../src/components/canvas-logo-menu", () => ({
  CanvasLogoMenu: () => <button type="button">Logo Menu</button>,
}));

vi.mock("../src/components/editable-project-name", () => ({
  EditableProjectName: ({ initialName }: { initialName: string }) => (
    <span>{initialName}</span>
  ),
}));

vi.mock("../src/components/brand-kit-selector", () => ({
  BrandKitSelector: () => <button type="button">品牌套件: 无</button>,
}));

vi.mock("../src/components/toast", () => ({
  useToast: () => ({
    error: vi.fn(),
  }),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchCanvas: fetchCanvasMock,
  fetchProject: fetchProjectMock,
}));

vi.mock("../src/lib/generation-job-service", async () => {
  const actual = (await vi.importActual(
    "../src/lib/generation-job-service",
  )) as {
    generationJobService: Record<string, unknown>;
  };
  return {
    ...actual,
    generationJobService: {
      ...actual.generationJobService,
      watch: generationJobWatchMock,
    },
  };
});

vi.mock("../src/lib/canvas-elements", () => ({
  insertImageOnCanvas: insertImageOnCanvasMock,
  insertVideoOnCanvas: insertVideoOnCanvasMock,
}));

import CanvasPage from "../src/app/canvas/page";

type FallbackWatchOptions = {
  onSucceeded?: (result: {
    signed_url: string;
    mime_type: string;
    width: number;
    height: number;
    duration_seconds: number;
  }) => void;
};

describe("Canvas page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestChatSidebarPropsRef.current = null;
    searchParamsRef.current = new URLSearchParams({ id: "canvas-1" });
    fetchCanvasMock.mockResolvedValue({
      canvas: {
        id: "canvas-1",
        name: "Main Canvas",
        projectId: "project-1",
        content: {
          elements: [],
          appState: {},
          files: {},
        },
      },
    });
    fetchProjectMock.mockResolvedValue({
      project: {
        id: "project-1",
        name: "Project With Kit",
        brandKitId: "kit-1",
      },
    });
    insertImageOnCanvasMock.mockResolvedValue(undefined);
    generationJobWatchMock.mockImplementation(
      (_jobId: string, options: FallbackWatchOptions) => {
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
  });

  afterEach(() => {
    cleanup();
  });

  it("hides the brand-kit selector from the canvas header", async () => {
    render(<CanvasPage />);

    await screen.findByText("Canvas Editor");

    await screen.findByText("Project With Kit");
    expect(screen.queryByText(/品牌套件/)).not.toBeInTheDocument();
  });

  it("polls late video generation jobs from chat stream events", async () => {
    render(<CanvasPage />);

    await screen.findByText("Canvas Editor");

    const onStreamEvent = latestChatSidebarPropsRef.current?.onStreamEvent as
      | ((event: Record<string, unknown>) => void)
      | undefined;
    expect(onStreamEvent).toBeTypeOf("function");

    onStreamEvent?.({
      type: "tool.completed",
      runId: "run-1",
      toolCallId: "tool-1",
      toolName: "generate_video",
      output: {
        jobId: "job-video-1",
        jobType: "video_generation",
        error: "Job timed out after 1950s",
      },
      timestamp: "2026-06-08T00:00:00.000Z",
    });

    await waitFor(() =>
      expect(generationJobWatchMock).toHaveBeenCalledWith(
        "job-video-1",
        expect.objectContaining({
          jobType: "video_generation",
        }),
      ),
    );
    await waitFor(() =>
      expect(insertVideoOnCanvasMock).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          type: "video",
          url: "http://localhost:3001/local-assets/video-1",
          mimeType: "video/mp4",
          width: 1280,
          height: 720,
          durationSeconds: 5,
          jobId: "job-video-1",
        }),
      ),
    );
  });

  it("ignores late fallback image results from a previous canvas", async () => {
    let firstWatchOptions: Record<string, unknown> | null = null;
    generationJobWatchMock.mockImplementationOnce(
      (_jobId: string, options: Record<string, unknown>) => {
        firstWatchOptions = options;
        return {
          promise: Promise.resolve({}),
          unsubscribe: vi.fn(),
        };
      },
    );

    const { rerender } = render(<CanvasPage />);

    await screen.findByText("Canvas Editor");

    const onStreamEvent = latestChatSidebarPropsRef.current?.onStreamEvent as
      | ((event: Record<string, unknown>) => void)
      | undefined;
    expect(onStreamEvent).toBeTypeOf("function");

    onStreamEvent?.({
      type: "tool.completed",
      runId: "run-1",
      toolCallId: "tool-1",
      toolName: "generate_image",
      output: {
        jobId: "job-image-1",
        jobType: "image_generation",
      },
      timestamp: "2026-06-08T00:00:00.000Z",
    });

    await waitFor(() => expect(generationJobWatchMock).toHaveBeenCalled());

    searchParamsRef.current = new URLSearchParams({ id: "canvas-2" });
    fetchCanvasMock.mockResolvedValueOnce({
      canvas: {
        id: "canvas-2",
        name: "Second Canvas",
        projectId: "project-2",
        content: {
          elements: [],
          appState: {},
          files: {},
        },
      },
    });
    fetchProjectMock.mockResolvedValueOnce({
      project: {
        id: "project-2",
        name: "Second Project",
        brandKitId: null,
      },
    });
    rerender(<CanvasPage />);

    await waitFor(() =>
      expect(fetchCanvasMock).toHaveBeenLastCalledWith("canvas-2"),
    );

    const onSucceeded = firstWatchOptions?.onSucceeded as
      | ((result: Record<string, unknown>) => void)
      | undefined;
    onSucceeded?.({
      signed_url: "http://localhost:3001/local-assets/old-image",
      mime_type: "image/png",
      width: 512,
      height: 512,
    });

    expect(insertImageOnCanvasMock).not.toHaveBeenCalled();
  });
});
