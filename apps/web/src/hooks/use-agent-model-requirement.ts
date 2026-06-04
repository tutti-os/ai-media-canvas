"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchWorkspaceSettings } from "@/lib/server-api";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "@/lib/workspace-settings-events";

import { useAgentModel } from "./use-agent-model";

export const AGENT_MODEL_REQUIRED_MESSAGE =
  "请先配置或选择一个 Agent 模型。";

export function useAgentModelRequirement() {
  const { model } = useAgentModel();
  const [workspaceDefaultModel, setWorkspaceDefaultModel] = useState<
    string | null
  >(null);

  const refreshWorkspaceDefaultModel = useCallback(async () => {
    const response = await fetchWorkspaceSettings();
    const defaultModel = response.settings.defaultModel.trim();
    setWorkspaceDefaultModel(defaultModel || null);
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
      });

    return () => {
      cancelled = true;
    };
  }, [refreshWorkspaceDefaultModel]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      void refreshWorkspaceDefaultModel().catch(() => {
        setWorkspaceDefaultModel(null);
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
    workspaceDefaultModel,
    isAgentModelConfigured: Boolean(model?.trim() || workspaceDefaultModel),
    ensureAgentModelConfigured,
  };
}
