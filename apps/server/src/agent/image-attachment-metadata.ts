export type ImageAttachmentMetadata = {
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
};

function getImageOrientation(
  width: number,
  height: number,
): ImageAttachmentMetadata["orientation"] {
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

function readPngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff && buffer[offset + 1] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset + 1];
    if (marker === undefined) return null;
    if (marker === 0xd9 || marker === 0xda) return null;

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return null;
    }

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readImageDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  return readPngDimensions(buffer) ?? readJpegDimensions(buffer);
}

export function buildImageAttachmentMetadata(
  buffer: Buffer,
): ImageAttachmentMetadata | null {
  const dimensions = readImageDimensions(buffer);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }
  return {
    ...dimensions,
    orientation: getImageOrientation(dimensions.width, dimensions.height),
  };
}
