type ManagedAgentInvocationCredentialBridge = {
  agent?: {
    getManagedAgentInvocationCredential?: () => Promise<{
      credential?: string;
      connId?: string;
    }>;
  };
};

function getManagedAgentInvocationBridge() {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { tutti?: ManagedAgentInvocationCredentialBridge })
    .tutti;
}

export function hasManagedAgentInvocationCredentialBridge() {
  return (
    typeof getManagedAgentInvocationBridge()?.agent
      ?.getManagedAgentInvocationCredential === "function"
  );
}

export async function getManagedAgentInvocationCredential(): Promise<
  string | undefined
> {
  const getCredential =
    getManagedAgentInvocationBridge()?.agent
      ?.getManagedAgentInvocationCredential;
  if (typeof getCredential !== "function") {
    return undefined;
  }

  const result = await getCredential();
  const credential = result?.credential?.trim();
  return credential || undefined;
}
