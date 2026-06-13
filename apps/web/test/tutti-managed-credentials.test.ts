// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hasNextopManagedCredentialBridge,
  openNextopManagedModelSettings,
  requestNextopManagedGrant,
} from "../src/lib/nextop-managed-credentials";
import { fetchNextopManagedConnection } from "../src/lib/server-api";

vi.mock("../src/lib/server-api", () => ({
  fetchNextopManagedConnection: vi.fn(),
}));

type HostBridge = {
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

function setHostBridge(name: "tutti" | "nextop", bridge: HostBridge) {
  const hostWindow = window as Window & {
    nextop?: HostBridge;
    tutti?: HostBridge;
  };
  hostWindow[name] = bridge;
}

describe("Tutti managed credential bridge", () => {
  afterEach(() => {
    const hostWindow = window as Window & {
      nextop?: HostBridge;
      tutti?: HostBridge;
    };
    hostWindow.tutti = undefined;
    hostWindow.nextop = undefined;
    vi.clearAllMocks();
  });

  it("uses window.tutti to request a managed credential grant", async () => {
    const requestGrant = vi.fn().mockResolvedValue({
      grantCode: "grant-code",
      providers: ["openai"],
    });
    setHostBridge("tutti", {
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
    vi.mocked(fetchNextopManagedConnection).mockResolvedValue({
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

    expect(hasNextopManagedCredentialBridge()).toBe(true);

    await expect(requestNextopManagedGrant()).resolves.toMatchObject({
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

  it("falls back to the legacy window.nextop bridge", () => {
    setHostBridge("nextop", {
      appContext: {
        get: vi.fn().mockResolvedValue({ contextToken: "context-token" }),
      },
      managedCredentials: {
        requestGrant: vi.fn(),
      },
    });

    expect(hasNextopManagedCredentialBridge()).toBe(true);
  });

  it("opens Tutti managed model settings through window.tutti", async () => {
    const openSettings = vi.fn().mockResolvedValue(undefined);
    setHostBridge("tutti", {
      workspace: { openSettings },
    });

    await openNextopManagedModelSettings("openai");

    expect(openSettings).toHaveBeenCalledWith({
      section: "apps",
      pane: "managed-models",
      provider: "openai",
    });
  });
});
