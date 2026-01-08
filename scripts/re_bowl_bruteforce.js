import fs from "node:fs";
import { extractDb08ChunksFromDynastySave } from "../src/tdb/extractDynastyDb.js";
import { parseDb08TableDirectory, sliceDb08TableBytes, readU32LE } from "../src/tdb/db08.js";

function readU16LE(bytes, offset) {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) >>> 0;
}

function readBits(bytes, bitOffset, bitLength, { msbInByte, msbValue }) {
  let v = 0;
  if (msbValue) {
    for (let i = 0; i < bitLength; i++) {
      const bi = bitOffset + i;
      const byteIndex = bi >> 3;
      const bitInByte = bi & 7;
      const bit = msbInByte ? (bytes[byteIndex] >> (7 - bitInByte)) & 1 : (bytes[byteIndex] >> bitInByte) & 1;
      v = (v << 1) | bit;
    }
  } else {
    for (let i = 0; i < bitLength; i++) {
      const bi = bitOffset + i;
      const byteIndex = bi >> 3;
      const bitInByte = bi & 7;
      const bit = msbInByte ? (bytes[byteIndex] >> (7 - bitInByte)) & 1 : (bytes[byteIndex] >> bitInByte) & 1;
      v |= bit << i;
    }
  }
  return v >>> 0;
}

function variants(record) {
  const out = [];

  const orig = new Uint8Array(record);
  out.push({ name: "orig", bytes: orig });

  const swap16 = new Uint8Array(orig.length);
  for (let i = 0; i < orig.length; i += 2) {
    swap16[i] = orig[i + 1] ?? 0;
    swap16[i + 1] = orig[i] ?? 0;
  }
  out.push({ name: "swap16", bytes: swap16 });

  const swap32 = new Uint8Array(orig.length);
  for (let i = 0; i < orig.length; i += 4) {
    swap32[i] = orig[i + 3] ?? 0;
    swap32[i + 1] = orig[i + 2] ?? 0;
    swap32[i + 2] = orig[i + 1] ?? 0;
    swap32[i + 3] = orig[i] ?? 0;
  }
  out.push({ name: "swap32", bytes: swap32 });

  const swap32Words = new Uint8Array(orig.length);
  for (let i = 0; i < orig.length; i += 4) {
    swap32Words[i] = orig[i + 2] ?? 0;
    swap32Words[i + 1] = orig[i + 3] ?? 0;
    swap32Words[i + 2] = orig[i] ?? 0;
    swap32Words[i + 3] = orig[i + 1] ?? 0;
  }
  out.push({ name: "swap32Words", bytes: swap32Words });

  const rev = new Uint8Array(orig.length);
  for (let i = 0; i < orig.length; i++) rev[i] = orig[orig.length - 1 - i];
  out.push({ name: "reverse", bytes: rev });

  return out;
}

function run() {
  const dynastyFile = process.env.DYNASTY_FILE || process.argv[2];
  if (!dynastyFile) {
    console.log("SKIP: set DYNASTY_FILE or pass a path");
    process.exit(0);
  }

  const saveBytes = new Uint8Array(fs.readFileSync(dynastyFile));
  const { db1Bytes } = extractDb08ChunksFromDynastySave(saveBytes);
  const dir = parseDb08TableDirectory(db1Bytes);
  const bowl = sliceDb08TableBytes(db1Bytes, dir.byName.get("BOWL"));

  const recordSize = readU32LE(bowl, 0x08);
  const capacity = readU16LE(bowl, 0x14);
  const recordDataOffset = bowl.length - recordSize * capacity;
  const record0 = bowl.slice(recordDataOffset, recordDataOffset + recordSize);

  const expected = [
    { name: "BCI1", bits: 5, value: 4 },
    { name: "BCR1", bits: 4, value: 1 },
    { name: "BCI2", bits: 5, value: 4 },
    { name: "BCR2", bits: 4, value: 1 },
    { name: "BMFD", bits: 10, value: 178 },
    { name: "SGID", bits: 9, value: 300 },
    { name: "UTID", bits: 7, value: 6 },
    { name: "GTOD", bits: 11, value: 660 },
    { name: "SGNM", bits: 7, value: 0 },
    { name: "BMON", bits: 4, value: 12 },
    { name: "SEWN", bits: 5, value: 16 },
    { name: "BLGO", bits: 10, value: 31 },
    { name: "BPLO", bits: 6, value: 63 },
    { name: "BIDX", bits: 8, value: 54 },
    { name: "BDAY", bits: 5, value: 6 },
  ];

  const candidates = [];

  for (const variant of variants(record0)) {
    for (const msbInByte of [false, true]) {
      for (const msbValue of [false, true]) {
        const maxBits = variant.bytes.length * 8;
        let hitCount = 0;
        const hits = {};

        for (const f of expected) {
          const found = [];
          for (let bitOff = 0; bitOff + f.bits <= maxBits; bitOff++) {
            const val = readBits(variant.bytes, bitOff, f.bits, { msbInByte, msbValue });
            if (val === f.value) found.push(bitOff);
            if (found.length > 8) break;
          }
          if (found.length) {
            hitCount++;
            hits[f.name] = found;
          }
        }

        candidates.push({
          variant: variant.name,
          msbInByte,
          msbValue,
          hitCount,
          hits,
        });
      }
    }
  }

  candidates.sort((a, b) => b.hitCount - a.hitCount);
  const best = candidates.slice(0, 5);
  for (const c of best) {
    console.log(`\n== best: ${c.variant} msbInByte=${c.msbInByte} msbValue=${c.msbValue} hits=${c.hitCount}`);
    for (const f of expected) {
      const offs = c.hits[f.name];
      if (offs?.length) console.log(`  ${f.name}: ${offs.join(",")}`);
    }
  }
}

run();