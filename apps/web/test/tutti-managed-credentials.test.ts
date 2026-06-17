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
  agent?: {
    getManagedAgentInvocationCredential?: ReturnType<typeof vi.fn>;
  };
  appContext?: {
    get?: () => Promise<{
      appId?: string;
      contextToken?: string;
      installationId?: string;
      workspaceId?: string;
    }>;
  };
  managedCredentials?: {
    requestGrant?: ReturnType<typeof vi.fn>;
  };
  workspace?: {
    openSettings?: ReturnType<typeof vi.fn>;
  };
};

function setHostBridge(bridge: HostBridge) {
  const hostWindow = window as Window & {
    tutti?: HostBridge;
  };
  hostWindow.tutti = bridge;
}

describe("Tutti managed credential bridge", () => {
  afterEach(() => {
    const hostWindow = window as Window & {
      tutti?: HostBridge;
    };
    hostWindow.tutti = undefined;
    vi.clearAllMocks();
  });

  it("uses window.tutti to request a managed credential grant", async () => {
    const requestGrant = vi.fn().mockResolvedValue({
      grantCode: "grant-code",
      providers: ["openai"],
    });
    setHostBridge({
      appContext: {
        get: vi.fn().mockResolvedValue({
          appId: "app-1",
          contextToken: "context-token",
          installationId: "install-1",
          workspaceId: "workspace-1",
        }),
      },
      managedCredentials: { requestGrant },
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
      contextToken: "context-token",
      grantCode: "grant-code",
      nonce: "nonce-1",
      state: "state-1",
    });
    expect(requestGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "app-1",
        contextToken: "context-token",
        installationId: "install-1",
        workspaceId: "workspace-1",
      }),
    );
  });

  it("uses only the managed agent invocation credential from the bridge", async () => {
    const getManagedAgentInvocationCredentialMock = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        connId: "ignored-conn",
        credential: " run-credential-1 ",
      },
    });
    setHostBridge({
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

  it("opens Tutti managed model settings through window.tutti", async () => {
    const openSettings = vi.fn().mockResolvedValue(undefined);
    setHostBridge({
      workspace: { openSettings },
    });

    await openTuttiManagedModelSettings("openai");

    expect(openSettings).toHaveBeenCalledWith({
      section: "apps",
      pane: "managed-models",
      provider: "openai",
    });
  });
});
