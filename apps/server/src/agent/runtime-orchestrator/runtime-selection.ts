import type { RuntimeKindSelectorInput, RuntimeTarget } from "../runtime-control-plane.js";

export function inferAimcRuntimeTarget(
  input: RuntimeKindSelectorInput,
): RuntimeTarget {
  if (input.requestedRuntimeKind) {
    if (input.requestedRuntimeKind === "local-agent" && !input.requestedRuntimeProvider) {
      const localTargets = input.availableRuntimeTargets.filter(
        (target) => target.kind === "local-agent" && target.provider,
      );
      if (localTargets.length === 1) {
        return localTargets[0]!;
      }
    }
    return {
      kind: input.requestedRuntimeKind,
      ...(input.requestedRuntimeProvider
        ? { provider: input.requestedRuntimeProvider }
        : {}),
    };
  }

  const serverRuntime = input.availableRuntimeTargets.find(
    (target) => target.kind === "server-deepagent",
  );
  if (serverRuntime) {
    return serverRuntime;
  }

  return input.availableRuntimeTargets[0]!;
}
