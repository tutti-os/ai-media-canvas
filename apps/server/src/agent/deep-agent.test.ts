import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  chatAnthropicMock,
  chatGoogleMock,
  chatOpenAIMock,
  chatVertexMock,
  createAgentBackendMock,
  createDeepAgentMock,
  createMainAgentToolsMock,
} = vi.hoisted(() => ({
  chatAnthropicMock: vi.fn((options) => ({
    provider: "anthropic",
    options,
  })),
  chatGoogleMock: vi.fn((options) => ({
    provider: "google",
    options,
  })),
  chatOpenAIMock: vi.fn((options) => ({
    provider: "openai",
    options,
  })),
  chatVertexMock: vi.fn((options) => ({
    provider: "vertex",
    options,
  })),
  createAgentBackendMock: vi.fn(() => ({ factory: { kind: "backend" } })),
  createDeepAgentMock: vi.fn(() => ({
    stream: vi.fn(),
    streamEvents: vi.fn(),
  })),
  createMainAgentToolsMock: vi.fn(() => []),
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: chatAnthropicMock,
}));

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: chatGoogleMock,
}));

vi.mock("@langchain/google-vertexai", () => ({
  ChatVertexAI: chatVertexMock,
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: chatOpenAIMock,
}));

vi.mock("deepagents", () => ({
  createDeepAgent: createDeepAgentMock,
}));

vi.mock("./backends/index.js", () => ({
  createAgentBackend: createAgentBackendMock,
}));

vi.mock("./tools/index.js", () => ({
  createMainAgentTools: createMainAgentToolsMock,
}));

import { createAimcDeepAgent } from "./deep-agent.js";

describe("createAimcDeepAgent", () => {
  beforeEach(() => {
    chatAnthropicMock.mockClear();
    chatGoogleMock.mockClear();
    chatOpenAIMock.mockClear();
    chatVertexMock.mockClear();
    createAgentBackendMock.mockClear();
    createDeepAgentMock.mockClear();
    createMainAgentToolsMock.mockClear();
  });

  it("uses ChatAnthropic for anthropic-scoped default models", () => {
    createAimcDeepAgent({
      canvasId: "canvas-1",
      env: {
        agentBackendMode: "state",
        agentModel: "anthropic:claude-sonnet-4-5",
        anthropicApiKey: "anthropic-test-key",
        anthropicBaseUrl: "https://anthropic.example",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    expect(chatAnthropicMock).toHaveBeenCalledWith({
      anthropicApiKey: "anthropic-test-key",
      clientOptions: {
        baseURL: "https://anthropic.example",
      },
      model: "claude-sonnet-4-5",
      streaming: true,
    });
    expect(chatOpenAIMock).not.toHaveBeenCalled();
    expect(createDeepAgentMock).toHaveBeenCalledOnce();
  });

  it("teaches the agent that normal canvas tools cannot delete and prefer single-shot image editing for reference-image cover requests", () => {
    createAimcDeepAgent({
      canvasId: "canvas-1",
      env: {
        agentBackendMode: "state",
        agentModel: "openai:gpt-4.1",
        openAIApiKey: "openai-test-key",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
    });

    const config = createDeepAgentMock.mock.calls.at(-1)?.[0];
    expect(config?.systemPrompt).toContain(
      "Normal canvas tools do not provide deletion.",
    );
    expect(config?.systemPrompt).toContain(
      "Do not automatically add titles, descriptions, buttons, decorative shapes, or dividers after image generation.",
    );
    expect(config?.systemPrompt).toContain(
      "inspect_canvas must read real element coordinates and sizes first",
    );
    expect(config?.systemPrompt).toContain(
      "must not intersect visible elements that are not being moved",
    );
    expect(config?.systemPrompt).toContain(
      "Stop condition for image-generation tasks",
    );
    expect(config?.systemPrompt).toContain("prefer a single generate_image call");
  });

  it("tells the agent to follow the latest user message language when clear", () => {
    createAimcDeepAgent({
      canvasId: "canvas-1",
      env: {
        agentBackendMode: "state",
        agentModel: "openai:gpt-4.1",
        openAIApiKey: "openai-test-key",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      locale: "en",
    });

    const config = createDeepAgentMock.mock.calls.at(-1)?.[0];
    expect(config?.systemPrompt).toContain(
      "reply in the primary language of the latest user message when it is clear",
    );
    expect(config?.systemPrompt).toContain(
      "If the latest user message is mixed or ambiguous, reply in English.",
    );
  });

  it("passes the LangGraph store through to deepagents", () => {
    const store = { kind: "test-store" };

    createAimcDeepAgent({
      canvasId: "canvas-1",
      env: {
        agentBackendMode: "state",
        agentModel: "openai:gpt-4.1",
        openAIApiKey: "openai-test-key",
        port: 3001,
        version: "0.0.0",
        webOrigin: "http://localhost:3000",
      },
      store: store as never,
    });

    expect(createDeepAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        store,
      }),
    );
  });
});
