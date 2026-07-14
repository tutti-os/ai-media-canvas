// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTuttiManagedConnection } from "../src/lib/server-api";
import {
  hasTuttiAgentManagerBridge,
  hasTuttiManagedCredentialBridge,
  openTuttiAgentManager,
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
  workspace?: {
    openFeature?: ReturnType<typeof vi.fn>;
  };
};

function setHostBridge(bridge: HostBridge) {
  const hostWindow = window as Window & {
    tuttiExternal?: HostBridge;
  };
  hostWindow.tuttiExternal = bridge;
}

describe("Tutti managed credential bridge", () => {
  afterEach(() => {
    const hostWindow = window as Window & {
      tuttiExternal?: HostBridge;
    };
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

  it("opens the provider-neutral Tutti agent manager", async () => {
    const openFeature = vi.fn().mockResolvedValue(undefined);
    setHostBridge({
      workspace: { openFeature },
    });

    expect(hasTuttiAgentManagerBridge()).toBe(true);

    await openTuttiAgentManager();

    expect(openFeature).toHaveBeenCalledWith({
      feature: "agent-manage",
    });
  });

  it("rejects when the Tutti agent manager bridge is unavailable", async () => {
    setHostBridge({});

    expect(hasTuttiAgentManagerBridge()).toBe(false);

    await expect(openTuttiAgentManager()).rejects.toThrow(
      "Tutti agent manager bridge is unavailable.",
    );
  });
});
