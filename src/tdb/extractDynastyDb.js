// Pure JS: works in browser + Node.
// Extracts DB08 chunks from a raw dynasty/save file by scanning for the DB\0\x08 header.

import { readU32LE } from "./db08.js";

function isDb08At(bytes, offset) {
  return (
    bytes[offset] === 0x44 && // D
    bytes[offset + 1] === 0x42 && // B
    bytes[offset + 2] === 0x00 &&
    bytes[offset + 3] === 0x08
  );
}

export function findFirstDb08Offset(saveBytes, startOffset = 0) {
  if (!(saveBytes instanceof Uint8Array)) throw new Error("findFirstDb08Offset expects Uint8Array");
  const start = Math.max(0, Number(startOffset) || 0);
  for (let i = start; i <= saveBytes.length - 4; i++) {
    if (isDb08At(saveBytes, i)) return i;
  }
  return -1;
}

export function extractDb08ChunksFromDynastySave(saveBytes) {
  if (!(saveBytes instanceof Uint8Array)) throw new Error("extractDb08ChunksFromDynastySave expects Uint8Array");

  const db1Offset = findFirstDb08Offset(saveBytes, 0);
  if (db1Offset < 0) throw new Error("No DB08 header found in save file");
  if (db1Offset + 0x0c > saveBytes.length) throw new Error("Truncated DB08 header");

  const db1Length = readU32LE(saveBytes, db1Offset + 8);
  if (!db1Length) throw new Error("DB08 length is zero");

  const db1End = db1Offset + db1Length;
  // Use views to avoid copying the DB chunks (they can be large).
  const db1Bytes =
    db1End <= saveBytes.length ? saveBytes.subarray(db1Offset, db1End) : saveBytes.subarray(db1Offset);

  // Optional DB2 immediately follows DB1 in some saves.
  let db2Bytes = null;
  const db2Offset = db1End;
  if (db2Offset + 4 <= saveBytes.length && isDb08At(saveBytes, db2Offset)) {
    const db2Length = readU32LE(saveBytes, db2Offset + 8);
    const db2End = db2Offset + (db2Length || 0);
    db2Bytes =
      db2Length && db2End <= saveBytes.length ? saveBytes.subarray(db2Offset, db2End) : saveBytes.subarray(db2Offset);
  }

  return {
    db1Bytes,
    db1Offset,
    db1Length,
    db2Bytes,
    db2Offset: db2Bytes ? db2Offset : null,
  };
}
