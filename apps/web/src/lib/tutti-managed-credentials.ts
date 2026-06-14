import type {
  TuttiManagedGrantCreateRequest,
  TuttiManagedModel,
  TuttiManagedProviderId,
} from "@aimc/shared";

import { fetchTuttiManagedConnection } from "./server-api";

type TuttiManagedGrantResult = {
  grantCode: string;
  expiresAt?: string;
  providers?: TuttiManagedProviderId[];
  models?: TuttiManagedModel[];
};

type TuttiAppContext = {
  appId?: string;
  contextToken?: string;
  installationId?: string;
  workspaceId?: string;
};

type TuttiBridge = {
  appContext?: {
    get?: () => Promise<TuttiAppContext>;
  };
  managedCredentials?: {
    requestGrant?: (input: {
      appId?: string;
      contextToken: string;
      installationId?: string;
      nonce: string;
      providers: TuttiManagedProviderId[];
      scopes: string[];
      state: string;
      workspaceId?: string;
    }) => Promise<TuttiManagedGrantResult>;
  };
  workspace?: {
    openSettings?: (input: {
      section: "apps";
      pane: "managed-models";
      provider?: TuttiManagedProviderId;
    }) => Promise<void>;
  };
};

declare global {
  interface Window {
    tutti?: TuttiBridge;
  }
}

function getManagedCredentialBridge() {
  if (typeof window === "undefined") return undefined;
  return window.tutti;
}

export function hasTuttiManagedCredentialBridge() {
  const bridge = getManagedCredentialBridge();
  return (
    typeof bridge?.appContext?.get === "function" &&
    typeof bridge?.managedCredentials?.requestGrant === "function"
  );
}

export async function requestTuttiManagedGrant(): Promise<TuttiManagedGrantCreateRequest> {
  const bridge = getManagedCredentialBridge();
  const requestGrant = bridge?.managedCredentials?.requestGrant;
  if (typeof requestGrant !== "function") {
    throw new Error("Tutti Managed bridge is unavailable.");
  }
  const context = await bridge?.appContext?.get?.();
  if (!context?.contextToken) {
    throw new Error("Tutti app context is unavailable.");
  }
  const connection = await fetchTuttiManagedConnection();
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

export async function openTuttiManagedModelSettings(
  provider?: TuttiManagedProviderId,
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
