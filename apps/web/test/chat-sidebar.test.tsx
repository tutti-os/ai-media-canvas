// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatSidebar } from "../src/components/chat-sidebar";
import { ToastProvider } from "../src/components/toast";
import { INITIAL_ATTACHMENTS_KEY } from "../src/hooks/use-create-project";
import { i18n } from "../src/i18n";
import type { WebSocketHandle } from "../src/hooks/use-websocket";

const settingsDialogSpy = vi.fn();
const chatInputPlaceholder = /从一个想法开始/;

const {
  createSessionMock,
  deleteSessionMock,
  fetchMessagesMock,
  fetchRunEventsMock,
  fetchSessionsMock,
  saveMessageMock,
  updateSessionTitleMock,
  fetchImageModelsMock,
  fetchVideoModelsMock,
  fetchModelsMock,
  fetchWorkspaceSettingsMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  fetchMessagesMock: vi.fn(),
  fetchRunEventsMock: vi.fn(),
  fetchImageModelsMock: vi.fn(),
  fetchVideoModelsMock: vi.fn(),
  fetchModelsMock: vi.fn(),
  fetchWorkspaceSettingsMock: vi.fn(),
  fetchSessionsMock: vi.fn(),
  saveMessageMock: vi.fn(),
  updateSessionTitleMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  createSession: createSessionMock,
  deleteSession: deleteSessionMock,
  fetchImageModels: fetchImageModelsMock,
  fetchVideoModels: fetchVideoModelsMock,
  fetchModels: fetchModelsMock,
  fetchRunEvents: fetchRunEventsMock,
  fetchWorkspaceSettings: fetchWorkspaceSettingsMock,
  fetchMessages: fetchMessagesMock,
  fetchSessions: fetchSessionsMock,
  saveMessage: saveMessageMock,
  updateSessionTitle: updateSessionTitleMock,
}));

vi.mock("../src/components/settings-dialog", () => ({
  SettingsDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    settingsDialogSpy({ open, onOpenChange });
    return open ? <div>Mock Settings Dialog</div> : null;
  },
}));

function createMockWs(): WebSocketHandle {
  return {
    connected: true,
    startRun: vi.fn((payload, onAck) => {
      // Simulate server ack
      onAck?.({
        type: "command.ack",
        action: "agent.run",
        payload: {
          runId: "run_123",
          assistantMessageId: "assistant-server-id",
        },
      });
    }),
    cancelRun: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    registerRPC: vi.fn(() => () => {}),
    resumeCanvas: vi.fn((_canvasId, _sessionId, onAck) => {
      onAck?.({
        type: "command.ack",
        action: "canvas.resume",
        payload: {
          canvasId: "canvas-1",
          latestSeq: 0,
          activeRunId: null,
          replayed: 0,
        },
      });
    }),
  };
}

function createMockLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) =>
      values.set(key, String(value)),
    ),
  };
}

