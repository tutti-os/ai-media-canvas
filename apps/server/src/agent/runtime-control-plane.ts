import type {
  AgentRuntimeProvider,
  RuntimeKind,
  StreamEvent,
} from "@aimc/shared";
import type {
  AgentRuntimeCapabilities,
  AgentRuntimeMode,
  AgentRuntimeRecord as PackageAgentRuntimeRecord,
  AgentRuntimeStatus,
  RuntimeKindSelector as PackageRuntimeKindSelector,
  RuntimeKindSelectorInput as PackageRuntimeKindSelectorInput,
  RuntimeLease as PackageRuntimeLease,
  RuntimeProvider as PackageRuntimeProvider,
  RuntimeTarget as PackageRuntimeTarget,
} from "@aimc/local-agent-runtime";
import {
  createRuntimeControlPlane as createPackageRuntimeControlPlane,
  inferRuntimeKind as inferPackageRuntimeKind,
} from "@aimc/local-agent-runtime/runtime-control-plane";

export type {
  AgentRuntimeCapabilities,
  AgentRuntimeMode,
  AgentRuntimeStatus,
};

export type AgentRuntimeRecord = PackageAgentRuntimeRecord<
  RuntimeKind,
  AgentRuntimeProvider
>;
export type RuntimeKindSelector = PackageRuntimeKindSelector<
  RuntimeKind,
  AgentRuntimeProvider
>;
export type RuntimeKindSelectorInput = PackageRuntimeKindSelectorInput<
  RuntimeKind,
  AgentRuntimeProvider
>;
export type RuntimeLease = PackageRuntimeLease<
  RuntimeKind,
  AgentRuntimeProvider
>;
export type RuntimeProvider<TContext> = PackageRuntimeProvider<
  TContext,
  StreamEvent,
  RuntimeKind,
  AgentRuntimeProvider
>;
export type RuntimeTarget = PackageRuntimeTarget<
  RuntimeKind,
  AgentRuntimeProvider
>;

export function createRuntimeControlPlane<TContext>(
  providers: RuntimeProvider<TContext>[],
  options?: {
    now?: () => string;
    selectRuntimeKind?: RuntimeKindSelector;
  },
) {
  return createPackageRuntimeControlPlane<
    TContext,
    StreamEvent,
    RuntimeKind,
    AgentRuntimeProvider
  >(providers, options);
}

export function inferRuntimeKind(
  input: RuntimeKindSelectorInput,
): RuntimeTarget {
  return inferPackageRuntimeKind<RuntimeKind, AgentRuntimeProvider>(input);
}
