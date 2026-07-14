"use client";

import type { AgentModelSource } from "@aimc/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAgentModelSourceTab,
  localAgentProvidersFromModelResponse,
} from "@/lib/agent-model-groups";
import { fetchModels, fetchWorkspaceSettings } from "@/lib/server-api";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "@/lib/workspace-settings-events";

import { useAgentModel } from "./use-agent-model";

export const AGENT_MODEL_REQUIRED_MESSAGE = "请先配置或选择一个 Agent 模型。";

async function isConfiguredModelAvailable(
  configuredModel: string,
  configuredSource: AgentModelSource | null,
  agentTargetId?: string | null,
): Promise<{ available: boolean; migratedAgentTargetId?: string }> {
  const source = configuredSource ?? getAgentModelSourceTab(configuredModel);
  if (source !== "local-agent") return { available: true };
  const provider = configuredModel.split(":")[0] ?? "";
  if (!provider) return { available: false };
  const response = await fetchModels();
  if (agentTargetId && Array.isArray(response.localAgentTargets)) {
    return {
      available: response.localAgentTargets.some(
        (entry) =>
          entry.agentTargetId === agentTargetId &&
          entry.providerId === provider &&
          entry.available,
      ),
    };
  }
  // A provider-only browser selection predates Agent Target IDs. Do not guess
  // when the provider now has multiple exposed agent identities.
  if (Array.isArray(response.localAgentTargets)) {
    const targets = response.localAgentTargets.filter(
      (entry) => entry.providerId === provider,
    );
    if (targets.length !== 1 || !targets[0]?.available) {
      return { available: false };
    }
    return {
      available: true,
      migratedAgentTargetId: targets[0].agentTargetId,
    };
  }
  return {
    available: localAgentProvidersFromModelResponse(response).some(
      (entry) => entry.provider === provider && entry.supported,
    ),
  };
}

export function useAgentModelRequirement() {
  const { agentTargetId, model, modelSource, setModel } = useAgentModel();
  const selectionRef = useRef({ agentTargetId, model, modelSource });
  selectionRef.current = { agentTargetId, model, modelSource };
  const [workspaceDefaultModel, setWorkspaceDefaultModel] = useState<
    string | null
  >(null);
  const [workspaceDefaultModelSource, setWorkspaceDefaultModelSource] =
    useState<AgentModelSource | null>(null);
  const [isAgentModelConfigurationLoaded, setIsAgentModelConfigurationLoaded] =
    useState(false);

  const refreshWorkspaceDefaultModel = useCallback(async () => {
    const response = await fetchWorkspaceSettings();
    const defaultModel = response.settings.defaultModel.trim();
    const defaultModelSource = response.settings.defaultModelSource ?? null;
    setWorkspaceDefaultModel(defaultModel || null);
    setWorkspaceDefaultModelSource(defaultModel ? defaultModelSource : null);
    return defaultModel;
  }, []);

  useEffect(() => {
    let cancelled = false;

    refreshWorkspaceDefaultModel()
      .then((defaultModel) => {
        if (cancelled) return;
        setWorkspaceDefaultModel(defaultModel || null);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceDefaultModel(null);
        if (!cancelled) setWorkspaceDefaultModelSource(null);
      })
      .finally(() => {
        if (!cancelled) setIsAgentModelConfigurationLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshWorkspaceDefaultModel]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      setIsAgentModelConfigurationLoaded(false);
      void refreshWorkspaceDefaultModel()
        .catch(() => {
          setWorkspaceDefaultModel(null);
          setWorkspaceDefaultModelSource(null);
        })
        .finally(() => {
          setIsAgentModelConfigurationLoaded(true);
        });
    };
    window.addEventListener(
      WORKSPACE_SETTINGS_UPDATED_EVENT,
      handleSettingsUpdated,
    );
    return () => {
      window.removeEventListener(
        WORKSPACE_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated,
      );
    };
  }, [refreshWorkspaceDefaultModel]);

  const ensureAgentModelConfigured = useCallback(async () => {
    if (model?.trim()) {
      const validatedSelection = {
        agentTargetId,
        model,
        modelSource,
      };
      const availability = await isConfiguredModelAvailable(
        model.trim(),
        modelSource,
        agentTargetId,
      );
      const currentSelection = selectionRef.current;
      const selectionUnchanged =
        currentSelection.agentTargetId === validatedSelection.agentTargetId &&
        currentSelection.model === validatedSelection.model &&
        currentSelection.modelSource === validatedSelection.modelSource;
      // The catalog response only validates the selection captured before the
      // request. A newer selection must be checked by its own request.
      if (!selectionUnchanged) return false;
      if (
        availability.migratedAgentTargetId &&
        !validatedSelection.agentTargetId
      ) {
        setModel(
          model.trim(),
          "local-agent",
          availability.migratedAgentTargetId,
        );
      }
      return availability.available;
    }

    try {
      const response = await fetchWorkspaceSettings();
      const defaultModel = response.settings.defaultModel.trim();
      const defaultModelSource = response.settings.defaultModelSource ?? null;
      setWorkspaceDefaultModel(defaultModel || null);
      setWorkspaceDefaultModelSource(defaultModel ? defaultModelSource : null);
      return defaultModel.length > 0
        ? (await isConfiguredModelAvailable(defaultModel, defaultModelSource))
            .available
        : false;
    } catch {
      return false;
    }
  }, [agentTargetId, model, modelSource, setModel]);

  return {
    model,
    modelSource,
    agentTargetId,
    workspaceDefaultModel,
    workspaceDefaultModelSource,
    isAgentModelConfigured: Boolean(model?.trim() || workspaceDefaultModel),
    isAgentModelConfigurationLoaded,
    ensureAgentModelConfigured,
  };
}
