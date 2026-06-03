// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageGenerationPreference } from "@aimc/shared";

import { ToastProvider } from "../src/components/toast";
import {
  INITIAL_AGENT_MODEL_KEY,
  INITIAL_ATTACHMENTS_KEY,
  INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
  useCreateProject,
} from "../src/hooks/use-create-project";

const { createProjectMock, pushMock } = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("../src/lib/server-api", () => ({
  createProject: createProjectMock,
}));

function CreateProjectHarness() {
  const { create, creating } = useCreateProject();

  return (
    <button type="button" onClick={() => void create()}>
      {creating ? "creating" : "create"}
    </button>
  );
}

function CreateProjectWithOptionsHarness(props: {
  attachments?: { assetId: string; url: string; mimeType: string; source: "upload" }[];
  imageGenerationPreference?: ImageGenerationPreference;
  model?: string;
}) {
  const { create, creating } = useCreateProject();

  return (
    <button
      type="button"
      onClick={() =>
        void create({
          attachments: props.attachments,
          imageGenerationPreference: props.imageGenerationPreference,
          model: props.model,
        })
      }
    >
      {creating ? "creating" : "create-with-options"}
    </button>
  );
}

describe("useCreateProject", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createProjectMock.mockReset();
    pushMock.mockReset();
    createProjectMock.mockResolvedValue({
      project: {
        primaryCanvas: { id: "canvas-1", name: "Main Canvas", isPrimary: true },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("navigates the opened tab without later changing the original page", async () => {
    let popupHref = "";
    const popup = {
      closed: false,
      location: Object.defineProperty({}, "href", {
        get() {
          return popupHref;
        },
        set(value: string) {
          popupHref = value;
        },
      }),
      close: vi.fn(),
    };

    vi.spyOn(window, "open").mockImplementation(() => popup as unknown as Window);

    render(
      <ToastProvider>
        <CreateProjectHarness />
      </ToastProvider>,
    );

    screen.getByRole("button", { name: "create" }).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(createProjectMock).toHaveBeenCalledWith({ name: "Untitled" });
    expect(popupHref).toBe("/canvas?id=canvas-1");

    await vi.advanceTimersByTimeAsync(450);

    expect(pushMock).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("ignores rapid duplicate create clicks while the first request is still pending", async () => {
    let resolveProject:
      | ((value: {
          project: {
            primaryCanvas: { id: string; name: string; isPrimary: boolean };
          };
        }) => void)
      | undefined;
    createProjectMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProject = resolve;
        }),
    );
    vi.spyOn(window, "open").mockImplementation(
      () =>
        ({
          closed: false,
          location: { href: "about:blank" },
          close: vi.fn(),
        }) as unknown as Window,
    );

    render(
      <ToastProvider>
        <CreateProjectHarness />
      </ToastProvider>,
    );

    const button = screen.getByRole("button", { name: "create" });
    button.click();
    button.click();

    expect(createProjectMock).toHaveBeenCalledTimes(1);

    resolveProject?.({
      project: {
        primaryCanvas: { id: "canvas-1", name: "Main Canvas", isPrimary: true },
      },
    });
  });

  it("clears initial sessionStorage payloads when project creation fails", async () => {
    createProjectMock.mockRejectedValue(new Error("boom"));
    const popup = {
      closed: false,
      location: { href: "about:blank" },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockImplementation(() => popup as unknown as Window);

    render(
      <ToastProvider>
        <CreateProjectWithOptionsHarness
          attachments={[
            {
              assetId: "asset-1",
              url: "http://local/asset-1.png",
              mimeType: "image/png",
              source: "upload",
            },
          ]}
          imageGenerationPreference={{ modelId: "local:placeholder-image" }}
          model="local:assistant"
        />
      </ToastProvider>,
    );

    screen.getByRole("button", { name: "create-with-options" }).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(sessionStorage.getItem(INITIAL_ATTACHMENTS_KEY)).toBeNull();
    expect(
      sessionStorage.getItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY),
    ).toBeNull();
    expect(sessionStorage.getItem(INITIAL_AGENT_MODEL_KEY)).toBeNull();
    expect(popup.close).toHaveBeenCalled();
  });

  it("falls back to in-page navigation when the popup is blocked", async () => {
    vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <ToastProvider>
        <CreateProjectHarness />
      </ToastProvider>,
    );

    screen.getByRole("button", { name: "create" }).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(pushMock).toHaveBeenCalledWith("/canvas?id=canvas-1");
  });
});
