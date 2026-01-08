import { extractDb08ChunksFromDynastySave } from "./extractDynastyDb.js";
import { parseDb08TableDirectory, sliceDb08TableBytes, readU32LE } from "./db08.js";

const latin1Decoder = new TextDecoder("iso-8859-1");

function readU16LE(bytes, offset) {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) >>> 0;
}

function readBits(recordBytes, bitOffset, bitLength, bitMode) {
  let value = 0;

  if (bitMode === "lsb") {
    for (let i = 0; i < bitLength; i++) {
      const bitIndex = bitOffset + i;
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      const bit = (recordBytes[byteIndex] >> bitInByte) & 1;
      value |= bit << i;
    }
    return value >>> 0;
  }

  if (bitMode === "msb") {
    for (let i = 0; i < bitLength; i++) {
      const bitIndex = bitOffset + i;
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      const bit = (recordBytes[byteIndex] >> (7 - bitInByte)) & 1;
      value |= bit << i;
    }
    return value >>> 0;
  }

  throw new Error(`Unknown bitMode: ${bitMode}`);
}

function toSigned(value, bitLength) {
  if (bitLength <= 0 || bitLength >= 32) return value;
  const signBit = 1 << (bitLength - 1);
  return value & signBit ? value - (1 << bitLength) : value;
}

function decodeFixedString(recordBytes, byteOffset, byteLen) {
  const slice = recordBytes.subarray(byteOffset, byteOffset + byteLen);
  const s = latin1Decoder.decode(slice);
  return s.replace(/\u0000+$/g, "").trimEnd();
}

function readFloat32LE(recordBytes, byteOffset) {
  const view = new DataView(recordBytes.buffer, recordBytes.byteOffset + byteOffset, 4);
  return view.getFloat32(0, true);
}

export function parseTdbTableMeta(tableBytes) {
  const recordSizeBytes = readU32LE(tableBytes, 0x08);
  const capacity = readU16LE(tableBytes, 0x14);
  const recordCount = readU16LE(tableBytes, 0x16);
  const recordDataBytes = recordSizeBytes * capacity;
  const recordDataOffset = tableBytes.length - recordDataBytes;

  if (!recordSizeBytes || recordSizeBytes > 16384) throw new Error("Invalid recordSizeBytes");
  if (!capacity) throw new Error("Invalid capacity");
  if (recordDataOffset < 0) throw new Error("Invalid recordDataOffset");

  return { recordSizeBytes, capacity, recordCount, recordDataOffset };
}

export function decodeRecordWithLayout(recordBytes, fieldSpecsByName) {
  const out = {};
  for (const [fieldName, spec] of Object.entries(fieldSpecsByName || {})) {
    if (!spec) continue;

    if (spec.type === "string") {
      out[fieldName] = decodeFixedString(recordBytes, spec.byteOffset, spec.byteLen);
      continue;
    }

    if (spec.type === "float32") {
      out[fieldName] = readFloat32LE(recordBytes, spec.byteOffset);
      continue;
    }

    if (spec.type === "uint" || spec.type === "sint") {
      const raw = readBits(recordBytes, spec.bitOffset, spec.sizeBits, spec.bitMode);
      out[fieldName] = spec.type === "sint" ? toSigned(raw, spec.sizeBits) : raw;
      continue;
    }
  }
  return out;
}

export function decodeTableWithLayout({ tableBytes, tableLayout, maxRows }) {
  const meta = parseTdbTableMeta(tableBytes);
  const limit = maxRows != null ? Math.min(Number(maxRows) || 0, meta.recordCount) : meta.recordCount;

  const rows = [];
  for (let recNo = 0; recNo < limit; recNo++) {
    const start = meta.recordDataOffset + recNo * meta.recordSizeBytes;
    const end = start + meta.recordSizeBytes;
    if (end > tableBytes.length) break;
    // Use a view to avoid per-record copies.
    const record = tableBytes.subarray(start, end);
    const row = decodeRecordWithLayout(record, tableLayout.fields);
    row.__recNo = recNo;
    rows.push(row);
  }

  return { meta, rows };
}

export function decodeDynastySaveToTables({ saveBytes, layout, tables, maxRowsPerTable }) {
  const { db1Bytes } = extractDb08ChunksFromDynastySave(saveBytes);
  const dir = parseDb08TableDirectory(db1Bytes);

  const out = {};
  for (const tableName of tables || []) {
    const entry = dir.byName.get(tableName);
    if (!entry) throw new Error(`Missing table in DB: ${tableName}`);

    const tableBytes = sliceDb08TableBytes(db1Bytes, entry);
    const tableLayout = layout?.tables?.[tableName];
    if (!tableLayout) throw new Error(`Missing layout for table: ${tableName}`);

    out[tableName] = decodeTableWithLayout({
      tableBytes,
      tableLayout,
      maxRows: maxRowsPerTable,
    });
  }

  return out;
}
