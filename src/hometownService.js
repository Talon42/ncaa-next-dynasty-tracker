import Papa from "papaparse";

const RCHT_PATH = `${import.meta.env.BASE_URL}RCHT.csv`;
const RCST_PATH = `${import.meta.env.BASE_URL}RCST.csv`;

let _hometownCache = null;
let _hometownPromise = null;

function toInt(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseHometownCsv(text) {
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
  const cityByIndex = new Map();

  for (const row of parsed.data || []) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const index = toInt(row[0]);
    const city = String(row[1] ?? "").trim();
    if (index == null || !city) continue;
    cityByIndex.set(index, city);
  }

  return cityByIndex;
}

function parseStateCsv(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const stateById = new Map();

  for (const row of parsed.data || []) {
    const id = toInt(row?.STID ?? row?.stid ?? row?.StateId ?? row?.stateId);
    const name =
      String(row?.STNM ?? row?.stnm ?? row?.State ?? row?.state ?? row?.STAB ?? row?.stab ?? "").trim();
    if (id == null || !name) continue;
    stateById.set(id, name);
  }

  return stateById;
}

export async function loadHometownLookup() {
  if (_hometownCache) return _hometownCache;
  if (_hometownPromise) return _hometownPromise;

  _hometownPromise = (async () => {
    let hometownText = "";
    let stateText = "";

    try {
      const res = await fetch(RCHT_PATH, { cache: "no-store" });
      if (res.ok) hometownText = await res.text();
    } catch {
      hometownText = "";
    }

    try {
      const res = await fetch(RCST_PATH, { cache: "no-store" });
      if (res.ok) stateText = await res.text();
    } catch {
      stateText = "";
    }

    const cityByIndex = hometownText ? parseHometownCsv(hometownText) : new Map();
    const stateById = stateText ? parseStateCsv(stateText) : new Map();

    _hometownCache = { cityByIndex, stateById };
    return _hometownCache;
  })();

  const result = await _hometownPromise;
  _hometownPromise = null;
  return result;
}

export function formatHometownLabel(raw, lookup) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const rchd = toInt(trimmed);
  if (rchd == null) return trimmed;
  if (!lookup) return trimmed;

  const stateIndex = Math.floor(rchd / 256);
  const city = lookup.cityByIndex.get(rchd) || "";
  const state = lookup.stateById.get(stateIndex) || "";

  if (city && state) return `${city}, ${state}`;
  return city || state || trimmed;
}
