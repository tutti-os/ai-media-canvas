export function sanitizeErrorForClient(error: unknown) {
  if (error instanceof Error) {
    return error.message || "Unexpected error.";
  }

  return "Unexpected error.";
}
