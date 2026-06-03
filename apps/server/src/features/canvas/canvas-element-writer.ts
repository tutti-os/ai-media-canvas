export async function insertImageElement(): Promise<never> {
  throw new Error(
    "Backend canvas insertion is unavailable in the standalone build.",
  );
}

export async function insertVideoElement(): Promise<never> {
  throw new Error(
    "Backend canvas insertion is unavailable in the standalone build.",
  );
}
