// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  return (
    <ImageModelPreferencePopover
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      onOpenSettings={onOpenSettings}
      open
      trigger={<button type="button">Anchor</button>}
    />
  );
}

describe("ImageModelPreferencePopover", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
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

  it("shows Codex imagegen models returned by the backend capability check", async () => {
    fetchImageModelsMock.mockResolvedValueOnce({
      models: [
        {
          id: "codex/gpt-image-2",
          displayName: "Codex GPT Image 2",
          description: "Codex Imagegen route.",
          provider: "codex-imagegen",
        },
      ],
    });

    render(<OpenPopover />);

    await waitFor(() =>
      expect(screen.getByText("Codex GPT Image 2")).toBeInTheDocument(),
    );
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
});
