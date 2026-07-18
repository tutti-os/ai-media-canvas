// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "../src/app/(workspace)/settings/page";
import { SettingsDialog } from "../src/components/settings-dialog";
import {
  AIMC_LOCALE_COOKIE_NAME,
  AIMC_LOCALE_STORAGE_KEY,
  i18n,
} from "../src/i18n";

const {
  connectTuttiManagedModelsMock,
  disconnectTuttiManagedModelsMock,
  fetchTuttiManagedConnectionMock,
  fetchWorkspaceSettingsMock,
  fetchModelsMock,
  updateWorkspaceSettingsMock,
} = vi.hoisted(() => ({
  connectTuttiManagedModelsMock: vi.fn(),
  disconnectTuttiManagedModelsMock: vi.fn(),
  fetchTuttiManagedConnectionMock: vi.fn(),
  fetchWorkspaceSettingsMock: vi.fn(),
  fetchModelsMock: vi.fn(),
  updateWorkspaceSettingsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../src/lib/server-api", () => ({
  connectTuttiManagedModels: connectTuttiManagedModelsMock,
  disconnectTuttiManagedModels: disconnectTuttiManagedModelsMock,
  fetchModels: fetchModelsMock,
  fetchTuttiManagedConnection: fetchTuttiManagedConnectionMock,
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
    installMemoryLocalStorage();
    document.cookie = `${AIMC_LOCALE_COOKIE_NAME}=; Max-Age=0; path=/`;
    document.documentElement.lang = "";
    void i18n.changeLanguage("en");
    fetchWorkspaceSettingsMock.mockReset();
    fetchModelsMock.mockReset();
    fetchTuttiManagedConnectionMock.mockReset();
    connectTuttiManagedModelsMock.mockReset();
    disconnectTuttiManagedModelsMock.mockReset();
    updateWorkspaceSettingsMock.mockReset();
    fetchModelsMock.mockResolvedValue({ models: [] });
    fetchTuttiManagedConnectionMock.mockResolvedValue({
      connection: {
        connected: false,
        models: [],
        providers: [],
      },
    });
  });

  afterEach(() => {
    cleanup();
    (
      window as Window & {
        tuttiExternal?: unknown;
      }
    ).tuttiExternal = undefined;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("switches language from the General tab and persists the preference", async () => {
    void i18n.changeLanguage("zh-CN");
    fetchWorkspaceSettingsMock.mockResolvedValue({
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    render(<SettingsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /通用/ }));
    await userEvent.click(screen.getByRole("combobox", { name: "语言" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "English" }),
    );

    expect(await screen.findByText("Language")).toBeInTheDocument();
    expect(window.localStorage.getItem(AIMC_LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.cookie).toContain(`${AIMC_LOCALE_COOKIE_NAME}=en`);
    expect(document.documentElement.lang).toBe("en");
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
          kieApiKey: "",
          kieBaseUrl: "",
          volcesApiKey: "",
          volcesBaseUrl: "",
        },
      });

    render(<SettingsPage />);

    await screen.findByText("Failed to load local settings. Please try again.");
    const retryButton = screen.getByRole("button", { name: "Retry" });
    await userEvent.click(retryButton);
    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Default LLM Model")).toBeInTheDocument(),
    );
  });

  it("defaults BYOK protocol credentials to Agnes when no API provider is selected", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: EMPTY_PROVIDER_MODELS,
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
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

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );

    expect(await screen.findByLabelText("Agnes API Key")).toHaveValue(
      "sk-local-agnes",
    );
    expect(screen.getByLabelText("Agnes Base URL")).toHaveValue(
      "https://agnes.example/v1",
    );
    expect(screen.queryByLabelText("OpenAI API Key")).not.toBeInTheDocument();
  });

  it("prefills Agnes base URL and preset model IDs when Agnes settings are empty", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: EMPTY_PROVIDER_MODELS,
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
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
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
        },
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://apihub.agnes-ai.com/v1",
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
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );

    expect(await screen.findByLabelText("Agnes Base URL")).toHaveValue(
      "https://apihub.agnes-ai.com/v1",
    );
    expect(screen.getByLabelText("Agnes model 1")).toHaveValue(
      "agnes-2.0-flash",
    );
    expect(screen.getByLabelText("Agnes model 2")).toHaveValue(
      "agnes-1.5-flash",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Get Agnes API Key" }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      "https://platform.agnes-ai.com/settings/apiKeys",
      "_blank",
      "noopener,noreferrer",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          providerModels: expect.objectContaining({
            agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
          }),
          agnesBaseUrl: "https://apihub.agnes-ai.com/v1",
          agnesDefaultModel: "agnes:agnes-2.0-flash",
        }),
      ),
    );
    openSpy.mockRestore();
  });

  it("adds missing Agnes preset model IDs without removing existing custom models", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "agnes:agnes-custom",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          agnes: ["agnes:agnes-custom"],
        },
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "",
        agnesDefaultModel: "agnes:agnes-custom",
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

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );

    expect(await screen.findByLabelText("Agnes model 1")).toHaveValue(
      "agnes-2.0-flash",
    );
    expect(screen.getByLabelText("Agnes model 2")).toHaveValue(
      "agnes-1.5-flash",
    );
    expect(screen.getByLabelText("Agnes model 3")).toHaveValue("agnes-custom");
  });

  it("hides Google Gemini and Vertex AI protocol credential entries", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "google:gemini-2.5-flash",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          google: ["google:gemini-2.5-flash"],
        },
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
        agnesDefaultModel: "",
        googleApiKey: "google-local-key",
        googleVertexProject: "vertex-project",
        googleVertexLocation: "global",
        googleVertexVideoLocation: "us-central1",
        replicateApiToken: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );

    expect(
      screen.queryByRole("button", { name: "Google Gemini" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vertex AI" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agnes" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "OpenAI-compatible" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Anthropic" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Agnes API Key")).toHaveValue(
      "sk-local-agnes",
    );
    expect(screen.queryByLabelText("Google API Key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Vertex Project")).not.toBeInTheDocument();
  });

  it("auto-imports detected API provider models when the provider has no configured models", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: EMPTY_PROVIDER_MODELS,
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-local-agnes",
        agnesBaseUrl: "https://agnes.example/v1",
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
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes:agnes-2.0-flash",
          name: "Agnes 2.0 Flash",
          provider: "agnes",
        },
      ],
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "agnes:agnes-2.0-flash",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
        },
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
        replicateApiToken: "",
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );

    await waitFor(
      () =>
        expect(screen.getByLabelText("Agnes model 1")).toHaveValue(
          "agnes-2.0-flash",
        ),
      { timeout: 1000 },
    );
    expect(
      screen.queryByRole("button", { name: "Import detected" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModel: "",
          providerModels: expect.objectContaining({
            agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
          }),
          agnesDefaultModel: "agnes:agnes-2.0-flash",
        }),
      ),
    );
  });

  it("loads and saves local agent provider settings from the Agent tab", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        providerModels: {
          openai: ["openai:gpt-4.1"],
          anthropic: ["anthropic:claude-sonnet-4-5"],
          agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
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
        kieApiKey: "",
        kieBaseUrl: "",
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
          agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );
    expect(
      (await screen.findAllByText("openai:gpt-4.1")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("OpenAI API Key")).toHaveValue(
      "sk-local-openai",
    );
    const agnesButton = screen.getByRole("button", { name: "Agnes" });
    const openAIButton = screen.getByRole("button", {
      name: "OpenAI-compatible",
    });
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
      await screen.findByRole("menuitemradio", {
        name: /Use gemini-2.5-flash/i,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith({
        defaultModel: "google:gemini-2.5-flash",
        defaultModelSource: "api-provider",
        providerModels: {
          openai: ["openai:gpt-4.1"],
          anthropic: ["anthropic:claude-sonnet-4-5"],
          agnes: ["agnes:agnes-2.0-flash", "agnes:agnes-1.5-flash"],
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
        kieApiKey: "",
        kieBaseUrl: "",
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "openai:deepseek-chat",
          name: "deepseek-chat",
          provider: "openai",
        },
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );
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
          defaultModel: "openai:deepseek-chat",
          providerModels: expect.objectContaining({
            openai: [
              "openai:deepseek-chat",
              "openai:qwen-plus",
              "openai:custom-gateway-model",
            ],
          }),
        }),
      ),
    );
    expect(screen.getByLabelText("OpenAI API Key")).toHaveValue(
      "sk-local-openai",
    );
  });

  it("quick fills OpenAI-compatible BYOK provider settings", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: EMPTY_PROVIDER_MODELS,
        openAIApiKey: "sk-local-openai",
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
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:deepseek-v4-flash",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          openai: [
            "openai:deepseek-v4-flash",
            "openai:deepseek-v4-pro",
            "openai:deepseek-chat",
            "openai:deepseek-reasoner",
          ],
        },
        openAIApiKey: "sk-local-openai",
        openAIApiBase: "https://api.deepseek.com",
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
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "OpenAI-compatible" }),
    );
    await userEvent.click(
      await screen.findByRole("combobox", { name: "Quick fill provider" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "DeepSeek - OpenAI" }),
    );

    expect(screen.getByLabelText("OpenAI Base URL")).toHaveValue(
      "https://api.deepseek.com",
    );
    expect(screen.getByLabelText("OpenAI-compatible model 1")).toHaveValue(
      "deepseek-v4-flash",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Get DeepSeek - OpenAI API Key" }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      "https://platform.deepseek.com/api_keys",
      "_blank",
      "noopener,noreferrer",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModel: "openai:deepseek-v4-flash",
          openAIApiBase: "https://api.deepseek.com",
          providerModels: expect.objectContaining({
            openai: [
              "openai:deepseek-v4-flash",
              "openai:deepseek-v4-pro",
              "openai:deepseek-chat",
              "openai:deepseek-reasoner",
            ],
          }),
        }),
      ),
    );
    openSpy.mockRestore();
  });

  it("quick fills current OpenAI API model presets", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
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

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "OpenAI-compatible" }),
    );
    await userEvent.click(
      await screen.findByRole("combobox", { name: "Quick fill provider" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "OpenAI" }),
    );

    expect(screen.getByLabelText("OpenAI Base URL")).toHaveValue(
      "https://api.openai.com/v1",
    );
    expect(screen.getByLabelText("OpenAI-compatible model 1")).toHaveValue(
      "gpt-5.5",
    );
    expect(screen.getByLabelText("OpenAI-compatible model 2")).toHaveValue(
      "gpt-5.4",
    );
    expect(screen.getByLabelText("OpenAI-compatible model 3")).toHaveValue(
      "gpt-5.4-mini",
    );
    expect(screen.getByLabelText("OpenAI-compatible model 4")).toHaveValue(
      "gpt-5.4-nano",
    );
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes:agnes-2.0-flash",
          name: "Agnes 2.0 Flash",
          provider: "agnes",
        },
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );
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

  it("shows Media settings across image and video provider tabs", async () => {
    updateWorkspaceSettingsMock.mockImplementation(async (settings) => ({
      settings,
    }));
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "volces-local-key",
        volcesBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Media\b/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Media Generation" }),
    ).toBeInTheDocument();
    const agnesHeading = await screen.findByRole("heading", { name: "Agnes" });
    expect(agnesHeading).toBeInTheDocument();
    expect(screen.getByText("Codex image permission")).toBeInTheDocument();
    const codexHeading = screen.getByRole("heading", {
      name: "Codex image permission",
    });
    const codexCard = codexHeading.closest(".rounded-xl");
    expect(codexCard).not.toBeNull();
    await userEvent.click(
      within(codexCard as HTMLElement).getByRole("button", {
        name: "Settings",
      }),
    );
    expect(
      within(codexCard as HTMLElement).getByRole("combobox", {
        name: "Codex image permission",
      }),
    ).toHaveTextContent("Ask each time");

    const agnesCard = agnesHeading.closest(".rounded-xl");
    expect(agnesCard).not.toBeNull();
    await userEvent.click(
      within(agnesCard as HTMLElement).getByRole("button", {
        name: "Settings",
      }),
    );
    expect(screen.getByDisplayValue("sk-local-agnes")).toBeInTheDocument();
    expect(
      within(agnesCard as HTMLElement).getByRole("link", {
        name: "Get Agnes API Key",
      }),
    ).toHaveAttribute("href", "https://platform.agnes-ai.com/settings/apiKeys");
    expect(
      within(agnesCard as HTMLElement).getByRole("link", {
        name: "Quick Start Docs",
      }),
    ).toHaveAttribute("href", "https://agnes-ai.com/doc/quick-start");

    await userEvent.clear(screen.getByDisplayValue("sk-local-agnes"));
    await userEvent.type(screen.getByLabelText("Agnes API Key"), "sk-updated");
    expect(
      within(codexCard as HTMLElement).getByRole("button", { name: "Save" }),
    ).toBeDisabled();
    expect(
      within(agnesCard as HTMLElement).getByRole("button", { name: "Save" }),
    ).toBeEnabled();

    await userEvent.click(
      within(codexCard as HTMLElement).getByRole("combobox", {
        name: "Codex image permission",
      }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Use by default" }),
    );
    await userEvent.click(
      within(codexCard as HTMLElement).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          agnesApiKey: "sk-local-agnes",
          codexImagegenDelegation: "always",
        }),
      ),
    );
    expect(screen.getByLabelText("Agnes API Key")).toHaveValue("sk-updated");

    const openAIHeading = screen.getByRole("heading", { name: "OpenAI" });
    const openAICard = openAIHeading.closest(".rounded-lg");
    expect(openAICard).not.toBeNull();
    await userEvent.click(
      within(openAICard as HTMLElement).getByRole("button", {
        name: "Add",
      }),
    );
    expect(
      within(openAICard as HTMLElement).getByText("GPT Image 2"),
    ).toBeInTheDocument();
    expect(
      within(openAICard as HTMLElement).getByText("GPT Image 1.5"),
    ).toBeInTheDocument();
    expect(
      within(openAICard as HTMLElement).queryByText("GPT Image 1"),
    ).not.toBeInTheDocument();
    expect(
      within(openAICard as HTMLElement).queryByText("GPT Image 1 Mini"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Video" }));

    const replicateHeading = await screen.findByRole("heading", {
      name: "Replicate",
    });
    expect(replicateHeading).toBeInTheDocument();
    const replicateCard = replicateHeading.closest(".rounded-xl");
    expect(replicateCard).not.toBeNull();
    await userEvent.click(
      within(replicateCard as HTMLElement).getByRole("button", {
        name: "Settings",
      }),
    );
    expect(screen.getByText("Seedance 1.5 Pro")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("replicate-local-token"),
    ).toBeInTheDocument();
    expect(
      within(replicateCard as HTMLElement).getByRole("link", {
        name: "Get Replicate API Key",
      }),
    ).toHaveAttribute("href", "https://replicate.com/account/api-tokens");
  });

  it("localizes Media settings copy in Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(await screen.findByText("媒体"));

    expect(await screen.findByText("媒体生成")).toBeInTheDocument();
    expect(
      screen.getByText("连接 AI 服务，用来生成图片和视频。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "图片" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "视频" })).toBeInTheDocument();
    expect(screen.getAllByText("未配置").length).toBeGreaterThan(0);
    expect(screen.getByText("手动添加")).toBeInTheDocument();
    expect(screen.getByText("Codex 生图权限")).toBeInTheDocument();
    const codexHeading = screen.getByRole("heading", {
      name: "Codex 生图权限",
    });
    const codexCard = codexHeading.closest(".rounded-xl");
    expect(codexCard).not.toBeNull();
    await userEvent.click(
      within(codexCard as HTMLElement).getByRole("button", {
        name: "设置",
      }),
    );
    expect(
      within(codexCard as HTMLElement).getByRole("combobox", {
        name: "Codex 生图权限",
      }),
    ).toHaveTextContent("每次询问");
    expect(screen.queryByText("Media Providers")).not.toBeInTheDocument();
    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
  });

  it("switches the Agent settings between Local agent and API provider setup", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:gpt-5.4",
        providerModels: {
          openai: ["openai:gpt-5.4"],
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "codex:gpt-5.4", name: "Codex", provider: "codex" },
        { id: "codex:gpt-5.5", name: "Codex", provider: "codex" },
        {
          id: "claude-code:sonnet",
          name: "Sonnet",
          provider: "claude-code",
        },
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
      ],
      localAgentProviders: [
        {
          provider: "codex",
          displayName: "Codex",
          supported: true,
          authState: "ok",
          models: [
            { id: "codex:gpt-5.4", name: "Codex", provider: "codex" },
            { id: "codex:gpt-5.5", name: "Codex", provider: "codex" },
          ],
        },
        {
          provider: "claude-code",
          displayName: "Claude Code",
          supported: true,
          authState: "ok",
          models: [
            {
              id: "claude-code:sonnet",
              name: "Sonnet",
              provider: "claude-code",
            },
          ],
        },
      ],
    });

    render(<SettingsPage />);

    expect(
      await screen.findByRole("tab", { name: "Local agent" }),
    ).toHaveAttribute("aria-selected", "true");
    expect((await screen.findAllByText("Codex")).length).toBeGreaterThan(0);
    expect(screen.getByText("2 models")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Claude Code/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Codex image permission"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Custom model id")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Claude Code/i }));
    expect(screen.queryByLabelText("OpenAI API Key")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "API provider" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "OpenAI-compatible" }),
    );

    expect(screen.getByRole("tab", { name: "Local agent" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "API provider" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByLabelText("OpenAI API Key")).toHaveValue(
      "sk-local-openai",
    );
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
  });

  it("defaults Agent settings to the selected model source tab", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-5.4",
        providerModels: {
          openai: ["openai:gpt-5.4"],
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "codex:gpt-5.4", name: "Codex", provider: "codex" },
        { id: "openai:gpt-5.4", name: "gpt-5.4", provider: "openai" },
      ],
    });

    render(<SettingsPage />);

    expect(
      await screen.findByRole("tab", { name: "API provider" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Local agent" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(await screen.findByText("Default LLM Model")).toBeInTheDocument();
  });

  it("uses the provider-declared default when a Local agent provider is selected", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
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
        { id: "codex:gpt-5.4", name: "gpt-5.4", provider: "codex" },
      ],
      localAgentProviders: [
        {
          provider: "codex",
          displayName: "Codex",
          supported: true,
          authState: "ok",
          defaultModelId: "codex:gpt-5.4",
          models: [
            {
              id: "codex:default",
              name: "Default (CLI config)",
              provider: "codex",
            },
            { id: "codex:gpt-5.5", name: "gpt-5.5", provider: "codex" },
            { id: "codex:gpt-5.4", name: "gpt-5.4", provider: "codex" },
          ],
        },
      ],
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:gpt-5.4",
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Codex/i }),
    );

    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModel: "codex:gpt-5.4",
        }),
      ),
    );
  });

  it("disables available Local agent providers that expose no models", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [],
      localAgentProviders: [
        {
          provider: "vendor-agent",
          displayName: "Vendor Agent",
          supported: true,
          authState: "ok",
          models: [],
        },
      ],
    });

    render(<SettingsPage />);

    expect(
      await screen.findByRole("button", { name: /Vendor Agent/i }),
    ).toBeDisabled();
  });

  it("keeps the Agent save action in a fixed bottom footer", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "codex:gpt-5.4",
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "codex:gpt-5.4", name: "Codex", provider: "codex" }],
    });

    render(<SettingsPage />);

    await screen.findByRole("button", { name: "Save" });
    const saveFooter = screen.getByTestId("agent-settings-save-footer");
    expect(saveFooter).toHaveClass("sticky");
    expect(saveFooter).toContainElement(
      screen.getByRole("button", { name: "Save" }),
    );
  });

  it("closes the settings dialog after a successful save", async () => {
    const onOpenChange = vi.fn();
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          openai: ["openai:gpt-4.1"],
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
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "openai:gpt-4.1", name: "GPT-4.1", provider: "openai" }],
    });
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "openai:gpt-4.1",
        providerModels: {
          ...EMPTY_PROVIDER_MODELS,
          openai: ["openai:gpt-4.1"],
        },
        openAIApiKey: "sk-updated",
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

    render(
      <SettingsDialog
        open
        onOpenChange={onOpenChange}
        onSaved={() => onOpenChange(false)}
      />,
    );

    await userEvent.click(
      await screen.findByRole("tab", { name: "API provider" }),
    );
    await userEvent.type(screen.getByLabelText("OpenAI API Key"), "sk-updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("closes the settings dialog after a successful media provider save", async () => {
    const onOpenChange = vi.fn();
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: EMPTY_PROVIDER_MODELS,
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-old-agnes",
        agnesBaseUrl: "https://apihub.agnes-ai.com/v1",
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
    updateWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        providerModels: EMPTY_PROVIDER_MODELS,
        openAIApiKey: "",
        openAIApiBase: "",
        anthropicApiKey: "",
        anthropicBaseUrl: "",
        agnesApiKey: "sk-agnes",
        agnesBaseUrl: "https://apihub.agnes-ai.com/v1",
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

    render(
      <SettingsDialog
        open
        onOpenChange={onOpenChange}
        initialTab="media"
        onSaved={() => onOpenChange(false)}
      />,
    );

    const agnesHeading = await screen.findByRole("heading", { name: "Agnes" });
    const agnesSection = agnesHeading.closest(".rounded-xl");
    expect(agnesSection).not.toBeNull();
    await userEvent.click(
      within(agnesSection as HTMLElement).getByRole("button", {
        name: "Settings",
      }),
    );
    await userEvent.clear(await screen.findByLabelText("Agnes API Key"));
    await userEvent.type(screen.getByLabelText("Agnes API Key"), "sk-agnes");
    await userEvent.click(
      within(agnesSection as HTMLElement).getByRole("button", {
        name: "Save",
      }),
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("opens the generic Tutti manager for unavailable local Agent runtimes without rescanning", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    const openFeature = vi.fn().mockResolvedValue(undefined);
    (
      window as Window & {
        tuttiExternal?: {
          workspace?: {
            openFeature?: typeof openFeature;
          };
        };
      }
    ).tuttiExternal = {
      workspace: { openFeature },
    };
    fetchModelsMock.mockResolvedValue({
      models: [],
      localAgentProviders: [
        {
          provider: "codex",
          displayName: "Codex",
          supported: false,
          authState: "missing",
          reason: "Sign in with Tutti Agent Manager.",
          models: [],
        },
        {
          provider: "future-runtime",
          displayName: "Future Runtime",
          supported: false,
          authState: "missing",
          reason: "Sign in with Tutti Agent Manager.",
          models: [],
        },
      ],
    });

    render(<SettingsPage />);

    const codexButton = await screen.findByRole("button", { name: /Codex/i });
    const futureButton = screen.getByRole("button", {
      name: /Future Runtime/i,
    });

    expect(codexButton).toBeEnabled();
    expect(futureButton).toBeEnabled();
    expect(
      screen.getAllByText("Sign in with Tutti Agent Manager."),
    ).toHaveLength(2);
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();

    await userEvent.click(codexButton);

    expect(openFeature).toHaveBeenCalledWith({
      feature: "agent-manage",
    });
    expect(fetchModelsMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/Tutti agent manager opened/i),
    ).toBeInTheDocument();

    await userEvent.click(futureButton);

    expect(openFeature).toHaveBeenLastCalledWith({
      feature: "agent-manage",
    });
    expect(fetchModelsMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Rescan" }));

    await waitFor(() => expect(fetchModelsMock).toHaveBeenCalledTimes(2));
    expect(fetchModelsMock).toHaveBeenLastCalledWith({ refresh: true });
  });

  it("shows an error when the Tutti agent manager bridge is unavailable", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [],
      localAgentProviders: [
        {
          provider: "codex",
          displayName: "Codex",
          supported: false,
          authState: "missing",
          reason: "Sign in with Tutti Agent Manager.",
          models: [],
        },
      ],
    });

    render(<SettingsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Codex/i }),
    );

    expect(
      await screen.findByText(
        "Open AI Canvas inside Tutti to manage local agents.",
      ),
    ).toBeInTheDocument();
    expect(fetchModelsMock).toHaveBeenCalledTimes(1);
  });

  it("does not preselect a Local agent provider when no local model is selected", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
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
        kieApiKey: "",
        kieBaseUrl: "",
        volcesApiKey: "",
        volcesBaseUrl: "",
      },
    });
    fetchModelsMock.mockResolvedValue({
      models: [
        {
          id: "claude-code:sonnet",
          name: "Sonnet",
          provider: "claude-code",
        },
        { id: "codex:gpt-5.4", name: "Codex", provider: "codex" },
      ],
      localAgentProviders: [
        {
          provider: "claude-code",
          displayName: "Claude Code",
          supported: true,
          authState: "ok",
          models: [
            {
              id: "claude-code:sonnet",
              name: "Sonnet",
              provider: "claude-code",
            },
          ],
        },
        {
          provider: "codex",
          displayName: "Codex",
          supported: true,
          authState: "ok",
          models: [{ id: "codex:gpt-5.4", name: "Codex", provider: "codex" }],
        },
      ],
    });

    render(<SettingsPage />);

    const claudeButton = await screen.findByRole("button", {
      name: /Claude Code/i,
    });
    const codexButton = screen.getByRole("button", { name: /Codex/i });

    expect(claudeButton).toHaveAttribute("aria-pressed", "false");
    expect(codexButton).toHaveAttribute("aria-pressed", "false");
    expect(
      claudeButton.compareDocumentPosition(codexButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });
});

function installMemoryLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}
