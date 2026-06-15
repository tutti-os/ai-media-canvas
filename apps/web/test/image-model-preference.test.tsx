// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageModelPreferencePopover } from "../src/components/image-model-preference";
import { i18n } from "../src/i18n";

const {
  fetchImageModelsMock,
  fetchVideoModelsMock,
  fetchWorkspaceSettingsMock,
} = vi.hoisted(() => ({
  fetchImageModelsMock: vi.fn(),
  fetchVideoModelsMock: vi.fn(),
  fetchWorkspaceSettingsMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchImageModels: fetchImageModelsMock,
  fetchVideoModels: fetchVideoModelsMock,
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
}));

function OpenPopover({
  onClose = () => {},
  onOpenSettings,
}: {
  onClose?: () => void;
  onOpenSettings?: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button ref={anchorRef} type="button">
        Anchor
      </button>
      <ImageModelPreferencePopover
        anchorRef={anchorRef}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
        open
      />
    </>
  );
}

function MovingAnchorPopover({
  getRect,
}: {
  getRect: () => Pick<DOMRect, "bottom" | "left" | "right" | "top">;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={(node) => {
          anchorRef.current = node;
          if (node) {
            node.getBoundingClientRect = () =>
              ({
                ...getRect(),
                height: getRect().bottom - getRect().top,
                toJSON: () => ({}),
                width: getRect().right - getRect().left,
                x: getRect().left,
                y: getRect().top,
              }) as DOMRect;
          }
        }}
        type="button"
      >
        Anchor
      </button>
      <ImageModelPreferencePopover
        anchorRef={anchorRef}
        onClose={() => {}}
        open
      />
    </>
  );
}

describe("ImageModelPreferencePopover", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
      window.clearTimeout(handle),
    );
    fetchImageModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes-image/agnes-image-2.1-flash",
          displayName: "Agnes Image 2.1 Flash",
          description: "Agnes image route.",
          provider: "agnes-image",
        },
      ],
    });
    fetchVideoModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes-video/agnes-video-v2.0",
          displayName: "Agnes Video v2.0",
          description: "Agnes video route.",
          provider: "agnes-video",
        },
      ],
    });
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "local:assistant",
        providerModels: {
          openai: [],
          anthropic: [],
          agnes: [],
          google: [],
          vertex: [],
        },
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "",
        agnesBaseUrl: "",
        agnesDefaultModel: "",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        googleVertexVideoLocation: "",
        replicateApiToken: "",
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("hides provider models when the matching media provider is not configured in settings", async () => {
    render(<OpenPopover />);

    await waitFor(() => expect(fetchImageModelsMock).toHaveBeenCalledTimes(1));

    expect(screen.queryByText("Agnes Image 2.1 Flash")).not.toBeInTheDocument();
  });

  it("opens media settings from the empty model state", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenSettings = vi.fn();

    render(<OpenPopover onClose={onClose} onOpenSettings={onOpenSettings} />);

    await waitFor(() => expect(fetchImageModelsMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "配置媒体模型" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("repositions with its anchor when the page scrolls", async () => {
    let top = 100;
    let bottom = 132;
    render(
      <MovingAnchorPopover
        getRect={() => ({ bottom, left: 300, right: 420, top })}
      />,
    );

    const popover = screen.getByTestId("image-model-preference-popover");
    expect(popover).toHaveStyle({ left: "40px", top: "140px" });

    top = 40;
    bottom = 72;
    window.dispatchEvent(new Event("scroll"));

    await waitFor(() =>
      expect(popover).toHaveStyle({ left: "40px", top: "80px" }),
    );
  });
});
