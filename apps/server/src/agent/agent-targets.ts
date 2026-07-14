import type {
  AgentRuntimeProvider,
  LocalAgentTargetInfo,
  ModelInfo,
} from "@aimc/shared";
import {
  type DetectContext,
  type LocalAgentRuntime,
  createDefaultLocalAgentRuntime,
} from "@tutti-os/agent-acp-kit";
import {
  type TuttiAgentCatalog,
  loadTuttiAgentCatalog,
} from "@tutti-os/agent-acp-kit/tutti";

import { buildLocalAgentModels } from "./local-agent-models.js";

type AgentCatalogRuntime = LocalAgentRuntime<
  "local-agent",
  AgentRuntimeProvider
>;

const defaultRuntime = createDefaultLocalAgentRuntime() as AgentCatalogRuntime;

export type ResolvedAgentTarget = {
  agentTargetId: string;
  providerId: AgentRuntimeProvider;
};

export function isCatalogProviderAddressable(
  catalog: Pick<TuttiAgentCatalog, "agents" | "cliContract">,
  providerId: string,
): boolean {
  if (catalog.cliContract === "agent-id") return true;
  return (
    catalog.agents.filter((agent) => agent.providerId === providerId).length ===
    1
  );
}

export async function loadAgentTargetCatalog(
  input: {
    detectContext?: DetectContext;
    detections?: Awaited<ReturnType<AgentCatalogRuntime["detect"]>>;
    refresh?: boolean;
    runtime?: AgentCatalogRuntime;
  } = {},
): Promise<{
  ambiguousProviderIds: string[];
  catalog: TuttiAgentCatalog;
  defaultAgentTargetId: string | null;
  targets: LocalAgentTargetInfo[];
}> {
  const detectContext = {
    ...(input.detectContext ?? {}),
    ...(input.refresh ? { refresh: true } : {}),
  };
  const selectedRuntime = input.runtime ?? defaultRuntime;
  const catalogRuntime: AgentCatalogRuntime = input.detections
    ? {
        cancel: (runId) => selectedRuntime.cancel(runId),
        detect: async () => input.detections ?? [],
        listProviders: () => selectedRuntime.listProviders(),
        run: (runInput) => selectedRuntime.run(runInput),
      }
    : selectedRuntime;
  const [catalog, detections] = await Promise.all([
    loadTuttiAgentCatalog({
      runtime: catalogRuntime,
      detectContext,
      ...(detectContext.cwd ? { cwd: detectContext.cwd } : {}),
    }),
    input.detections
      ? Promise.resolve(input.detections)
      : selectedRuntime.detect(detectContext),
  ]);
  const detectionsByProvider = new Map(
    detections.map((entry) => [String(entry.provider), entry]),
  );
  const modelsByProvider = new Map<string, ModelInfo[]>();
  for (const model of buildLocalAgentModels(detections)) {
    const values = modelsByProvider.get(model.provider) ?? [];
    values.push(model);
    modelsByProvider.set(model.provider, values);
  }
  const targets = catalog.agents.map((agent) => {
    const detection = detectionsByProvider.get(agent.providerId);
    const providerAddressable = isCatalogProviderAddressable(
      catalog,
      agent.providerId,
    );
    const available =
      agent.availability.status === "available" &&
      agent.runtimeSupported &&
      detection?.supported === true &&
      providerAddressable;
    return {
      agentTargetId: agent.agentTargetId,
      providerId: agent.providerId,
      displayName: agent.displayName,
      available,
      runtimeSupported: agent.runtimeSupported,
      isDefault: agent.agentTargetId === catalog.defaultAgentTargetId,
      ...(agent.availability.detail || detection?.reason || !providerAddressable
        ? {
            reason:
              agent.availability.detail ||
              detection?.reason ||
              `Provider ${agent.providerId} maps to multiple Agent Targets and cannot be selected by this Tutti daemon.`,
          }
        : {}),
      models: modelsByProvider.get(agent.providerId) ?? [],
    } satisfies LocalAgentTargetInfo;
  });
  const preferred = targets.find(
    (target) =>
      target.agentTargetId === catalog.defaultAgentTargetId && target.available,
  );
  return {
    ambiguousProviderIds:
      catalog.cliContract === "provider-compat"
        ? [
            ...new Set(
              catalog.agents
                .filter(
                  (agent) =>
                    !isCatalogProviderAddressable(catalog, agent.providerId),
                )
                .map((agent) => agent.providerId),
            ),
          ]
        : [],
    catalog,
    defaultAgentTargetId:
      preferred?.agentTargetId ??
      targets.find((target) => target.available)?.agentTargetId ??
      null,
    targets,
  };
}

export async function resolveAgentTarget(input: {
  agentTargetId?: string;
  /** @deprecated Compatibility input. */
  providerId?: string;
  detectContext?: DetectContext;
}): Promise<ResolvedAgentTarget> {
  const { defaultAgentTargetId, targets } = await loadAgentTargetCatalog({
    ...(input.detectContext ? { detectContext: input.detectContext } : {}),
  });
  return resolveAgentTargetFromCatalog(targets, defaultAgentTargetId, input);
}

export function resolveAgentTargetFromCatalog(
  targets: LocalAgentTargetInfo[],
  defaultAgentTargetId: string | null,
  input: { agentTargetId?: string; providerId?: string },
): ResolvedAgentTarget {
  const exactId = input.agentTargetId?.trim();
  const legacyProvider = input.providerId?.trim();
  if (exactId && legacyProvider) {
    throw new Error(
      "Provide agentTargetId or deprecated runtimeProvider, not both.",
    );
  }
  let target = exactId
    ? targets.find((entry) => entry.agentTargetId === exactId)
    : undefined;
  if (!target && !exactId && legacyProvider) {
    const matches = targets.filter(
      (entry) => entry.providerId === legacyProvider,
    );
    if (matches.length !== 1) {
      throw new Error(
        matches.length > 1
          ? `Multiple agents use provider ${legacyProvider}; select an exact agentTargetId.`
          : `No agent target uses provider ${legacyProvider}.`,
      );
    }
    target = matches[0];
  }
  if (!target && !exactId && !legacyProvider && defaultAgentTargetId) {
    target = targets.find(
      (entry) => entry.agentTargetId === defaultAgentTargetId,
    );
  }
  if (!target) {
    throw new Error(
      exactId
        ? `Agent target is not exposed by Tutti: ${exactId}`
        : "No local agent target is available.",
    );
  }
  if (!target.available) {
    throw new Error(
      target.reason || `Agent target ${target.agentTargetId} is unavailable.`,
    );
  }
  return {
    agentTargetId: target.agentTargetId,
    providerId: target.providerId,
  };
}
