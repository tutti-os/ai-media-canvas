"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchImageModels, fetchVideoModels } from "@/lib/server-api";
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from "@/lib/workspace-settings-events";

type ModelAvailability = boolean | null;

export function useMediaModelConfigurationStatus() {
  const [hasImageModels, setHasImageModels] = useState<ModelAvailability>(null);
  const [hasVideoModels, setHasVideoModels] = useState<ModelAvailability>(null);

  const refresh = useCallback(async () => {
    const [imageResult, videoResult] = await Promise.allSettled([
      fetchImageModels(),
      fetchVideoModels(),
    ]);

    setHasImageModels(
      imageResult.status === "fulfilled"
        ? imageResult.value.models.length > 0
        : null,
    );
    setHasVideoModels(
      videoResult.status === "fulfilled"
        ? videoResult.value.models.length > 0
        : null,
    );
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
