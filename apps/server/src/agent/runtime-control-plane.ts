import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { RuntimeKind, StreamEvent } from "@aimc/shared";

export type RuntimeProvider<TContext> = {
  kind: RuntimeKind;
  streamRun(context: TContext): AsyncGenerator<StreamEvent>;
};

export function inferRuntimeKind(input: {
  availableRuntimeKinds: RuntimeKind[];
  model: BaseLanguageModel | string | undefined;
  requestedRuntimeKind: RuntimeKind | undefined;
}): RuntimeKind {
  if (input.requestedRuntimeKind) {
    return input.requestedRuntimeKind;
  }

  if (
    typeof input.model === "string" &&
    input.model.startsWith("codex:") &&
    input.availableRuntimeKinds.includes("local-codex")
  ) {
    return "local-codex";
  }

  return "server-deepagent";
}

export function createRuntimeControlPlane<TContext>(
  providers: RuntimeProvider<TContext>[],
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

      const kind = inferRuntimeKind({
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
