const FIT_ALL_VIEWPORT_ZOOM_FACTOR = 0.92;

type CanvasViewportApi = {
  scrollToContent?: (
    target?: unknown,
    opts?: {
      animate?: boolean;
      fitToViewport?: boolean;
      viewportZoomFactor?: number;
    },
  ) => void;
};

export function fitAllCanvasElements(api: CanvasViewportApi | null | undefined) {
  api?.scrollToContent?.(undefined, {
    animate: true,
    fitToViewport: true,
    viewportZoomFactor: FIT_ALL_VIEWPORT_ZOOM_FACTOR,
  });
}
