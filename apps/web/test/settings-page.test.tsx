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

const EMPTY_PROVIDER_MODELS = {
  openai: [],
  anthropic: [],
  agnes: [],
  google: [],
  vertex: [],
};

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
          providerModels: EMPTY_PROVIDER_MODELS,
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
      expect(screen.getByText("Default LLM Model")).toBeInTheDocument(),
    );
  });

  it("loads and saves local agent provider settings from the Agent tab", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        providerModels: {
          openai: ["openai:gpt-4.1"],
          anthropic: ["anthropic:claude-sonnet-4-5"],
          agnes: ["agnes:agnes-2.0-flash"],
          google: ["google:gemini-2.5-flash"],
          vertex: [],
        },
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
        providerModels: {
          openai: ["openai:gpt-4.1"],
          anthropic: ["anthropic:claude-sonnet-4-5"],
          agnes: ["agnes:agnes-2.0-flash"],
          google: ["google:gemini-2.5-flash"],
          vertex: [],
        },
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

    expect((await screen.findAllByText("openai:gpt-4.1")).length).toBeGreaterThan(0);
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
    expect(screen.getByDisplayValue("agnes-2.0-flash")).toBeInTheDocument();
    expect(screen.getByText("Agnes models")).toBeInTheDocument();
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

    await userEvent.click(
      screen.getByRole("button", { name: "Browse available models" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: /Use gemini-2.5-flash/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith({
        defaultModel: "google:gemini-2.5-flash",
        providerModels: {
          openai: ["openai:gpt-4.1"],
          anthropic: ["anthropic:claude-sonnet-4-5"],
          agnes: ["agnes:agnes-2.0-flash"],
          google: ["google:gemini-2.5-flash"],
          vertex: [],
        },
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
    expect(screen.getByLabelText("Anthropic API Key")).toHaveValue(
      "sk-local-anthropic",
    );
  });

  it("lets a provider manage its model list and save custom model IDs", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:deepseek-chat",
        providerModels: EMPTY_PROVIDER_MODELS,
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
        {
          id: "anthropic:minimax-m2.5",
          name: "minimax-m2.5",
          provider: "anthropic",
        },
      ],
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:custom-gateway-model",
        providerModels: {
          openai: ["openai:custom-gateway-model"],
          anthropic: [],
          agnes: [],
          google: [],
          vertex: [],
        },
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

    await screen.findByLabelText("OpenAI API Key");
    const customModelInput = screen.getByRole("textbox", {
      name: "Add OpenAI-compatible model",
    });
    await userEvent.type(customModelInput, "custom-gateway-model");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          providerModels: expect.objectContaining({
            openai: ["openai:custom-gateway-model"],
          }),
        }),
      ),
    );
    expect(screen.getByLabelText("OpenAI API Key")).toHaveValue("sk-local-openai");
  });

  it("lets the default model picker switch to Anthropic and choose a model", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "agnes:agnes-2.0-flash",
        providerModels: {
          openai: [],
          anthropic: ["anthropic:minimax-m2.5"],
          agnes: ["agnes:agnes-2.0-flash"],
          google: [],
          vertex: [],
        },
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://anthropic-proxy.example/v1",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
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
        { id: "agnes:agnes-2.0-flash", name: "Agnes 2.0 Flash", provider: "agnes" },
        {
          id: "anthropic:minimax-m2.5",
          name: "minimax-m2.5",
          provider: "anthropic",
        },
      ],
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "anthropic:minimax-m2.5",
        providerModels: {
          openai: [],
          anthropic: ["anthropic:minimax-m2.5"],
          agnes: ["agnes:agnes-2.0-flash"],
          google: [],
          vertex: [],
        },
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "sk-local-anthropic",
        anthropicBaseUrl: "https://anthropic-proxy.example/v1",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "agnes:agnes-2.0-flash",
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

    await screen.findByText("Default LLM Model");
    await userEvent.click(
      await screen.findByRole("button", { name: "Browse available models" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: /Use minimax-m2.5/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModel: "anthropic:minimax-m2.5",
        }),
      ),
    );
  });

  it("shows the Media tab with Replicate and Volces provider cards", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        providerModels: EMPTY_PROVIDER_MODELS,
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
