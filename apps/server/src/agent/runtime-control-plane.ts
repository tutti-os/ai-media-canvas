import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { RuntimeKind, StreamEvent } from "@aimc/shared";

export type RuntimeProvider<TContext> = {
  kind: RuntimeKind;
  streamRun(context: TContext): AsyncGenerator<StreamEvent>;
};

export type RuntimeKindSelectorInput = {
  availableRuntimeKinds: RuntimeKind[];
  model: BaseLanguageModel | string | undefined;
  requestedRuntimeKind: RuntimeKind | undefined;
};

export type RuntimeKindSelector = (
  input: RuntimeKindSelectorInput,
) => RuntimeKind;

export function inferRuntimeKind(input: RuntimeKindSelectorInput): RuntimeKind {
  if (input.requestedRuntimeKind) {
    return input.requestedRuntimeKind;
  }

  if (input.availableRuntimeKinds.length === 1) {
    return input.availableRuntimeKinds[0]!;
  }

  throw new Error(
    "No runtime kind requested and no selector configured for multiple runtime providers",
  );
}

export function createRuntimeControlPlane<TContext>(
  providers: RuntimeProvider<TContext>[],
  options?: {
    selectRuntimeKind?: RuntimeKindSelector;
  },
) {
  const providerMap = new Map<RuntimeKind, RuntimeProvider<TContext>>(
    providers.map((provider) => [provider.kind, provider]),
  );

  return {
    listRuntimeKinds(): RuntimeKind[] {
      return [...providerMap.keys()];
    },

    resolveRuntimeKind(input: {
      model: BaseLanguageModel | string | undefined;
      requestedRuntimeKind: RuntimeKind | undefined;
    }): RuntimeKind {
      if (
        input.requestedRuntimeKind &&
        !providerMap.has(input.requestedRuntimeKind)
      ) {
        throw new Error(
          `No runtime provider registered for ${input.requestedRuntimeKind}`,
        );
      }

      const selectRuntimeKind = options?.selectRuntimeKind ?? inferRuntimeKind;
      const kind = selectRuntimeKind({
        availableRuntimeKinds: [...providerMap.keys()],
        model: input.model,
        requestedRuntimeKind: input.requestedRuntimeKind,
      });
      if (!providerMap.has(kind)) {
        throw new Error(`No runtime provider registered for ${kind}`);
      }
      return kind;
    },

    streamRun(kind: RuntimeKind, context: TContext): AsyncGenerator<StreamEvent> {
      const provider = providerMap.get(kind);
      if (!provider) {
        throw new Error(`No runtime provider registered for ${kind}`);
      }
      return provider.streamRun(context);
    },
  };
}
