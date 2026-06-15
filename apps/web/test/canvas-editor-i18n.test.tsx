// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { excalidrawPropsRef } = vi.hoisted(() => ({
  excalidrawPropsRef: { current: null as Record<string, unknown> | null },
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const MockExcalidraw: ComponentType<Record<string, unknown>> = (props) => {
      excalidrawPropsRef.current = props;
      return <div data-testid="mock-excalidraw" />;
    };
    return MockExcalidraw;
  },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("../src/lib/server-api", () => ({
  saveCanvas: vi.fn(),
  uploadThumbnail: vi.fn(),
}));

import { CanvasEditor } from "../src/components/canvas-editor";
import { ToastProvider } from "../src/components/toast";
import { i18n } from "../src/i18n";
import { saveCanvas } from "../src/lib/server-api";

const initialContent = {
  appState: {},
  elements: [],
  files: {},
};

describe("CanvasEditor i18n", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.mocked(saveCanvas).mockClear();
    vi.mocked(saveCanvas).mockResolvedValue(undefined);
    excalidrawPropsRef.current = null;
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("passes the current app locale to Excalidraw", () => {
    render(
      <CanvasEditor
        canvasId="canvas-1"
        projectId="project-1"
        initialContent={initialContent}
      />,
    );

    expect(excalidrawPropsRef.current?.langCode).toBe("zh-CN");
  });

  it("passes English to Excalidraw when the app locale changes", async () => {
    await i18n.changeLanguage("en");

    render(
      <CanvasEditor
        canvasId="canvas-1"
        projectId="project-1"
        initialContent={initialContent}
      />,
    );

    expect(excalidrawPropsRef.current?.langCode).toBe("en");
  });

  it("marks the canvas shell as a named container for toolbar layout", () => {
    const { getByTestId } = render(
      <CanvasEditor
        canvasId="canvas-1"
        projectId="project-1"
        initialContent={initialContent}
      />,
    );

    expect(getByTestId("mock-excalidraw").parentElement).toHaveClass(
      "@container/canvas",
    );
  });

  it("does not save an empty scene over a hydrated canvas with existing elements", async () => {
    vi.useFakeTimers();
    const canvasApi = {
      addFiles: vi.fn(),
      getAppState: vi.fn(() => ({})),
      getFiles: vi.fn(() => ({})),
      getSceneElements: vi.fn(() => [
        {
          id: "shape-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          isDeleted: false,
        },
      ]),
      onChange: vi.fn(() => () => {}),
      updateScene: vi.fn(),
    };

    render(
      <ToastProvider>
        <CanvasEditor
          canvasId="canvas-1"
          projectId="project-1"
          initialContent={{
            appState: {},
            elements: [
              {
                id: "shape-1",
                type: "rectangle",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            files: {},
          }}
        />
      </ToastProvider>,
    );

    await act(async () => {
      (excalidrawPropsRef.current?.excalidrawAPI as (api: unknown) => void)(
        canvasApi,
      );
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.mocked(saveCanvas).mockClear();

    act(() => {
      (
        excalidrawPropsRef.current?.onChange as (
          elements: unknown[],
          appState: unknown,
        ) => void
      )([], {});
      vi.advanceTimersByTime(1500);
    });

    expect(saveCanvas).not.toHaveBeenCalled();
  });

  it("does not save remote canvas sync updates back as local edits", async () => {
    vi.useFakeTimers();
    const canvasApi = {
      addFiles: vi.fn(),
      getAppState: vi.fn(() => ({})),
      getFiles: vi.fn(() => ({})),
      getSceneElements: vi.fn(() => [
        {
          id: "generator-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 320,
          height: 320,
          isDeleted: false,
          customData: {
            type: "image-generator",
            status: "generating",
            jobId: "job-image-1",
          },
        },
      ]),
      onChange: vi.fn(() => () => {}),
      updateScene: vi.fn(),
    };

    render(
      <ToastProvider>
        <CanvasEditor
          canvasId="canvas-1"
          projectId="project-1"
          initialContent={{
            appState: {},
            elements: [
              {
                id: "shape-1",
                type: "rectangle",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            files: {},
          }}
        />
      </ToastProvider>,
    );

    await act(async () => {
      (excalidrawPropsRef.current?.excalidrawAPI as (api: unknown) => void)(
        canvasApi,
      );
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.mocked(saveCanvas).mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("aimc:canvas-remote-sync", {
          detail: { canvasId: "canvas-1" },
        }),
      );
      (
        excalidrawPropsRef.current?.onChange as (
          elements: unknown[],
          appState: unknown,
        ) => void
      )(canvasApi.getSceneElements(), {});
      vi.advanceTimersByTime(1500);
    });

    expect(saveCanvas).not.toHaveBeenCalled();
  });
});
