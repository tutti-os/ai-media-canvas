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

import type { WebSocketHandle } from "../src/hooks/use-websocket";
import { ChatSidebar } from "../src/components/chat-sidebar";
import { ToastProvider } from "../src/components/toast";

const settingsDialogSpy = vi.fn();

const {
  createSessionMock,
  deleteSessionMock,
  fetchMessagesMock,
  fetchSessionsMock,
  saveMessageMock,
  updateSessionTitleMock,
  fetchImageModelsMock,
  fetchModelsMock,
  fetchWorkspaceSettingsMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  fetchMessagesMock: vi.fn(),
  fetchImageModelsMock: vi.fn(),
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
  fetchModels: fetchModelsMock,
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
    resumeCanvas: vi.fn((_canvasId, onAck) => {
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

describe("ChatSidebar", () => {
  let mockWs: WebSocketHandle;

  beforeEach(() => {
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
      models: [{ id: "local:placeholder-image", displayName: "Local Placeholder Image" }],
    });
    fetchModelsMock.mockReset();
    fetchModelsMock.mockResolvedValue({
      models: [{ id: "local:assistant", name: "Local Assistant", provider: "local" }],
    });
    fetchWorkspaceSettingsMock.mockReset();
    fetchWorkspaceSettingsMock.mockResolvedValue({
      settings: {
        defaultModel: "",
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

    const input = await screen.findByPlaceholderText(
      /start with an idea/i,
    );
    await userEvent.type(input, "hello loom{Enter}");

    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-real",
          conversationId: "canvas-1",
          prompt: "hello loom",
          canvasId: "canvas-1",
          runtimeKind: "server-deepagent",
        }),
        expect.any(Function),
      ),
    );
    expect(mockWs.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-canvas-1",
      }),
      expect.anything(),
    );
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

    const input = await screen.findByPlaceholderText(/start with an idea/i);
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
      name: /open settings/i,
    });
    await userEvent.click(settingsButton);

    expect(await screen.findByText("Mock Settings Dialog")).toBeInTheDocument();
    expect(settingsDialogSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true }),
    );
  });
});
