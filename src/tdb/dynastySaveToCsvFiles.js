import { decodeNameFromPlayRow, tableDumpToCsv } from "../tdbCsvBridge.js";
import { decodeDynastySaveToTables } from "./decodeWithLayout.js";
import { extractDb08ChunksFromDynastySave } from "./extractDynastyDb.js";
import { parseDb08TableDirectory, sliceDb08TableBytes, readU32LE } from "./db08.js";

const REQUIRED_TABLES = [
  "TEAM",
  "SCHD",
  "TSSE",
  "BOWL",
  "COCH",
  "PRLU",
  "PLAY",
  "PSOF",
  "PSDE",
  "PSKI",
  "PSKP",
  "PSOL",
  "AAPL",
  "OSPA",
];

function stripInternalKeys(row) {
  if (row && typeof row === "object") {
    // Avoid per-row object copies; these rows are ephemeral and only used to emit CSV.
    delete row.__recNo;
  }
  return row;
}

function readU16LE(bytes, offset) {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) >>> 0;
}

function parseTdbTableMeta(tableBytes) {
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

function inferPrluMappingFromTableBytes(prluTableBytes) {
  const meta = parseTdbTableMeta(prluTableBytes);
  const totalRows = meta.recordCount;
  if (!totalRows) throw new Error("PRLU has no rows");

  const rows = [];
  for (let recNo = 0; recNo < totalRows; recNo++) {
    const start = meta.recordDataOffset + recNo * meta.recordSizeBytes;
    const end = start + meta.recordSizeBytes;
    if (end > prluTableBytes.length) break;
    rows.push(prluTableBytes.subarray(start, end));
  }
  if (!rows.length) throw new Error("PRLU record data missing");

  const sampleRows = rows.slice(0, 60);
  if (sampleRows.length < 60) throw new Error(`PRLU expected at least 60 rows, found ${sampleRows.length}`);

  const totalBits = meta.recordSizeBytes * 8;
  const luvlLens = [6, 7, 8];
  const lurtLens = [7, 8];
  const bitModes = ["lsb", "msb"];

  const luvlCandidates = [];

  for (const bitMode of bitModes) {
    for (const bitLength of luvlLens) {
      for (let bitOffset = 0; bitOffset + bitLength <= totalBits; bitOffset++) {
        const seen = new Set();
        let ok = true;
        for (const r of sampleRows) {
          const v = readBits(r, bitOffset, bitLength, bitMode);
          if (v > 59) {
            ok = false;
            break;
          }
          seen.add(v);
        }
        if (!ok) continue;
        if (seen.size !== 60) continue;
        for (let i = 0; i < 60; i++) {
          if (!seen.has(i)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        luvlCandidates.push({ bitOffset, bitLength, bitMode });
      }
    }
  }

  if (!luvlCandidates.length) throw new Error("Unable to locate PRLU.LUVL field in dynasty save");

  let best = null;

  for (const luvlSpec of luvlCandidates) {
    const luvls = sampleRows.map((r) => readBits(r, luvlSpec.bitOffset, luvlSpec.bitLength, luvlSpec.bitMode));

    for (const bitMode of bitModes) {
      for (const bitLength of lurtLens) {
        for (let bitOffset = 0; bitOffset + bitLength <= totalBits; bitOffset++) {
          const byLuvl = Array.from({ length: 60 }, () => null);
          let inRange = 0;
          let ok = true;

          for (let i = 0; i < sampleRows.length; i++) {
            const luvl = luvls[i];
            const lurt = readBits(sampleRows[i], bitOffset, bitLength, bitMode);
            if (lurt <= 99) inRange += 1;
            byLuvl[luvl] = lurt;
          }

          const missing = byLuvl.some((v) => v == null);
          if (missing) continue;
          if (inRange !== sampleRows.length) continue;

          for (const v of byLuvl) {
            if (v == null || v > 99) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          let monotonicViolations = 0;
          for (let i = 1; i < byLuvl.length; i++) {
            if (byLuvl[i] < byLuvl[i - 1]) monotonicViolations += 1;
          }

          const score = inRange * 1000 - monotonicViolations;
          if (!best || score > best.score) {
            best = {
              score,
              luvlSpec,
              lurtSpec: { bitOffset, bitLength, bitMode },
              byLuvl,
            };
          }
        }
      }
    }
  }

  if (!best) throw new Error("Unable to locate PRLU.LURT field in dynasty save");

  return best.byLuvl;
}

function prluCsvFromSaveBytes(saveBytes) {
  const { db1Bytes } = extractDb08ChunksFromDynastySave(saveBytes);
  const dir = parseDb08TableDirectory(db1Bytes);
  const entry = dir.byName.get("PRLU");
  if (!entry) throw new Error("Missing table in DB: PRLU");

  const prluTableBytes = sliceDb08TableBytes(db1Bytes, entry);
  const byLuvl = inferPrluMappingFromTableBytes(prluTableBytes);

  const lines = ["LUVL,LURT"];
  for (let luvl = 0; luvl < byLuvl.length; luvl++) {
    lines.push(`${luvl},${byLuvl[luvl]}`);
  }
  return lines.join("\n") + "\n";
}

export function dynastySaveBytesToCsvFiles({ saveBytes, layout, tables = REQUIRED_TABLES } = {}) {
  if (!(saveBytes instanceof Uint8Array)) throw new Error("saveBytes must be Uint8Array");
  if (!layout?.tables) throw new Error("layout is required");

  const tablesToDecode = (tables || []).filter((t) => t !== "PRLU");
  const decoded = decodeDynastySaveToTables({ saveBytes, layout, tables: tablesToDecode });

  const files = [];

  for (const tableName of tables) {
    if (tableName === "PRLU") {
      const text = prluCsvFromSaveBytes(saveBytes);
      files.push({ name: "PRLU.csv", text, type: "text/csv" });
      continue;
    }
    const tableLayout = layout.tables[tableName];
    if (!tableLayout) throw new Error(`Missing layout for ${tableName}`);

    const fields = Object.keys(tableLayout.fields).map((Name) => ({ Name }));
    const rows = (decoded[tableName]?.rows || []).map(stripInternalKeys);

    const extraColumns = [];

    if (tableName === "PLAY") {
      extraColumns.push("FirstName", "LastName");
      for (const r of rows) {
        const decodedName = decodeNameFromPlayRow(r);
        r.FirstName = decodedName.FirstName;
        r.LastName = decodedName.LastName;
      }
    }

    const text = tableDumpToCsv({ fields, rows, extraColumns });
    files.push({ name: `${tableName}.csv`, text, type: "text/csv" });
  }

  return { files };
}
