function buildAlphabet() {
  // Index matches db-editor CreateNameConversionTable
  const map = [];
  map[0] = "";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 0; i < lower.length; i++) map[1 + i] = lower[i];
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < upper.length; i++) map[27 + i] = upper[i];
  map[53] = "-";
  map[54] = "'";
  map[55] = ".";
  map[56] = " ";
  map[57] = "@";
  map[58] = "ñ";
  return map;
}

const DEFAULT_ALPHABET = buildAlphabet();

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function decodeNameFromPlayRow(row, { maxChars = 10, alphabet = DEFAULT_ALPHABET } = {}) {
  function decode(prefix) {
    let out = "";
    for (let i = 1; i <= maxChars; i++) {
      const key = `${prefix}${String(i).padStart(2, "0")}`;
      const code = toIntOrNull(row?.[key]);
      if (!code) break;
      out += alphabet[code] ?? "";
    }
    return out;
  }

  return {
    FirstName: decode("PF"),
    LastName: decode("PL"),
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const needsQuotes = /[\",\n\r]/.test(s);
  if (!needsQuotes) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function tableDumpToCsv({ fields, rows, extraColumns = [] }) {
  const baseCols = (fields || []).map((f) => String(f?.Name ?? "")).filter(Boolean);
  const cols = baseCols.concat(extraColumns);
  const lines = [cols.join(",")];

  for (const row of rows || []) {
    const values = cols.map((c) => csvEscape(row?.[c]));
    lines.push(values.join(","));
  }

  return lines.join("\n") + "\n";
}

export function dumpTablesToCsvFiles({ tables, options } = {}) {
  const out = {};
  for (const t of tables || []) {
    const name = String(t?.Name ?? "");
    if (!name) continue;

    const extraCols = [];
    const rows = Array.isArray(t?.Rows) ? t.Rows : [];

    if (name === "PLAY") {
      extraCols.push("FirstName", "LastName");
      for (const r of rows) {
        const decoded = decodeNameFromPlayRow(r, options);
        r.FirstName = decoded.FirstName;
        r.LastName = decoded.LastName;
      }
    }

    out[name] = tableDumpToCsv({ fields: t.Fields, rows, extraColumns: extraCols });
  }
  return out;
}
