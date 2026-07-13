import { createHash } from "node:crypto";

export type ModelDiscoveryFlightInput = {
  workspaceId: string;
  refresh: boolean;
  credential?: string;
};

export type ModelDiscoverySingleFlight = {
  run<T>(
    input: ModelDiscoveryFlightInput,
    operation: () => Promise<T>,
  ): Promise<T>;
};

export function createModelDiscoverySingleFlight(): ModelDiscoverySingleFlight {
  const flights = new Map<string, Promise<unknown>>();
  return {
    run<T>(input: ModelDiscoveryFlightInput, operation: () => Promise<T>) {
      const key = modelDiscoveryFlightKey(input);
      const existing = flights.get(key) as Promise<T> | undefined;
      if (existing) return existing;
      const pending = Promise.resolve().then(operation);
      flights.set(key, pending);
      void pending
        .finally(() => {
          if (flights.get(key) === pending) flights.delete(key);
        })
        .catch(() => {});
      return pending;
    },
  };
}

function modelDiscoveryFlightKey(input: ModelDiscoveryFlightInput) {
  const credentialFingerprint = createHash("sha256")
    .update(input.credential ?? "")
    .digest("hex");
  return `${input.workspaceId}\u0000${input.refresh ? "refresh" : "normal"}\u0000${credentialFingerprint}`;
}
