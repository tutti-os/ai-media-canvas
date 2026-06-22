import { GenerationError } from "../../generation/utils.js";

export type MediaCapabilityKind = "image_generation" | "video_generation";

export type MediaCapabilityRequired = {
  kind: "media_provider_configuration_required";
  capability: MediaCapabilityKind;
  titleKey: string;
  descriptionKey: string;
  action: {
    type: "open_settings";
    tab: "media";
    labelKey: string;
  };
};

export function isUnavailableMediaGenerationError(error: unknown) {
  return (
    error instanceof GenerationError &&
    (error.code === "model_not_found" || error.code === "provider_not_found")
  );
}

export function buildMediaCapabilityRequired(
  capability: MediaCapabilityKind,
): MediaCapabilityRequired {
  const isVideo = capability === "video_generation";
  return {
    kind: "media_provider_configuration_required",
    capability,
    titleKey: isVideo
      ? "capabilityRequired.videoTitle"
      : "capabilityRequired.imageTitle",
    descriptionKey: isVideo
      ? "capabilityRequired.videoDescription"
      : "capabilityRequired.imageDescription",
    action: {
      type: "open_settings",
      tab: "media",
      labelKey: "capabilityRequired.configureMedia",
    },
  };
}
