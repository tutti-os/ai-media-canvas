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
    expect(config?.systemPrompt).toContain("常规画布工具不提供删除能力");
    expect(config?.systemPrompt).toContain(
      "不要在生成图片后自动添加标题、说明、按钮、装饰形状或分隔线",
    );
    expect(config?.systemPrompt).toContain(
      "必须先 inspect_canvas 读取真实元素坐标和尺寸",
    );
    expect(config?.systemPrompt).toContain(
      "不得与未参与本次移动的可见元素相交",
    );
    expect(config?.systemPrompt).toContain("生图任务的停止条件");
    expect(config?.systemPrompt).toContain("优先单次调用 generate_image");
  });
});
