import { isImageGeneratorElement } from "./canvas-image-generator";
import { withNormalizedCanvasElementIndices } from "./canvas-normalize";
import { isVideoGeneratorElement } from "./canvas-video-generator";

const CANCELED_STROKE = "#FCA5A5";
const CANCELED_BACKGROUND = "#FDECEE";

type CancelableGenerationElement = Record<string, unknown> & {
  backgroundColor?: string;
  customData?: Record<string, unknown>;
  id?: string;
  isDeleted?: boolean;
  strokeColor?: string;
  updated?: number;
  version?: number;
  versionNonce?: number;
};

type CanvasGenerationCancelApi = {
  getSceneElements: () => readonly CancelableGenerationElement[];
  updateScene: (scene: {
    captureUpdate?: string;
    elements: CancelableGenerationElement[];
  }) => void;
};

function nextVersionNonce(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

export function cancelGeneratingCanvasElementsForRun(
  api: CanvasGenerationCancelApi | null,
  runId: string,
  errorMessage: string,
): number {
  if (!api || !runId) return 0;

  let changed = 0;
  const elements = api.getSceneElements().map((element) => {
    const runIdValue = element.customData?.runId;
    const status = element.customData?.status;
    if (
      element.isDeleted ||
      status !== "generating" ||
      runIdValue !== runId ||
      (!isImageGeneratorElement(element) && !isVideoGeneratorElement(element))
    ) {
      return element;
    }
    changed++;
    return {
      ...element,
      strokeColor: CANCELED_STROKE,
      backgroundColor: CANCELED_BACKGROUND,
      customData: {
        ...element.customData,
        status: "error",
        errorMessage,
      },
      version: (element.version ?? 1) + 1,
      versionNonce: nextVersionNonce(),
      updated: Date.now(),
    };
  });

  if (changed > 0) {
    api.updateScene({
      elements: withNormalizedCanvasElementIndices(elements),
      captureUpdate: "IMMEDIATELY",
    });
  }

  return changed;
}
