"use client";

import { useCallback, useEffect, useState } from "react";

import {
  hasConfiguredImageProvider,
  hasConfiguredVideoProvider,
} from "@/lib/media-provider-configuration";
import { fetchWorkspaceSettings } from "@/lib/server-api";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "@/lib/workspace-settings-events";

type ModelAvailability = boolean | null;

export function useMediaModelConfigurationStatus() {
  const [hasImageModels, setHasImageModels] = useState<ModelAvailability>(null);
  const [hasVideoModels, setHasVideoModels] = useState<ModelAvailability>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchWorkspaceSettings();
      setHasImageModels(hasConfiguredImageProvider(response.settings));
      setHasVideoModels(hasConfiguredVideoProvider(response.settings));
    } catch {
      setHasImageModels(null);
      setHasVideoModels(null);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleSettingsUpdated = () => {
      void refresh();
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
  }, [refresh]);

  return {
    hasImageModels,
    hasVideoModels,
    missingImageModel: hasImageModels === false,
    missingVideoModel: hasVideoModels === false,
  };
}
