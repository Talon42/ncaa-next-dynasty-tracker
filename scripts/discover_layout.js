import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { extractDynastyDatabasesToTempFiles } from "../electron/tdbExtract.js";
import { extractDb08ChunksFromDynastySave } from "../src/tdb/extractDynastyDb.js";
import { parseDb08TableDirectory, sliceDb08TableBytes, readU32LE } from "../src/tdb/db08.js";

function readU16LE(bytes, offset) {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) >>> 0;
}

function isAscii4(name) {
  return /^[A-Z0-9]{4}$/.test(name);
}

function parseFieldDefsBitEndMap(tableBytes, recordDataOffset) {
  const byName = new Map();
  let p = 0x30;

  while (p + 8 <= recordDataOffset) {
    const name = String.fromCharCode(tableBytes[p], tableBytes[p + 1], tableBytes[p + 2], tableBytes[p + 3]);
    const sizeBits = readU32LE(tableBytes, p + 4);
    if (!isAscii4(name) || !sizeBits) break;

    // Try 16-byte def.
    if (p + 16 <= recordDataOffset) {
      const a = readU32LE(tableBytes, p + 8);
      const b = readU32LE(tableBytes, p + 12);

      // Heuristic: if a looks like a small enum and b looks like a plausible bit index, treat as extended.
      if (a <= 64 && b <= 0x00ffffff) {
        byName.set(name, { name, sizeBits, a, b });
        p += 16;
        continue;
      }
    }

    // Fallback 8-byte def.
    byName.set(name, { name, sizeBits, a: null, b: null });
    p += 8;
  }

  return byName;
}

function decodeStringFixed(recordBytes, byteOffset, byteLen) {
  const slice = recordBytes.slice(byteOffset, byteOffset + byteLen);
  return Buffer.from(slice)
    .toString("latin1")
    .replace(/\u0000+$/g, "")
    .trimEnd();
}

function readBits(recordBytes, bitOffset, bitLength, mode) {
  let value = 0;

  if (mode === "lsb") {
    for (let i = 0; i < bitLength; i++) {
      const bitIndex = bitOffset + i;
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      const bit = (recordBytes[byteIndex] >> bitInByte) & 1;
      value |= bit << i;
    }
    return value >>> 0;
  }

  if (mode === "msb") {
    for (let i = 0; i < bitLength; i++) {
      const bitIndex = bitOffset + i;
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      const bit = (recordBytes[byteIndex] >> (7 - bitInByte)) & 1;
      value |= bit << i;
    }
    return value >>> 0;
  }

  throw new Error(`Unknown bit mode: ${mode}`);
}

function toSigned(value, bitLength) {
  if (bitLength >= 32) {
    // For >31 bits we skip signed conversion (rare in our tables).
    return value;
  }
  const signBit = 1 << (bitLength - 1);
  return value & signBit ? value - (1 << bitLength) : value;
}

function normalizeOracleValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

function scoreCandidateNumeric({ records, bitOffset, sizeBits, mode, signed }) {
  let matchedAll = 0;
  let totalAll = 0;
  let matchedNonZero = 0;
  let totalNonZero = 0;

  for (const r of records) {
    const expected = normalizeOracleValue(r.expected);
    if (expected === null || typeof expected === "string") continue;

    const raw = readBits(r.recordBytes, bitOffset, sizeBits, mode);
    const got = signed ? toSigned(raw, sizeBits) : raw;

    totalAll++;
    if (got === expected) matchedAll++;

    if (expected !== 0) {
      totalNonZero++;
      if (got === expected) matchedNonZero++;
    }
  }

  return { matchedAll, totalAll, matchedNonZero, totalNonZero };
}

function scoreCandidateString({ records, byteOffset, byteLen }) {
  let matched = 0;
  let total = 0;

  for (const r of records) {
    const expected = normalizeOracleValue(r.expected);
    if (typeof expected !== "string") continue;
    if (!expected) continue;

    const got = decodeStringFixed(r.recordBytes, byteOffset, byteLen);
    total++;
    if (got === expected) matched++;
  }

  return { matched, total };
}

