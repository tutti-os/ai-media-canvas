"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentModelSource } from "@aimc/shared";

import { fetchWorkspaceSettings } from "@/lib/server-api";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "@/lib/workspace-settings-events";

import { useAgentModel } from "./use-agent-model";

export const AGENT_MODEL_REQUIRED_MESSAGE = "请先配置或选择一个 Agent 模型。";

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
    if (model?.trim()) return true;

    try {
      const defaultModel = await refreshWorkspaceDefaultModel();
      return defaultModel.length > 0;
    } catch {
      return Boolean(workspaceDefaultModel?.trim());
    }
  }, [model, refreshWorkspaceDefaultModel, workspaceDefaultModel]);

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
