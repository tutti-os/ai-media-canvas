export function isExcalidrawContextMenuTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Node)) return false;
  return Boolean(
    document.querySelector(".excalidraw .context-menu")?.contains(target),
  );
}

export function isExcalidrawCanvasTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  return Boolean(element?.closest(".excalidraw"));
}
