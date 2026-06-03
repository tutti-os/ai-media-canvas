// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchModelsMock, fetchWorkspaceSettingsMock, setModelMock } = vi.hoisted(() => ({
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
          { id: "openai:deepseek-chat", name: "deepseek-chat", provider: "openai" },
          { id: "openai:qwen-plus", name: "qwen-plus", provider: "openai" },
        ],
      });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.getByText("qwen-plus")).toBeInTheDocument();
  });

  it("shows the default-model hint, keeps Agnes above OpenAI, and exposes settings at the top", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
        { id: "openai:gpt-5.5", name: "gpt-5.5", provider: "openai" },
        { id: "agnes:agnes-2.0-flash", name: "Agnes 2.0 Flash", provider: "agnes" },
      ],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

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

    const popover = container.ownerDocument.querySelector(
      ".overflow-y-auto",
    );
    expect(popover).toHaveClass("max-h-[min(28rem,calc(100vh-2rem))]");
    expect(popover).toHaveClass("overflow-y-auto");
  });

  it("lets people enter and apply a custom model id from the picker", async () => {
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
      ],
    });

    render(<AgentModelSelector compact />);

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Agent/i }));

    const input = await screen.findByLabelText("Custom model ID");
    await userEvent.clear(input);
    await userEvent.type(input, "anthropic:minimax-m2.5");
    await userEvent.click(screen.getByRole("button", { name: "Use custom model" }));

    expect(setModelMock).toHaveBeenCalledWith("anthropic:minimax-m2.5");
  });
});
