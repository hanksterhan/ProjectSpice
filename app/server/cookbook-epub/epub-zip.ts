import { inflateRawSync } from "node:zlib";

export type EpubZipEntry = {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  data: Uint8Array;
};

export function readEpubZip(buffer: Uint8Array): Map<string, EpubZipEntry> {
  const bytes = Buffer.from(buffer);
  const centralDirectoryOffset = findCentralDirectoryOffset(bytes);
  const entries = new Map<string, EpubZipEntry>();
  let offset = centralDirectoryOffset;

  while (offset < bytes.length && bytes.readUInt32LE(offset) === 0x02014b50) {
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const path = bytes
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    if (!path.endsWith("/")) {
      const data = readLocalEntry(bytes, {
        compressionMethod,
        compressedSize,
        localHeaderOffset,
      });

      entries.set(path, {
        path,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        data,
      });
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findCentralDirectoryOffset(bytes: Buffer): number {
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      return bytes.readUInt32LE(offset + 16);
    }
  }

  throw new Error("Could not find EPUB central directory.");
}

function readLocalEntry(
  bytes: Buffer,
  {
    compressionMethod,
    compressedSize,
    localHeaderOffset,
  }: {
    compressionMethod: number;
    compressedSize: number;
    localHeaderOffset: number;
  },
): Uint8Array {
  if (bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid EPUB local file header.");
  }

  const fileNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
  const extraLength = bytes.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) {
    return compressed;
  }

  if (compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error(`Unsupported EPUB compression method ${compressionMethod}.`);
}
