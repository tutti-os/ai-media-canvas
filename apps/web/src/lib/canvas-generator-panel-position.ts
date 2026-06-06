export function calculateCenteredGeneratorPanelPosition(input: {
  elementBounds: { x: number; y: number; width: number; height: number };
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  panelWidth: number;
  verticalOffset?: number;
}) {
  const { elementBounds, canvasScrollZoom, panelWidth } = input;
  const { scrollX, scrollY, zoom } = canvasScrollZoom;
  const elementLeft = (elementBounds.x + scrollX) * zoom;
  const elementWidth = elementBounds.width * zoom;
  const left = elementLeft + (elementWidth - panelWidth) / 2;
  const top =
    (elementBounds.y + elementBounds.height + scrollY) * zoom +
    (input.verticalOffset ?? 8);

  return { left, top };
}