describe("ChatSidebar", () => {
  let mockWs: WebSocketHandle;

  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMockLocalStorage(),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    mockWs = createMockWs();
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({
      session: {
        id: "session-created",
        title: "New Chat",
        updatedAt: "2026-03-24T00:00:00.000Z",
      },
    });
    deleteSessionMock.mockReset();
    fetchImageModelsMock.mockReset();
    fetchImageModelsMock.mockResolvedValue({
      models: [
        {
          id: "local:placeholder-image",
          displayName: "Local Placeholder Image",
        },
      ],
    });
    fetchVideoModelsMock.mockReset();
    fetchVideoModelsMock.mockResolvedValue({
      models: [
        {
          id: "agnes-video",
          displayName: "Agnes Video",
        },
      ],
    });
    fetchModelsMock.mockReset();
    fetchModelsMock.mockResolvedValue({
      models: [
        { id: "local:assistant", name: "Local Assistant", provider: "local" },
      ],
    });
    fetchRunEventsMock.mockReset();
    fetchRunEventsMock.mockResolvedValue({
      done: true,
      events: [],
      nextCursor: 0,
    });
    fetchWorkspaceSettingsMock.mockReset();
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "local:assistant",
        agnesApiKey: "sk-local-agnes",
        replicateApiToken: "",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        openAIApiKey: "",
        volcesApiKey: "",
      },
    });
    fetchMessagesMock.mockReset();
    fetchMessagesMock.mockResolvedValue({ messages: [] });
    fetchSessionsMock.mockReset();
    fetchSessionsMock.mockResolvedValue({
      sessions: [
        {
          id: "session-real",
          title: "Existing Chat",
          updatedAt: "2026-03-24T00:00:00.000Z",
        },
      ],
    });
    saveMessageMock.mockReset();
    saveMessageMock.mockResolvedValue(undefined);
    updateSessionTitleMock.mockReset();
    updateSessionTitleMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    settingsDialogSpy.mockClear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("starts runs via WebSocket with the active real session id", async () => {
    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const input = await screen.findByPlaceholderText(chatInputPlaceholder);
    await userEvent.type(input, "hello loom{Enter}");

    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-real",
          conversationId: "canvas-1",
          prompt: "hello loom",
          canvasId: "canvas-1",
        }),
        expect.any(Function),
      ),
    );
    expect(mockWs.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeKind: expect.any(String),
      }),
      expect.anything(),
    );
    expect(mockWs.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-canvas-1",
      }),
      expect.anything(),
    );
  });

  it("auto-starts image-only initial runs from stored home attachments", async () => {
    const attachments = [
      {
        assetId: "asset-upload-1",
        url: "https://example.com/ref.png",
        mimeType: "image/png",
        source: "upload" as const,
        name: "ref.png",
      },
    ];
    sessionStorage.setItem(
      INITIAL_ATTACHMENTS_KEY,
      JSON.stringify(attachments),
    );

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-real",
          conversationId: "canvas-1",
          prompt: "",
          canvasId: "canvas-1",
          attachments,
        }),
        expect.any(Function),
      ),
    );
    await waitFor(() =>
      expect(updateSessionTitleMock).toHaveBeenCalledWith(
        "session-real",
        "ref.png",
      ),
    );
    expect(sessionStorage.getItem(INITIAL_ATTACHMENTS_KEY)).toBeNull();
  });

  it("waits for the user message to persist before starting the run", async () => {
    let resolveSave: (() => void) | undefined;
    saveMessageMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const input = await screen.findByPlaceholderText(chatInputPlaceholder);
    await userEvent.type(input, "preserve order{Enter}");

    await waitFor(() => expect(saveMessageMock).toHaveBeenCalledTimes(1));
    expect(mockWs.startRun).not.toHaveBeenCalled();

    resolveSave?.();

    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-real",
          prompt: "preserve order",
        }),
        expect.any(Function),
      ),
    );
  });

  it("passes selected local CLI models without forcing the server runtime", async () => {
    localStorage.setItem("aimc:agent-model", "claude:sonnet");

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const input = await screen.findByPlaceholderText(chatInputPlaceholder);
    await userEvent.type(input, "use claude{Enter}");

    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude:sonnet",
          prompt: "use claude",
        }),
        expect.any(Function),
      ),
    );
    expect(mockWs.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeKind: "server-deepagent",
      }),
      expect.anything(),
    );
    expect(mockWs.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeProvider: expect.any(String),
      }),
      expect.anything(),
    );
  });

  it("opens agent settings instead of starting a run when no agent model is configured", async () => {
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
        agnesApiKey: "sk-local-agnes",
        replicateApiToken: "",
        googleApiKey: "",
        googleVertexProject: "",
        googleVertexLocation: "",
        openAIApiKey: "",
        volcesApiKey: "",
      },
    });

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const input = await screen.findByPlaceholderText(chatInputPlaceholder);
    await userEvent.type(input, "hello without model{Enter}");

    await waitFor(() => expect(mockWs.startRun).not.toHaveBeenCalled());
    expect(await screen.findByText("Mock Settings Dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("请先配置或选择一个 Agent 模型。"),
    ).not.toBeInTheDocument();
  });

  it("ignores a rapid duplicate Enter press while a send is already starting", async () => {
    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const input = await screen.findByPlaceholderText(chatInputPlaceholder);
    await userEvent.type(input, "double send");

    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
    });

    await waitFor(() => expect(mockWs.startRun).toHaveBeenCalledTimes(1));
    expect(saveMessageMock).toHaveBeenCalledTimes(1);
  });

  it("allows a new session to send while another session is still running", async () => {
    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const input = await screen.findByPlaceholderText(chatInputPlaceholder);
    await userEvent.type(input, "first run{Enter}");

    await waitFor(() => expect(mockWs.startRun).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole("button", { name: "新建对话" }),
    );
    await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));

    const nextInput = await screen.findByPlaceholderText(chatInputPlaceholder);
    await waitFor(() => expect(nextInput).not.toBeDisabled());
    await userEvent.type(nextInput, "second run{Enter}");

    await waitFor(() => expect(mockWs.startRun).toHaveBeenCalledTimes(2));
    expect(mockWs.startRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: "session-created",
        prompt: "second run",
      }),
      expect.any(Function),
    );
  });

  it("does not attach selected canvas images when sending a local template", async () => {
    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
          selectedCanvasElements={[
            {
              id: "canvas-image-1",
              type: "image",
              x: 0,
              y: 0,
              width: 320,
              height: 240,
              fileId: "file-1",
              storageUrl: "https://example.test/brand.png",
            },
          ]}
        />
      </ToastProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "分镜故事板" }));

    await waitFor(() => expect(mockWs.startRun).toHaveBeenCalledTimes(1));
    expect(mockWs.startRun).toHaveBeenCalledWith(
      expect.not.objectContaining({
        attachments: expect.any(Array),
      }),
      expect.any(Function),
    );
  });

  it("opens the settings dialog from the chat header action", async () => {
    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    const settingsButton = await screen.findByRole("button", {
      name: "打开设置",
    });
    await userEvent.click(settingsButton);

    expect(await screen.findByText("Mock Settings Dialog")).toBeInTheDocument();
    expect(settingsDialogSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true }),
    );
  });

  it("replays durable run events on reconnect to recover missed media insertions", async () => {
    const imageGeneratedSpy = vi.fn();
    let replayListener:
      | ((entry: {
          event: Record<string, unknown>;
          replayed?: boolean;
          eventId?: string;
          seq?: number;
        }) => void)
      | null = null;
    fetchRunEventsMock.mockResolvedValue({
      done: true,
      nextCursor: 8,
      events: [
        {
          eventId: "run-reconnect:7",
          seq: 7,
          event: {
            type: "message.delta",
            runId: "run-reconnect",
            messageId: "assistant-reconnect",
            delta: "Recovered transcript",
            timestamp: "2026-06-04T00:00:00.000Z",
          },
        },
        {
          eventId: "run-reconnect:8",
          seq: 8,
          event: {
            type: "tool.completed",
            runId: "run-reconnect",
            toolCallId: "tool-1",
            toolName: "generate_image",
            artifacts: [
              {
                type: "image",
                title: "Recovered image",
                url: "https://example.com/recovered.png",
                mimeType: "image/png",
                width: 1024,
                height: 1024,
              },
            ],
            timestamp: "2026-06-04T00:00:00.000Z",
          },
        },
      ],
    });
    mockWs = {
      ...mockWs,
      onEvent: vi.fn((listener) => {
        replayListener = listener as typeof replayListener;
        return () => {
          replayListener = null;
        };
      }),
      resumeCanvas: vi.fn((_canvasId, _sessionId, onAck) => {
        onAck?.({
          type: "command.ack",
          action: "canvas.resume",
          payload: {
            canvasId: "canvas-1",
            latestSeq: 0,
            activeRunId: "run-reconnect",
            assistantMessageId: "assistant-reconnect",
            replayed: 0,
          },
        });
      }),
    };

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          onImageGenerated={imageGeneratedSpy}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    await waitFor(() => expect(mockWs.resumeCanvas).toHaveBeenCalled());
    await waitFor(() =>
      expect(fetchRunEventsMock).toHaveBeenCalledWith("run-reconnect", 0),
    );
    expect(await screen.findByText("Recovered transcript")).toBeInTheDocument();
    await waitFor(() => expect(imageGeneratedSpy).toHaveBeenCalledTimes(1));
    replayListener?.({
      replayed: true,
      eventId: "run-reconnect:8",
      seq: 99,
      event: {
        type: "tool.completed",
        runId: "run-reconnect",
        toolCallId: "tool-1",
        toolName: "generate_image",
        artifacts: [
          {
            type: "image",
            title: "Recovered image",
            url: "https://example.com/recovered.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
        timestamp: "2026-06-04T00:00:00.000Z",
      },
    });
    await waitFor(() => expect(imageGeneratedSpy).toHaveBeenCalledTimes(1));
    expect(imageGeneratedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image",
        url: "https://example.com/recovered.png",
      }),
    );
  });

  it("recovers persisted media artifacts from the latest assistant snapshot after reconnect", async () => {
    const imageGeneratedSpy = vi.fn();
    fetchMessagesMock.mockResolvedValue({
      messages: [
        {
          id: "assistant-saved",
          role: "assistant",
          content: "",
          createdAt: "2026-03-24T00:00:00.000Z",
          toolActivities: null,
          contentBlocks: [
            {
              type: "tool",
              toolCallId: "tool-saved",
              toolName: "generate_image",
              status: "completed",
              artifacts: [
                {
                  type: "image",
                  title: "Recovered from snapshot",
                  url: "https://example.com/from-snapshot.png",
                  mimeType: "image/png",
                  width: 1024,
                  height: 1024,
                },
              ],
            },
          ],
        },
      ],
    });

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          onImageGenerated={imageGeneratedSpy}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    await waitFor(() => expect(mockWs.resumeCanvas).toHaveBeenCalled());
    await waitFor(() => expect(imageGeneratedSpy).toHaveBeenCalledTimes(1));
    expect(imageGeneratedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image",
        url: "https://example.com/from-snapshot.png",
      }),
    );
  });

  it("does not reinsert persisted media when backend already inserted the canvas element", async () => {
    const imageGeneratedSpy = vi.fn();
    fetchMessagesMock.mockResolvedValue({
      messages: [
        {
          id: "assistant-saved",
          role: "assistant",
          content: "",
          createdAt: "2026-03-24T00:00:00.000Z",
          toolActivities: null,
          contentBlocks: [
            {
              type: "tool",
              toolCallId: "tool-backend-inserted",
              toolName: "generate_image",
              status: "completed",
              output: {
                elementId: "canvas-element-1",
                imageUrl: "https://example.com/backend-inserted.png",
              },
              artifacts: [
                {
                  type: "image",
                  title: "Backend inserted",
                  url: "https://example.com/backend-inserted.png",
                  mimeType: "image/png",
                  width: 1024,
                  height: 1024,
                },
              ],
            },
          ],
        },
      ],
    });

    render(
      <ToastProvider>
        <ChatSidebar
          accessToken="token_abc"
          canvasId="canvas-1"
          open
          onToggle={() => {}}
          onImageGenerated={imageGeneratedSpy}
          ws={mockWs}
        />
      </ToastProvider>,
    );

    await waitFor(() => expect(mockWs.resumeCanvas).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Backend inserted")).toBeInTheDocument(),
    );
    expect(imageGeneratedSpy).not.toHaveBeenCalled();
  });
});
