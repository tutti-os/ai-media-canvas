export async function loadGeneratedAsset(
  url: string,
  fallbackMimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    const encoded = match?.[2];
    if (!match || !encoded) {
      throw new Error("Invalid generated asset data URI.");
    }
    return {
      buffer: Buffer.from(encoded, "base64"),
      mimeType: match[1] || fallbackMimeType,
    };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download generated asset: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get("content-type") ?? fallbackMimeType,
  };
}
