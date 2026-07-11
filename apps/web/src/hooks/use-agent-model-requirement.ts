"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentModelSource } from "@aimc/shared";

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
) {
  const source = configuredSource ?? getAgentModelSourceTab(configuredModel);
  if (source !== "local-agent") return true;
  const provider = configuredModel.split(":")[0] ?? "";
  if (!provider) return false;
  const response = await fetchModels();
  return localAgentProvidersFromModelResponse(response).some(
    (entry) => entry.provider === provider && entry.available,
  );
}

export function useAgentModelRequirement() {
  const { model, modelSource } = useAgentModel();
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
      return isConfiguredModelAvailable(model.trim(), modelSource);
    }

    try {
      const response = await fetchWorkspaceSettings();
      const defaultModel = response.settings.defaultModel.trim();
      const defaultModelSource = response.settings.defaultModelSource ?? null;
      setWorkspaceDefaultModel(defaultModel || null);
      setWorkspaceDefaultModelSource(defaultModel ? defaultModelSource : null);
      return defaultModel.length > 0
        ? isConfiguredModelAvailable(
            defaultModel,
            defaultModelSource,
          )
        : false;
    } catch {
      return false;
    }
  }, [model, modelSource]);

  return {
    model,
    modelSource,
    workspaceDefaultModel,
    workspaceDefaultModelSource,
    isAgentModelConfigured: Boolean(model?.trim() || workspaceDefaultModel),
    isAgentModelConfigurationLoaded,
    ensureAgentModelConfigured,
  };
}
