// Pure JS: works in browser + Node.
// Parses the DB08 container (the extracted `.db` chunk from a dynasty/save file).

export function readU32LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

export function readAscii4(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

export function parseDb08Header(dbBytes) {
  if (!(dbBytes instanceof Uint8Array)) throw new Error("parseDb08Header expects Uint8Array");
  if (dbBytes.length < 0x18) throw new Error("DB too small");

  const magic0 = dbBytes[0];
  const magic1 = dbBytes[1];
  const magic2 = dbBytes[2];
  const magic3 = dbBytes[3];
  if (magic0 !== 0x44 || magic1 !== 0x42 || magic2 !== 0x00 || magic3 !== 0x08) {
    throw new Error("Not a DB08 file (missing DB\\0\\x08 header)");
  }

  const bigEndianFlag = dbBytes[4] === 1;
  const dbLength = readU32LE(dbBytes, 8);
  const tableCount = readU32LE(dbBytes, 0x10);
  const directoryOffset = 0x18;
  const directorySize = tableCount * 8;
  const dataStart = directoryOffset + directorySize;

  if (dataStart > dbBytes.length) {
    throw new Error("Corrupt DB08: table directory exceeds file length");
  }

  return {
    bigEndianFlag,
    dbLength,
    tableCount,
    directoryOffset,
    dataStart,
  };
}

export function parseDb08TableDirectory(dbBytes) {
  const hdr = parseDb08Header(dbBytes);

  const tables = [];
  for (let i = 0; i < hdr.tableCount; i++) {
    const entryOffset = hdr.directoryOffset + i * 8;
    const name = readAscii4(dbBytes, entryOffset);
    const rel = readU32LE(dbBytes, entryOffset + 4);
    const abs = hdr.dataStart + rel;
    tables.push({ name, rel, abs, index: i });
  }

  // Sort in file order (abs ascending) for size computations.
  const byAbs = [...tables].sort((a, b) => a.abs - b.abs);
  const withSize = byAbs.map((t, idx) => {
    const next = byAbs[idx + 1];
    const end = next ? next.abs : hdr.dbLength || dbBytes.length;
    const size = Math.max(0, end - t.abs);
    return { ...t, size };
  });

  const byName = new Map(withSize.map((t) => [t.name, t]));

  return {
    header: hdr,
    tables: withSize,
    byName,
  };
}
export function sliceDb08TableBytes(dbBytes, tableEntry) {
  if (!(dbBytes instanceof Uint8Array)) throw new Error("sliceDb08TableBytes expects Uint8Array");
  if (!tableEntry || typeof tableEntry.abs !== "number" || typeof tableEntry.size !== "number") {
    throw new Error("sliceDb08TableBytes expects a directory entry with abs and size");
  }
  const start = tableEntry.abs;
  const end = start + tableEntry.size;
  if (start < 0 || end < start || end > dbBytes.length) {
    throw new Error("Table slice is out of bounds");
  }
  // Use a view to avoid copying large table buffers.
  return dbBytes.subarray(start, end);
}
