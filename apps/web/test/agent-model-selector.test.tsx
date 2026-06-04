// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchModelsMock, fetchWorkspaceSettingsMock, setModelMock } =
  vi.hoisted(() => ({
    fetchModelsMock: vi.fn(),
    fetchWorkspaceSettingsMock: vi.fn(),
    setModelMock: vi.fn(),
  }));

vi.mock("../src/lib/server-api", () => ({
  fetchModels: fetchModelsMock,
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
}));

vi.mock("../src/hooks/use-agent-model", () => ({
  useAgentModel: () => ({
    model: null,
    setModel: setModelMock,
  }),
}));

vi.mock("../src/components/settings-dialog", () => ({
  SettingsDialog: ({
    initialTab,
    open,
  }: {
    initialTab?: string;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="settings-dialog">{initialTab ?? "agent"}</div>
    ) : null,
}));

import { AgentModelSelector } from "../src/components/agent-model-selector";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "../src/lib/workspace-settings-events";

describe("AgentModelSelector", () => {
  beforeEach(() => {
    fetchModelsMock.mockReset();
    fetchWorkspaceSettingsMock.mockReset();
    setModelMock.mockReset();
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-5.4",
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("refreshes models when the picker opens so it reflects the latest provider list", async () => {
    fetchModelsMock
      .mockResolvedValueOnce({
        models: [
          { id: "openai:gpt-4.1", name: "OpenAI GPT-4.1", provider: "openai" },
        ],
      })
      .mockResolvedValueOnce({
        models: [
          {
            id: "openai:deepseek-chat",
            name: "deepseek-chat",
            provider: "openai",
          },
          { id: "openai:qwen-plus", name: "qwen-plus", provider: "openai" },
        ],
      });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "API provider" }),
    );

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.getByText("qwen-plus")).toBeInTheDocument();
  });

  it("shows the default-model hint, keeps Agnes above OpenAI, and exposes settings at the top", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
        { id: "openai:gpt-5.5", name: "gpt-5.5", provider: "openai" },
        {
          id: "agnes:agnes-2.0-flash",
          name: "Agnes 2.0 Flash",
          provider: "agnes",
        },
      ],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "API provider" }),
    );

    expect(
      await screen.findByText("Uses default model: gpt-5.4"),
    ).toBeInTheDocument();

    const agnesHeading = screen.getByText("Agnes");
    const openAIHeading = screen.getByText("OpenAI");
    expect(
      agnesHeading.compareDocumentPosition(openAIHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Open agent settings" }),
    );
    expect(screen.getByTestId("settings-dialog")).toHaveTextContent("agent");
  });

  it("switches the picker between local CLI and API provider models", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "codex:gpt-5.4", name: "Codex", provider: "codex" },
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
      ],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    expect(
      await screen.findByRole("button", { name: "Local CLI" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "API provider" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "API provider" }));

    expect(screen.getByRole("button", { name: "Local CLI" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "API provider" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
  });

  it("shows the default local CLI provider in the trigger", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "codex:default", name: "Default (CLI config)", provider: "codex" },
        { id: "codex:gpt-5.5", name: "gpt-5.5", provider: "codex" },
      ],
    });

    render(<AgentModelSelector compact />);

    expect(
      await screen.findByRole("button", { name: /Codex/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Codex/i }));
    expect(
      await screen.findByText("Uses default model: gpt-5.5"),
    ).toBeInTheDocument();
  });

  it("refreshes the trigger when workspace settings are saved elsewhere", async () => {
    fetchWorkspaceSettingsMock
      .mockResolvedValueOnce({
        settings: {
          defaultModel: "codex:default",
        },
      })
      .mockResolvedValueOnce({
        settings: {
          defaultModel: "claude:default",
        },
      });
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "codex:default", name: "Default (CLI config)", provider: "codex" },
        {
          id: "claude:default",
          name: "Default (CLI config)",
          provider: "claude",
        },
      ],
    });

    render(<AgentModelSelector compact />);

    expect(
      await screen.findByRole("button", { name: /Codex/i }),
    ).toBeInTheDocument();

    window.dispatchEvent(new Event(WORKSPACE_SETTINGS_UPDATED_EVENT));

    expect(
      await screen.findByRole("button", { name: /Claude Code/i }),
    ).toBeInTheDocument();
  });

  it("keeps the picker scrollable when the model list is taller than the viewport", async () => {
    fetchModelsMock.mockResolvedValue({
      models: Array.from({ length: 20 }, (_, index) => ({
        id: `openai:model-${index + 1}`,
        name: `model-${index + 1}`,
        provider: "openai",
      })),
    });

    const { container } = render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    const popover = container.ownerDocument.querySelector(".overflow-y-auto");
    expect(popover).toHaveClass("max-h-[min(28rem,calc(100vh-2rem))]");
    expect(popover).toHaveClass("overflow-y-auto");
  });

  it("lets people enter and apply a custom model id from the picker", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" }],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "API provider" }),
    );

    const input = await screen.findByLabelText("Custom model ID");
    await userEvent.clear(input);
    await userEvent.type(input, "anthropic:minimax-m2.5");
    await userEvent.click(
      screen.getByRole("button", { name: "Use custom model" }),
    );

    expect(setModelMock).toHaveBeenCalledWith("anthropic:minimax-m2.5");
  });
});
