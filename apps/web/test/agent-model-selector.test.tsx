// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchModelsMock, setModelMock } = vi.hoisted(() => ({
  fetchModelsMock: vi.fn(),
  setModelMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchModels: fetchModelsMock,
}));

vi.mock("../src/hooks/use-agent-model", () => ({
  useAgentModel: () => ({
    model: null,
    setModel: setModelMock,
  }),
}));

import { AgentModelSelector } from "../src/components/agent-model-selector";

describe("AgentModelSelector", () => {
  beforeEach(() => {
    fetchModelsMock.mockReset();
    setModelMock.mockReset();
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
});
