import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const DB_HEADER = Buffer.from([0x44, 0x42, 0x00, 0x08]); // "DB\0\x08"

function findDbHeaderOffset(buf) {
  for (let i = 0; i <= buf.length - DB_HEADER.length; i++) {
    if (
      buf[i] === DB_HEADER[0] &&
      buf[i + 1] === DB_HEADER[1] &&
      buf[i + 2] === DB_HEADER[2] &&
      buf[i + 3] === DB_HEADER[3]
    ) {
      return i;
    }
  }
  return -1;
}

function readInt32LESafe(buf, offset) {
  if (offset < 0 || offset + 4 > buf.length) return null;
  return buf.readInt32LE(offset);
}

function hasDbHeaderAt(buf, offset) {
  if (offset < 0 || offset + 4 > buf.length) return false;
  return (
    buf[offset] === DB_HEADER[0] &&
    buf[offset + 1] === DB_HEADER[1] &&
    buf[offset + 2] === DB_HEADER[2] &&
    buf[offset + 3] === DB_HEADER[3]
  );
}

export function extractDynastyDatabasesFromBuffer(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error("Expected a Buffer.");
  const offset = findDbHeaderOffset(buf);
  if (offset < 0) throw new Error("No DB header (DB\\0\\x08) found in file.");

  // db-editor sets BigEndian if byte at offset+4 is 1
  const bigEndian = buf[offset + 4] === 1;

  // db-editor reads int32 from bytes offset+8..offset+11 (little-endian)
  const dbLength = readInt32LESafe(buf, offset + 8);

  const binPrefix = buf.subarray(0, offset);

  // Prefer length-bounded db1 if it looks sane; otherwise fall back to rest-of-file.
  let db1End = buf.length;
  if (Number.isFinite(dbLength) && dbLength > 0 && offset + dbLength <= buf.length) {
    db1End = offset + dbLength;
  }
  const db1 = buf.subarray(offset, db1End);

  let db2 = null;
  if (Number.isFinite(dbLength) && dbLength > 0) {
    const db2Offset = offset + dbLength;
    if (hasDbHeaderAt(buf, db2Offset)) {
      // db-editor treats DB2 as "the rest of the file" from the 2nd DB header.
      db2 = buf.subarray(db2Offset);
    }
  }

  return {
    bigEndian,
    dbLength: Number.isFinite(dbLength) ? dbLength : null,
    dbOffset: offset,
    binPrefixBytes: binPrefix.length,
    hasDb2: Boolean(db2),
    db1,
    db2,
  };
}

export function extractDynastyDatabasesToTempFiles(inputFilePath) {
  const abs = path.resolve(String(inputFilePath ?? ""));
  if (!abs) throw new Error("Missing input file path.");
  const buf = fs.readFileSync(abs);
  const extracted = extractDynastyDatabasesFromBuffer(buf);

  const root = path.join(os.tmpdir(), "dynasty-tracker-import");
  fs.mkdirSync(root, { recursive: true });
  const runDir = path.join(root, crypto.randomUUID());
  fs.mkdirSync(runDir, { recursive: true });

  const db1Path = path.join(runDir, "db1.db");
  fs.writeFileSync(db1Path, extracted.db1);

  let db2Path = null;
  if (extracted.db2) {
    db2Path = path.join(runDir, "db2.db");
    fs.writeFileSync(db2Path, extracted.db2);
  }

  return {
    inputFilePath: abs,
    runDir,
    bigEndian: extracted.bigEndian,
    dbLength: extracted.dbLength,
    dbOffset: extracted.dbOffset,
    binPrefixBytes: extracted.binPrefixBytes,
    hasDb2: extracted.hasDb2,
    db1Path,
    db2Path,
  };
}
