type ManagedAgentInvocationCredentialResult =
  | {
      ok: true;
      value?: {
        credential?: string;
      };
    }
  | {
      ok: false;
      error?: unknown;
    };

type ManagedAgentInvocationCredentialBridge = {
  agent?: {
    getManagedAgentInvocationCredential?: () => Promise<ManagedAgentInvocationCredentialResult>;
  };
};

type ManagedAgentInvocationCredentialOptions = {
  pollIntervalMs?: number;
  waitForBridgeMs?: number;
};

function getManagedAgentInvocationBridge() {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { tutti?: ManagedAgentInvocationCredentialBridge })
    .tutti;
}

function getCredentialBridgeMethod() {
  const agent = getManagedAgentInvocationBridge()?.agent;
  const getCredential = agent?.getManagedAgentInvocationCredential;
  if (typeof getCredential !== "function") return undefined;
  return () => getCredential.call(agent);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForCredentialBridge(
  options: Required<ManagedAgentInvocationCredentialOptions>,
) {
  const deadline = Date.now() + options.waitForBridgeMs;
  while (Date.now() < deadline) {
    const getCredential = getCredentialBridgeMethod();
    if (typeof getCredential === "function") {
      return getCredential;
    }
    await delay(options.pollIntervalMs);
  }
  return getCredentialBridgeMethod();
}

export function hasManagedAgentInvocationCredentialBridge() {
  return typeof getCredentialBridgeMethod() === "function";
}

export function shouldWaitForManagedAgentInvocationCredentialBridge() {
  if (typeof window === "undefined") return false;
  if (getManagedAgentInvocationBridge() !== undefined) return true;
  if (typeof navigator === "undefined") return false;
  return /\b(?:Electron|Nextop)\//.test(navigator.userAgent);
}

function getStringProperty(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const property = value[key];
  return typeof property === "string" ? property : undefined;
}

function extractCredentialFromBridgeResult(result: unknown) {
  if (typeof result !== "object" || result === null) return undefined;
  const record = result as Record<string, unknown>;
  if (record.ok !== true) return undefined;

  const value = record.value;
  if (typeof value !== "object" || value === null) return undefined;
  const wrappedCredential = getStringProperty(
    value as Record<string, unknown>,
    "credential",
  )?.trim();
  return wrappedCredential || undefined;
}

export function getManagedAgentInvocationCredential(): Promise<
  string | undefined
>;
export function getManagedAgentInvocationCredential(
  options: ManagedAgentInvocationCredentialOptions,
): Promise<string | undefined>;
export async function getManagedAgentInvocationCredential(
  options: ManagedAgentInvocationCredentialOptions = {},
): Promise<string | undefined> {
  if (typeof window === "undefined") {
    return undefined;
  }
  const waitForBridgeMs = Math.max(0, options.waitForBridgeMs ?? 0);
  const pollIntervalMs = Math.max(10, options.pollIntervalMs ?? 50);
  const getCredential =
    getCredentialBridgeMethod() ??
    (waitForBridgeMs > 0
      ? await waitForCredentialBridge({ pollIntervalMs, waitForBridgeMs })
      : undefined);
  if (typeof getCredential !== "function") {
    return undefined;
  }

  const result = await getCredential();
  return extractCredentialFromBridgeResult(result);
}
