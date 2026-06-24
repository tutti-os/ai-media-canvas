// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTuttiManagedConnection } from "../src/lib/server-api";
import {
  getManagedAgentInvocationCredential,
  hasManagedAgentInvocationCredentialBridge,
  hasTuttiManagedCredentialBridge,
  openTuttiManagedModelSettings,
  requestTuttiManagedGrant,
} from "../src/lib/tutti-managed-credentials";

vi.mock("../src/lib/server-api", () => ({
  fetchTuttiManagedConnection: vi.fn(),
}));

type HostBridge = {
  app?: {
    getContext?: () => Promise<{
      appId?: string;
      contextToken?: string;
      installationId?: string;
      workspaceId?: string;
    }>;
  };
  permissions?: {
    request?: ReturnType<typeof vi.fn>;
  };
  settings?: {
    open?: ReturnType<typeof vi.fn>;
  };
};

type AgentBridge = {
  agent?: {
    getManagedAgentInvocationCredential?: () => Promise<unknown>;
  };
};

function setHostBridge(bridge: HostBridge) {
  const hostWindow = window as Window & {
    tuttiExternal?: HostBridge;
  };
  hostWindow.tuttiExternal = bridge;
}

function setAgentBridge(bridge: AgentBridge) {
  const hostWindow = window as Window & {
    tutti?: AgentBridge;
  };
  hostWindow.tutti = bridge;
}

describe("Tutti managed credential bridge", () => {
  afterEach(() => {
    const hostWindow = window as Window & {
      tutti?: AgentBridge;
      tuttiExternal?: HostBridge;
    };
    hostWindow.tutti = undefined;
    hostWindow.tuttiExternal = undefined;
    vi.clearAllMocks();
  });

  it("uses window.tuttiExternal to request a managed credential grant", async () => {
    const requestPermission = vi.fn().mockResolvedValue({
      code: "grant-code",
      contextToken: "grant-context-token",
      providers: ["openai"],
    });
    setHostBridge({
      app: {
        getContext: vi.fn().mockResolvedValue({
          appId: "app-1",
          contextToken: "context-token",
          installationId: "install-1",
          workspaceId: "workspace-1",
        }),
      },
      permissions: { request: requestPermission },
    });
    vi.mocked(fetchTuttiManagedConnection).mockResolvedValue({
      connection: {
        connected: false,
        providers: [],
        models: [],
      },
      connectChallenge: {
        nonce: "nonce-1",
        state: "state-1",
      },
    });

    expect(hasTuttiManagedCredentialBridge()).toBe(true);

    await expect(requestTuttiManagedGrant()).resolves.toMatchObject({
      contextToken: "grant-context-token",
      grantCode: "grant-code",
      nonce: "nonce-1",
      state: "state-1",
    });
    expect(requestPermission).toHaveBeenCalledWith({
      nonce: "nonce-1",
      permission: "managed-ai-models",
      providers: ["agnes", "openai", "anthropic"],
      scopes: ["managed_models.models.read", "managed_models.credentials.use"],
      state: "state-1",
    });
  });

  it("uses only the managed agent invocation credential from the bridge", async () => {
    const getManagedAgentInvocationCredentialMock = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        connId: "ignored-conn",
        credential: " run-credential-1 ",
      },
    });
    setAgentBridge({
      agent: {
        getManagedAgentInvocationCredential:
          getManagedAgentInvocationCredentialMock,
      },
    });

    expect(hasManagedAgentInvocationCredentialBridge()).toBe(true);
    await expect(getManagedAgentInvocationCredential()).resolves.toBe(
      "run-credential-1",
    );
    expect(getManagedAgentInvocationCredentialMock).toHaveBeenCalledTimes(1);
  });

  it("binds the managed agent invocation bridge method to the agent object", async () => {
    setAgentBridge({
      agent: {
        async getManagedAgentInvocationCredential() {
          return {
            ok: true,
            value: {
              credential: (this as { credential: string }).credential,
            },
          };
        },
        credential: "bound-run-credential",
      } as {
        credential: string;
        getManagedAgentInvocationCredential: () => Promise<unknown>;
      },
    });

    await expect(getManagedAgentInvocationCredential()).resolves.toBe(
      "bound-run-credential",
    );
  });

  it("falls back to app context token when the host grant response omits one", async () => {
    const requestPermission = vi.fn().mockResolvedValue({
      code: "grant-code",
      providers: ["openai"],
    });
    setHostBridge({
      app: {
        getContext: vi.fn().mockResolvedValue({
          appId: "app-1",
          contextToken: "context-token",
          installationId: "install-1",
          workspaceId: "workspace-1",
        }),
      },
      permissions: { request: requestPermission },
    });
    vi.mocked(fetchTuttiManagedConnection).mockResolvedValue({
      connection: {
        connected: false,
        providers: [],
        models: [],
      },
      connectChallenge: {
        nonce: "nonce-1",
        state: "state-1",
      },
    });

    await expect(requestTuttiManagedGrant()).resolves.toMatchObject({
      contextToken: "context-token",
      grantCode: "grant-code",
    });
  });

  it("opens Tutti managed model settings through window.tuttiExternal", async () => {
    const openSettings = vi.fn().mockResolvedValue(undefined);
    setHostBridge({
      settings: { open: openSettings },
    });

    await openTuttiManagedModelSettings("openai");

    expect(openSettings).toHaveBeenCalledWith({
      tab: "models",
      provider: "openai",
    });
  });
});
