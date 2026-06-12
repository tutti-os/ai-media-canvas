export function isExcalidrawContextMenuTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Node)) return false;
  return Boolean(
    document.querySelector(".excalidraw .context-menu")?.contains(target),
  );
}
