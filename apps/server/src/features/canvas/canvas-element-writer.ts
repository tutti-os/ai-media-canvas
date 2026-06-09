export async function insertImageElement(
  _client: unknown,
  _input: {
    canvasId: string;
    height: number;
    mimeType: string;
    objectPath: string;
    title?: string;
    width: number;
  },
  _placement?: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
): Promise<{ elementId: string }> {
  throw new Error(
    "Backend canvas insertion is unavailable in the standalone build.",
  );
}

export async function insertVideoElement(
  _client: unknown,
  _input: {
    canvasId: string;
    durationSeconds?: number;
    height: number;
    mimeType: string;
    prompt: string;
    signedUrl: string;
    title?: string;
    width: number;
  },
  _placement?: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
): Promise<{ elementId: string }> {
  throw new Error(
    "Backend canvas insertion is unavailable in the standalone build.",
  );
}
