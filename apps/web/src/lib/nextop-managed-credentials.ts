import type {
  NextopManagedGrantCreateRequest,
  NextopManagedModel,
  NextopManagedProviderId,
} from "@aimc/shared";

type NextopManagedGrantResult = {
  grantCode: string;
  grantRef: string;
  expiresAt?: string;
  providers?: NextopManagedProviderId[];
  models?: NextopManagedModel[];
};

type NextopBridge = {
  managedCredentials?: {
    requestGrant?: (input: {
      providers: NextopManagedProviderId[];
      scopes: string[];
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
  }
}

export function hasNextopManagedCredentialBridge() {
  return typeof window !== "undefined" &&
    typeof window.nextop?.managedCredentials?.requestGrant === "function";
}

export async function requestNextopManagedGrant(): Promise<NextopManagedGrantCreateRequest> {
  const requestGrant = window.nextop?.managedCredentials?.requestGrant;
  if (typeof requestGrant !== "function") {
    throw new Error("Nextop Managed bridge is unavailable.");
  }

  const result = await requestGrant({
    providers: ["agnes", "openai", "anthropic"],
    scopes: ["models:read", "credentials:exchange"],
  });

  return {
    grantCode: result.grantCode,
    grantRef: result.grantRef,
    ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
    ...(result.providers ? { providers: result.providers } : {}),
    ...(result.models ? { models: result.models } : {}),
  };
}

export async function openNextopManagedModelSettings(
  provider?: NextopManagedProviderId,
) {
  const openSettings = window.nextop?.workspace?.openSettings;
  if (typeof openSettings !== "function") {
    throw new Error("Nextop settings bridge is unavailable.");
  }
  await openSettings({
    section: "apps",
    pane: "managed-models",
    ...(provider ? { provider } : {}),
  });
}
