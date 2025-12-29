import Papa from "papaparse";
import { toNameKey } from "./logoService";

const CSV_PATH = `${import.meta.env.BASE_URL}abbreviations.csv`;

let _abbrIndexCache = null;
let _abbrIndexPromise = null;

function simplifyKey(nameKey) {
  return String(nameKey ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenizeForMatch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export async function loadTeamAbbreviationIndex() {
  if (_abbrIndexCache) return _abbrIndexCache;
  if (_abbrIndexPromise) return _abbrIndexPromise;

  _abbrIndexPromise = (async () => {
    let text = "";
    try {
      const res = await fetch(CSV_PATH, { cache: "no-store" });
      if (!res.ok) return { byKey: new Map(), bySimpleKey: new Map(), entries: [] };
      text = await res.text();
    } catch {
      return { byKey: new Map(), bySimpleKey: new Map(), entries: [] };
    }

    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data || [];

    const byKey = new Map();
    const bySimpleKey = new Map();
    const entries = [];

    for (const r of rows) {
      const nameRaw =
        r.Team ??
        r.team ??
        r.Name ??
        r.name ??
        r.School ??
        r.school ??
        "";
      const abbrRaw =
        r.Abbreviation ??
        r.abbreviation ??
        r.Abbrev ??
        r.abbrev ??
        r.ABBR ??
        r.abbr ??
        "";

      const name = String(nameRaw ?? "").trim();
      const abbr = String(abbrRaw ?? "").trim();
      if (!name || !abbr) continue;

      const nameKey = toNameKey(name);
      if (!nameKey) continue;

      const simpleKey = simplifyKey(nameKey);
      const tokens = tokenizeForMatch(nameKey);

      byKey.set(nameKey, abbr);
      if (simpleKey) bySimpleKey.set(simpleKey, abbr);

      entries.push({ nameKey, simpleKey, tokens, abbr });
    }

    return { byKey, bySimpleKey, entries };
  })();

  const result = await _abbrIndexPromise;
  _abbrIndexPromise = null;
  _abbrIndexCache = result;
  return result;
}

export function matchTeamAbbreviation(name, index) {
  if (!name || !index) return "";

  const nameKey = toNameKey(name);
  if (index.byKey?.has(nameKey)) return index.byKey.get(nameKey);

  const simpleKey = simplifyKey(nameKey);
  if (index.bySimpleKey?.has(simpleKey)) return index.bySimpleKey.get(simpleKey);

  const nameTokens = tokenizeForMatch(nameKey);
  if (!nameTokens.length) return "";

  const nameSet = new Set(nameTokens);
  let best = null;

  for (const entry of index.entries || []) {
    if (!entry.tokens?.length) continue;
    const allInName = entry.tokens.every((t) => nameSet.has(t));
    if (!allInName) continue;

    if (
      !best ||
      entry.tokens.length > best.tokens.length ||
      (entry.tokens.length === best.tokens.length && entry.nameKey.length > best.nameKey.length)
    ) {
      best = entry;
    }
  }

  if (best) return best.abbr;

  for (const entry of index.entries || []) {
    if (!entry.tokens?.length) continue;
    const entrySet = new Set(entry.tokens);
    const nameInEntry = nameTokens.every((t) => entrySet.has(t));
    if (nameInEntry) return entry.abbr;
  }

  return "";
}
