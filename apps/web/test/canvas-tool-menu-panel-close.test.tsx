// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../src/components/toast";

const { fetchImageModelsMock } = vi.hoisted(() => ({
  fetchImageModelsMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/server-api")>(
    "../src/lib/server-api",
  );
  return {
    ...actual,
    fetchImageModels: fetchImageModelsMock,
  };
});

vi.mock("../src/hooks/use-image-model-preference", () => ({
  useImageModelPreference: () => ({
    activeImageGenerationPreference: null,
  }),
}));

vi.mock("../src/hooks/use-video-model-preference", () => ({
  useVideoModelPreference: () => ({
    activeVideoGenerationPreference: null,
  }),
}));

import { CanvasToolMenu } from "../src/components/canvas-tool-menu";

type TestElement = {
  id: string;
  customData?: { type?: string };
};

type TestAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  activeTool: { type: string };
  selectedElementIds: Record<string, boolean>;
  width: number;
  height: number;
};

type TestSceneUpdate = {
  elements?: TestElement[];
  appState?: Partial<TestAppState>;
};

describe("CanvasToolMenu panel dismissal", () => {
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("clears the selected generator when dismissing the image panel from the canvas", async () => {
    let elements: TestElement[] = [];
    let appState: TestAppState = {
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      activeTool: { type: "selection" },
      selectedElementIds: {},
      width: 1200,
      height: 800,
    };
    const updateScene = vi.fn((scene: TestSceneUpdate) => {
      if (scene.elements) elements = scene.elements;
      if (scene.appState) appState = { ...appState, ...scene.appState };
    });
    const excalidrawApi = {
      getSceneElements: () => elements,
      getAppState: () => appState,
      updateScene,
      onChange: vi.fn(() => () => {}),
      setActiveTool: vi.fn(),
    };

    render(
      <ToastProvider>
        <CanvasToolMenu
          canvasId="canvas-1"
          projectId="project-1"
          excalidrawApi={excalidrawApi}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 生成图片" }));
    await screen.findByPlaceholderText("今天我们要创作什么");

    const generatorId = elements.find(
      (element) => element.customData?.type === "image-generator",
    )?.id;
    expect(generatorId).toBeTruthy();
    expect(appState.selectedElementIds).toEqual({ [generatorId]: true });

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("今天我们要创作什么"),
      ).not.toBeInTheDocument();
    });
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: { selectedElementIds: {} },
        captureUpdate: "IMMEDIATELY",
      }),
    );
  });

  it("keeps the selected generator while pressing an Excalidraw context menu item", async () => {
    let elements: TestElement[] = [];
    let appState: TestAppState = {
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      activeTool: { type: "selection" },
      selectedElementIds: {},
      width: 1200,
      height: 800,
    };
    const updateScene = vi.fn((scene: TestSceneUpdate) => {
      if (scene.elements) elements = scene.elements;
      if (scene.appState) appState = { ...appState, ...scene.appState };
    });
    const excalidrawApi = {
      getSceneElements: () => elements,
      getAppState: () => appState,
      updateScene,
      onChange: vi.fn(() => () => {}),
      setActiveTool: vi.fn(),
    };

    render(
      <ToastProvider>
        <CanvasToolMenu
          canvasId="canvas-1"
          projectId="project-1"
          excalidrawApi={excalidrawApi}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 生成图片" }));
    await screen.findByPlaceholderText("今天我们要创作什么");

    const generatorId = elements.find(
      (element) => element.customData?.type === "image-generator",
    )?.id;
    expect(generatorId).toBeTruthy();
    updateScene.mockClear();

    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="excalidraw">
          <ul class="context-menu">
            <li>
              <button type="button" class="context-menu-item">Delete</button>
            </li>
          </ul>
        </div>
      `,
    );
    const contextMenuButton = document.querySelector(
      ".context-menu-item",
    ) as HTMLButtonElement;

    fireEvent.pointerDown(contextMenuButton);
    fireEvent.mouseDown(contextMenuButton);

    expect(
      screen.getByPlaceholderText("今天我们要创作什么"),
    ).toBeInTheDocument();
    expect(updateScene).not.toHaveBeenCalledWith(
      expect.objectContaining({
        appState: { selectedElementIds: {} },
        captureUpdate: "IMMEDIATELY",
      }),
    );
    expect(appState.selectedElementIds).toEqual({ [generatorId]: true });
  });
});
