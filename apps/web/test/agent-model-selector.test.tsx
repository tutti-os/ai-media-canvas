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
    initialAgentSourceTab,
    initialTab,
    open,
  }: {
    initialAgentSourceTab?: string;
    initialTab?: string;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="settings-dialog">
        {initialTab ?? "agent"}
        {initialAgentSourceTab ? `:${initialAgentSourceTab}` : ""}
      </div>
    ) : null,
}));

import { AgentModelSelector } from "../src/components/agent-model-selector";
import { i18n } from "../src/i18n";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "../src/lib/workspace-settings-events";

describe("AgentModelSelector", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
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

  it("renders a tooltip label for the compact model trigger", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "codex:default", name: "Codex", provider: "codex" }],
    });
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });

    render(<AgentModelSelector compact />);

    expect(await screen.findByText("Select agent model")).toBeInTheDocument();
  });

  it("renders localized trigger copy in Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "codex:default", name: "Codex", provider: "codex" }],
    });
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });

    render(<AgentModelSelector compact />);

    expect(await screen.findByText("选择 Agent 模型")).toBeInTheDocument();
  });

  it("can place the compact model trigger tooltip below the trigger", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "codex:default", name: "Codex", provider: "codex" }],
    });
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });

    render(<AgentModelSelector compact tooltipPlacement="bottom" />);

    expect(await screen.findByText("Select agent model")).toHaveClass(
      "top-full",
    );
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

  it("shows the display name for a Tutti Managed workspace default model", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "tutti:agnes:agnes-2.0-flash",
        defaultModelSource: "nextop-managed",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "tutti:agnes:agnes-2.0-flash",
          name: "agnes-2.0-flash",
          provider: "agnes",
          source: "nextop-managed",
        },
      ],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    expect(
      await screen.findByText("Uses default model: agnes-2.0-flash"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Uses your configured default route"),
    ).not.toBeInTheDocument();
  });

  it("switches the picker between local CLI and API provider models", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "codex:gpt-5.4",
          name: "Codex",
          description: "Strong model for everyday coding.",
          provider: "codex",
        },
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
      ],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    expect(
      await screen.findByRole("button", { name: "Local agent" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "API provider" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Strong model for everyday coding."),
    ).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "API provider" }));

    expect(screen.getByRole("button", { name: "Local agent" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "API provider" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
  });

  it("opens agent settings on the Tutti Managed panel from the empty state", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "codex:gpt-5.5", name: "Codex", provider: "codex" }],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Tutti Managed" }),
    );

    expect(
      await screen.findByText("No Tutti Managed models connected."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect in settings" }),
    );

    expect(screen.getByTestId("settings-dialog")).toHaveTextContent(
      "agent:nextop-managed",
    );
  });

  it("shows local CLI provider icons in the model groups", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "codex:gpt-5.5", name: "GPT-5.5", provider: "codex" },
        {
          id: "claude:default",
          name: "Default (CLI config)",
          provider: "claude",
        },
      ],
    });

    render(<AgentModelSelector compact />);

    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    await screen.findByText("Claude Code");
    const codexHeading = screen
      .getAllByText("Codex")
      .find((element) => element.tagName === "DIV");
    const claudeHeading = await screen.findByText("Claude Code");

    if (!codexHeading) {
      throw new Error("Codex provider heading was not rendered.");
    }
    expect(codexHeading.firstElementChild?.tagName).toBe("SPAN");
    expect(claudeHeading.firstElementChild?.tagName).toBe("SPAN");
    expect(codexHeading.firstElementChild).toHaveClass("size-4");
    expect(claudeHeading.firstElementChild).toHaveClass("size-4");
  });

  it("shows the default local CLI provider in the trigger", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "codex:default",
          name: "Default (CLI config)",
          provider: "codex",
        },
        { id: "codex:gpt-5.5", name: "gpt-5.5", provider: "codex" },
      ],
    });

    render(<AgentModelSelector compact />);

    expect(
      await screen.findByRole("button", { name: /Codex/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Codex/i }));
    expect(
      await screen.findByText("Uses default model: Default (CLI config)"),
    ).toBeInTheDocument();
  });

  it("uses a static provider outline for the active local CLI trigger", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "codex:default",
          name: "Default (CLI config)",
          provider: "codex",
        },
      ],
    });

    render(<AgentModelSelector compact />);

    const trigger = await screen.findByRole("button", { name: /Codex/i });
    expect(trigger).not.toHaveClass("agent-model-trigger-wave");
    expect(trigger).toHaveClass("border-[#6F7CFF]");
    expect(trigger).toHaveClass("text-[#4F5DFF]");
    expect(trigger).toHaveClass("bg-background");
    expect(trigger).not.toHaveClass("border-accent");
    expect(
      trigger.querySelector(".agent-model-trigger-mask"),
    ).not.toBeInTheDocument();
  });

  it("preserves the local CLI default model when Default CLI config is clicked", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:default",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "codex:default",
          name: "Default (CLI config)",
          provider: "codex",
        },
        { id: "codex:gpt-5.5", name: "gpt-5.5", provider: "codex" },
      ],
    });

    render(<AgentModelSelector compact />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Codex/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Default (CLI config)" }),
    );

    expect(setModelMock).toHaveBeenCalledWith("codex:default", "local-agent");
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
        {
          id: "codex:default",
          name: "Default (CLI config)",
          provider: "codex",
        },
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

    expect(setModelMock).toHaveBeenCalledWith(
      "anthropic:minimax-m2.5",
      "api-provider",
    );
  });
});
