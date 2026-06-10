// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
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
import { i18n } from "../src/i18n";

const initialContent = {
  appState: {},
  elements: [],
  files: {},
};

describe("CanvasEditor i18n", () => {
  beforeEach(async () => {
    excalidrawPropsRef.current = null;
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    cleanup();
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
});
