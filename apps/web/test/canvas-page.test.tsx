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
  insertVideoOnCanvasMock,
  latestChatSidebarPropsRef,
} =
  vi.hoisted(() => ({
    fetchCanvasMock: vi.fn(),
    fetchProjectMock: vi.fn(),
    generationJobWatchMock: vi.fn(),
    replaceMock: vi.fn(),
    refreshMock: vi.fn(),
    insertVideoOnCanvasMock: vi.fn(),
    latestChatSidebarPropsRef: {
      current: null as Record<string, unknown> | null,
    },
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams({ id: "canvas-1" }),
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
}));

vi.mock("../src/lib/canvas-elements", () => ({
  insertImageOnCanvas: vi.fn(),
  insertVideoOnCanvas: insertVideoOnCanvasMock,
}));

import CanvasPage from "../src/app/canvas/page";

describe("Canvas page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestChatSidebarPropsRef.current = null;
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
    generationJobWatchMock.mockImplementation((_jobId: string, options: any) => {
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
    });
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
});
