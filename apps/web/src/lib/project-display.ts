export const DEFAULT_PROJECT_NAME = "Untitled";

export function isDefaultProjectName(name: string | null | undefined) {
  return (
    (name ?? "").trim().toLowerCase() === DEFAULT_PROJECT_NAME.toLowerCase()
  );
}

export function formatProjectName(
  name: string | null | undefined,
  untitled: string,
) {
  return isDefaultProjectName(name) ? untitled : (name ?? untitled);
}
