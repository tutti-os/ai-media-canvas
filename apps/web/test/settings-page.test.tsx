// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "../src/app/(workspace)/settings/page";

const {
  fetchWorkspaceSettingsMock,
  fetchModelsMock,
  updateWorkspaceSettingsMock,
} = vi.hoisted(() => ({
  fetchWorkspaceSettingsMock: vi.fn(),
  fetchModelsMock: vi.fn(),
  updateWorkspaceSettingsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../src/lib/server-api", () => ({
  fetchModels: fetchModelsMock,
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
  updateWorkspaceSettings: updateWorkspaceSettingsMock,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    fetchWorkspaceSettingsMock.mockReset();
    fetchModelsMock.mockReset();
    updateWorkspaceSettingsMock.mockReset();
    fetchModelsMock.mockResolvedValue({ models: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a retry state instead of rendering blank when the initial load fails", async () => {
    fetchWorkspaceSettingsMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        settings: {
          defaultModel: "",
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
          volcesApiKey: "",
          volcesBaseUrl: "",
        },
      });

    render(<SettingsPage />);

    await screen.findByText("Failed to load local settings. Please try again.");
    const retryButton = screen.getByRole("button", { name: "Retry" });
    await userEvent.click(retryButton);

    await waitFor(() =>
      expect(screen.getByLabelText("Default LLM Model")).toBeInTheDocument(),
    );
  });

  it("loads and saves local agent provider settings from the Agent tab", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "http://127.0.0.1:4000/v1",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://api.anthropic.com",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
        googleApiKey: "google-local-key",
        googleVertexProject: "vertex-project",
        googleVertexLocation: "global",
        googleVertexVideoLocation: "us-central1",
        replicateApiToken: "replicate-local-token",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "google:gemini-2.5-flash",
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "http://127.0.0.1:4000/v1",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://api.anthropic.com",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
        googleApiKey: "google-local-key",
        googleVertexProject: "vertex-project",
        googleVertexLocation: "global",
        googleVertexVideoLocation: "us-central1",
        replicateApiToken: "replicate-local-token",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    const defaultModelInput = await screen.findByLabelText("Default LLM Model");
    expect(defaultModelInput).toHaveValue("openai:gpt-4.1");
    expect(screen.getByLabelText("OpenAI API Key")).toHaveValue("sk-local-openai");
    const agnesButton = screen.getByRole("button", { name: "Agnes" });
    const openAIButton = screen.getByRole("button", { name: "OpenAI-compatible" });
    expect(
      agnesButton.compareDocumentPosition(openAIButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(agnesButton);
    expect(await screen.findByLabelText("Agnes API Key")).toHaveValue(
      "sk-local-agnes",
    );
    expect(screen.getByLabelText("Agnes Base URL")).toHaveValue(
      "https://agnes.example/v1",
    );
    expect(screen.getByLabelText("Agnes Default Model")).toHaveValue(
      "agnes:agnes-2.0-flash",
    );
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Get Agnes API Key" }),
    ).toHaveAttribute("href", "https://platform.agnes-ai.com/settings/apiKeys");
    expect(
      screen.getByRole("link", { name: "Quick Start Docs" }),
    ).toHaveAttribute("href", "https://agnes-ai.com/doc/quick-start");

    await userEvent.click(screen.getByRole("button", { name: /Anthropic/i }));
    expect(await screen.findByLabelText("Anthropic API Key")).toHaveValue(
      "sk-local-anthropic",
    );
    expect(screen.getByLabelText("Anthropic Base URL")).toHaveValue(
      "https://api.anthropic.com",
    );

    await userEvent.clear(defaultModelInput);
    await userEvent.type(defaultModelInput, "google:gemini-2.5-flash");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith({
        defaultModel: "google:gemini-2.5-flash",
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "http://127.0.0.1:4000/v1",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://api.anthropic.com",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
        googleApiKey: "google-local-key",
        googleVertexProject: "vertex-project",
        googleVertexLocation: "global",
        googleVertexVideoLocation: "us-central1",
        replicateApiToken: "replicate-local-token",
        volcesApiKey: "",
        volcesBaseUrl: "",
      }),
    );
  });

  it("shows OpenAI-compatible model suggestions and still allows a custom model ID", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:deepseek-chat",
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "https://gateway.example/v1",
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
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "openai:deepseek-chat", name: "deepseek-chat", provider: "openai" },
        { id: "openai:qwen-plus", name: "qwen-plus", provider: "openai" },
      ],
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:custom-gateway-model",
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "https://gateway.example/v1",
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
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    const defaultModelInput = await screen.findByLabelText("Default LLM Model");
    expect(await screen.findByText("Detected OpenAI-compatible models")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Use qwen-plus" }),
    );
    expect(defaultModelInput).toHaveValue("openai:qwen-plus");

    await userEvent.clear(defaultModelInput);
    await userEvent.type(defaultModelInput, "openai:custom-gateway-model");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModel: "openai:custom-gateway-model",
        }),
      ),
    );
  });

  it("shows the Media tab with Replicate and Volces provider cards", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        googleVertexVideoLocation: "",
        replicateApiToken: "replicate-local-token",
        volcesApiKey: "volces-local-key",
        volcesBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Media\b/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Replicate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Volces" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Agnes" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Get Agnes API Key" })[0],
    ).toHaveAttribute("href", "https://platform.agnes-ai.com/settings/apiKeys");
    expect(
      screen.getAllByRole("link", { name: "Quick Start Docs" })[0],
    ).toHaveAttribute("href", "https://agnes-ai.com/doc/quick-start");
    expect(screen.getByText("Seedance 1.5 Pro")).toBeInTheDocument();
    expect(screen.getByText("Agnes Video v2.0")).toBeInTheDocument();
    expect(screen.getByDisplayValue("replicate-local-token")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sk-local-agnes")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://ark.cn-beijing.volces.com/api/v3"),
    ).toBeInTheDocument();
  });
});
