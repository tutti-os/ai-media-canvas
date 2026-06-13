import type {
  NextopManagedGrantCreateRequest,
  NextopManagedModel,
  NextopManagedProviderId,
} from "@aimc/shared";

import { fetchNextopManagedConnection } from "./server-api";

type NextopManagedGrantResult = {
  grantCode: string;
  expiresAt?: string;
  providers?: NextopManagedProviderId[];
  models?: NextopManagedModel[];
};

type NextopAppContext = {
  appId?: string;
  contextToken?: string;
  installationId?: string;
  workspaceId?: string;
};

type NextopBridge = {
  appContext?: {
    get?: () => Promise<NextopAppContext>;
  };
  managedCredentials?: {
    requestGrant?: (input: {
      appId?: string;
      contextToken: string;
      installationId?: string;
      nonce: string;
      providers: NextopManagedProviderId[];
      scopes: string[];
      state: string;
      workspaceId?: string;
    }) => Promise<NextopManagedGrantResult>;
  };
  workspace?: {
    openSettings?: (input: {
      section: "apps";
      pane: "managed-models";
      provider?: NextopManagedProviderId;
    }) => Promise<void>;
  };
};

declare global {
  interface Window {
    nextop?: NextopBridge;
    tutti?: NextopBridge;
  }
}

function getManagedCredentialBridge() {
  if (typeof window === "undefined") return undefined;
  return window.tutti ?? window.nextop;
}

export function hasNextopManagedCredentialBridge() {
  const bridge = getManagedCredentialBridge();
  return (
    typeof bridge?.appContext?.get === "function" &&
    typeof bridge?.managedCredentials?.requestGrant === "function"
  );
}

export async function requestNextopManagedGrant(): Promise<NextopManagedGrantCreateRequest> {
  const bridge = getManagedCredentialBridge();
  const requestGrant = bridge?.managedCredentials?.requestGrant;
  if (typeof requestGrant !== "function") {
    throw new Error("Tutti Managed bridge is unavailable.");
  }
  const context = await bridge?.appContext?.get?.();
  if (!context?.contextToken) {
    throw new Error("Tutti app context is unavailable.");
  }
  const connection = await fetchNextopManagedConnection();
  if (!connection.connectChallenge) {
    throw new Error("Tutti Managed connect challenge is unavailable.");
  }
  const { nonce, state } = connection.connectChallenge;

  const result = await requestGrant({
    ...(context.appId ? { appId: context.appId } : {}),
    contextToken: context.contextToken,
    ...(context.installationId
      ? { installationId: context.installationId }
      : {}),
    nonce,
    providers: ["agnes", "openai", "anthropic"],
    scopes: ["managed_models.models.read", "managed_models.credentials.use"],
    state,
    ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
  });

  return {
    contextToken: context.contextToken,
    grantCode: result.grantCode,
    nonce,
    state,
    ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
    ...(result.providers ? { providers: result.providers } : {}),
    ...(result.models ? { models: result.models } : {}),
  };
}

export async function openNextopManagedModelSettings(
  provider?: NextopManagedProviderId,
) {
  const openSettings = getManagedCredentialBridge()?.workspace?.openSettings;
  if (typeof openSettings !== "function") {
    throw new Error("Tutti settings bridge is unavailable.");
  }
  await openSettings({
    section: "apps",
    pane: "managed-models",
    ...(provider ? { provider } : {}),
  });
}