function findStringOffset({ records, recordSizeBytes, byteLen, preferredOffsets }) {
  const candidates = [];

  for (const o of preferredOffsets) {
    if (o >= 0 && o + byteLen <= recordSizeBytes) candidates.push(o);
  }

  for (let off = 0; off + byteLen <= recordSizeBytes; off++) {
    candidates.push(off);
  }

  let best = null;

  for (const off of candidates) {
    const sc = scoreCandidateString({ records, byteOffset: off, byteLen });
    if (!sc.total) continue;

    const ratio = sc.matched / sc.total;
    const score = sc.matched;

    if (!best || score > best.score || (score === best.score && ratio > best.ratio)) {
      best = { off, score, ratio, total: sc.total };
      if (best.score === best.total) break;
    }
  }

  return best;
}

function findNumericOffset({ records, recordSizeBits, sizeBits, preferredOffsets, signed }) {
  const candidates = [];

  for (const off of preferredOffsets) {
    if (off >= 0 && off + sizeBits <= recordSizeBits) candidates.push(off);
  }

  // Favor byte-aligned scan first.
  if (sizeBits % 8 === 0) {
    for (let bitOffset = 0; bitOffset + sizeBits <= recordSizeBits; bitOffset += 8) candidates.push(bitOffset);
  }

  // Full scan fallback.
  for (let bitOffset = 0; bitOffset + sizeBits <= recordSizeBits; bitOffset++) candidates.push(bitOffset);

  let best = null;
  for (const bitOffset of candidates) {
    for (const mode of ["lsb", "msb"]) {
      const sc = scoreCandidateNumeric({ records, bitOffset, sizeBits, mode, signed });
      if (!sc.totalAll) continue;

      const ratioAll = sc.matchedAll / sc.totalAll;
      const ratioNonZero = sc.totalNonZero ? sc.matchedNonZero / sc.totalNonZero : 0;

      // Prefer candidates that match non-zero oracle values when available; this avoids
      // ambiguous "all zeros" fields (e.g. rare flags) getting mapped incorrectly.
      const primaryScore = sc.totalNonZero ? sc.matchedNonZero : sc.matchedAll;
      const primaryRatio = sc.totalNonZero ? ratioNonZero : ratioAll;

      if (
        !best ||
        primaryScore > best.primaryScore ||
        (primaryScore === best.primaryScore && primaryRatio > best.primaryRatio) ||
        (primaryScore === best.primaryScore && primaryRatio === best.primaryRatio && sc.matchedAll > best.matchedAll) ||
        (primaryScore === best.primaryScore && primaryRatio === best.primaryRatio && sc.matchedAll === best.matchedAll && ratioAll > best.ratioAll)
      ) {
        best = {
          bitOffset,
          mode,
          primaryScore,
          primaryRatio,
          matchedAll: sc.matchedAll,
          totalAll: sc.totalAll,
          matchedNonZero: sc.matchedNonZero,
          totalNonZero: sc.totalNonZero,
          ratioAll,
          ratioNonZero,
        };

        const perfectAll = best.matchedAll === best.totalAll;
        const perfectNonZero = best.totalNonZero === 0 || best.matchedNonZero === best.totalNonZero;
        if (perfectAll && perfectNonZero) break;
      }
    }

    if (best) {
      const perfectAll = best.matchedAll === best.totalAll;
      const perfectNonZero = best.totalNonZero === 0 || best.matchedNonZero === best.totalNonZero;
      if (perfectAll && perfectNonZero) break;
    }
  }

  return best;
}

function run() {
  const dynastyFile = process.env.DYNASTY_FILE || process.argv[2];
  if (!dynastyFile) {
    console.log("Usage: set DYNASTY_FILE=... then node scripts/discover_layout.js");
    process.exit(2);
  }

  const requiredTables = ["TEAM", "SCHD", "TSSE", "BOWL", "COCH", "PLAY", "PSOF", "PSDE", "PSKI", "PSKP", "AAPL", "OSPA"];

  // Oracle dump (desktop-only): uses tdbaccess.dll.
  const extracted = extractDynastyDatabasesToTempFiles(dynastyFile);
  const dumpArgs = [
    "run",
    "--project",
    "tools/DynastyTdbDump/DynastyTdbDump.csproj",
    "--",
    "--db",
    extracted.db1Path,
    "--tables",
    requiredTables.join(","),
    "--rows",
    "--maxRows",
        String(process.env.LAYOUT_MAX_ROWS || 400),
  ];

  const dumpRes = spawnSync("dotnet", dumpArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });

  if (dumpRes.error) throw dumpRes.error;
  if (dumpRes.status !== 0) throw new Error(String(dumpRes.stderr || ""));

  const oracleDb = JSON.parse(String(dumpRes.stdout || "").trim());
  assert.ok(Array.isArray(oracleDb?.Tables), "Expected oracle Tables");

  // Actual bytes (browser-safe path): extract db1 bytes directly from the dynasty file.
  const saveBytes = new Uint8Array(fs.readFileSync(dynastyFile));
  const { db1Bytes } = extractDb08ChunksFromDynastySave(saveBytes);
  const dir = parseDb08TableDirectory(db1Bytes);

  const layout = {
    format: "dynasty-tracker-tdb-layout",
    source: {
      dynastyFile: path.resolve(dynastyFile),
    },
    generatedAt: new Date().toISOString(),
    tables: {},
  };

  for (const t of oracleDb.Tables) {
    const name = String(t?.Name ?? "").trim();
    if (!name) continue;
    if (!requiredTables.includes(name)) continue;

    const entry = dir.byName.get(name);
    if (!entry) throw new Error(`Missing table ${name} in DB directory`);

    const tableBytes = sliceDb08TableBytes(db1Bytes, entry);
    const recordSizeBytes = readU32LE(tableBytes, 0x08);
    const capacity = readU16LE(tableBytes, 0x14);
    const recordCount = readU16LE(tableBytes, 0x16);
    const recordDataBytes = recordSizeBytes * capacity;
    const recordDataOffset = tableBytes.length - recordDataBytes;

    if (recordSizeBytes <= 0 || recordSizeBytes > 4096) throw new Error(`Bad record size for ${name}`);
    if (recordDataOffset < 0 || recordDataOffset > tableBytes.length) throw new Error(`Bad recordDataOffset for ${name}`);

    const defsByName = parseFieldDefsBitEndMap(tableBytes, recordDataOffset);

    const rows = Array.isArray(t?.Rows) ? t.Rows : [];
    const fields = Array.isArray(t?.Fields) ? t.Fields : [];

    const tableLayout = {
      recordSizeBytes,
      recordCount,
      capacity,
      recordDataOffset,
      fields: {},
    };

    // Build record samples.
    const recordSamples = new Map();
    for (const row of rows) {
      const recNo = Number(row?.__recNo);
      if (!Number.isFinite(recNo) || recNo < 0) continue;
      const recStart = recordDataOffset + recNo * recordSizeBytes;
      const recEnd = recStart + recordSizeBytes;
      if (recEnd > tableBytes.length) continue;
      recordSamples.set(recNo, tableBytes.slice(recStart, recEnd));
    }


    // No rows fallback: emit a simple sequential bit layout so empty tables can still be decoded.
    if (!rows.length && fields.length) {
      let bitCursor = 0;
      for (const f of fields) {
        const fieldName = String(f?.Name ?? "").trim();
        const sizeBits = Number(f?.SizeBits);
        const fieldType = String(f?.FieldType ?? "");
        if (!fieldName || !Number.isFinite(sizeBits) || sizeBits <= 0) continue;

        const recordSizeBits = recordSizeBytes * 8;
        if (bitCursor + sizeBits > recordSizeBits) break;

        const ft = fieldType.toLowerCase();
        const signed = ft.includes("sint") || (ft.endsWith("int") && !ft.includes("uint"));

        if (ft.includes("string") || ft.includes("varchar")) {
          if (sizeBits % 8 !== 0 || bitCursor % 8 !== 0) continue;
          tableLayout.fields[fieldName] = {
            sizeBits,
            type: "string",
            byteOffset: bitCursor / 8,
            byteLen: sizeBits / 8,
          };
        } else if (ft.includes("float")) {
          if (sizeBits !== 32 || bitCursor % 8 !== 0) continue;
          tableLayout.fields[fieldName] = {
            sizeBits,
            type: "float32",
            byteOffset: bitCursor / 8,
            endian: "le",
          };
        } else {
          tableLayout.fields[fieldName] = {
            sizeBits,
            type: signed ? "sint" : "uint",
            bitOffset: bitCursor,
            bitMode: "lsb",
          };
        }

        bitCursor += sizeBits;
      }

      layout.tables[name] = tableLayout;
      continue;
    }
    for (const f of fields) {
      const fieldName = String(f?.Name ?? "").trim();
      const sizeBits = Number(f?.SizeBits);
      const fieldType = String(f?.FieldType ?? "");
      if (!fieldName || !Number.isFinite(sizeBits) || sizeBits <= 0) continue;

      // Build matching records list.
      const records = [];
      for (const row of rows) {
        const recNo = Number(row?.__recNo);
        const recBytes = recordSamples.get(recNo);
        if (!recBytes) continue;
        records.push({
          recNo,
          recordBytes: recBytes,
          expected: row[fieldName],
        });
      }

      if (!records.length) continue;

      const recordSizeBits = recordSizeBytes * 8;
      const def = defsByName.get(fieldName) || null;

      const preferredBitOffsets = [];
      const preferredByteOffsets = [];

      if (def?.b != null) {
        const end = def.b === 0 ? recordSizeBits : def.b;
        const start = end - sizeBits;
        preferredBitOffsets.push(start);
        preferredBitOffsets.push(def.b);
        if (sizeBits % 8 === 0) {
          preferredByteOffsets.push(Math.floor(start / 8));
          preferredByteOffsets.push(Math.floor(def.b / 8));
        }
      }

      // Strings
      if (fieldType.toLowerCase().includes("string") || fieldType.toLowerCase().includes("varchar")) {
        if (sizeBits % 8 !== 0) {
          continue;
        }
        const byteLen = sizeBits / 8;
        const best = findStringOffset({
          records,
          recordSizeBytes,
          byteLen,
          preferredOffsets: preferredByteOffsets,
        });

        if (!best || best.score === 0) {
          continue;
        }

        tableLayout.fields[fieldName] = {
          sizeBits,
          type: "string",
          byteOffset: best.off,
          byteLen,
        };
        continue;
      }

      // Floats (prefer byte-aligned scan)
      if (fieldType.toLowerCase().includes("float")) {
        if (sizeBits !== 32) continue;

        let best = null;
        for (let byteOffset = 0; byteOffset + 4 <= recordSizeBytes; byteOffset++) {
          let matched = 0;
          let total = 0;
          for (const r of records) {
            const expected = normalizeOracleValue(r.expected);
            if (expected === null || typeof expected === "string") continue;

            const got = Buffer.from(r.recordBytes.slice(byteOffset, byteOffset + 4)).readFloatLE(0);
            total++;
            if (Math.abs(got - expected) < 1e-5) matched++;
          }
          if (!total) continue;
          const ratio = matched / total;
          if (!best || matched > best.matched || (matched === best.matched && ratio > best.ratio)) {
            best = { byteOffset, matched, total, ratio };
            if (matched === total) break;
          }
        }

        if (best && best.matched > 0) {
          tableLayout.fields[fieldName] = {
            sizeBits,
            type: "float32",
            byteOffset: best.byteOffset,
            endian: "le",
          };
        }
        continue;
      }

      // Integers
      const ft = fieldType.toLowerCase();
      const signed = ft.includes("sint") || (ft.endsWith("int") && !ft.includes("uint"));

      const best = findNumericOffset({
        records,
        recordSizeBits,
        sizeBits,
        preferredOffsets: preferredBitOffsets,
        signed,
      });

      if (!best || best.score === 0) {
        continue;
      }

      tableLayout.fields[fieldName] = {
        sizeBits,
        type: signed ? "sint" : "uint",
        bitOffset: best.bitOffset,
        bitMode: best.mode,
      };
    }

    layout.tables[name] = tableLayout;
  }

  const outPath = path.resolve("src/tdb/layouts/ncaa_next_required_layout.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(layout, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
}

run();
