import Papa from "papaparse";
import { toNameKey } from "./logoService";

const TEAM_COLORS_CSV_PATH = `${import.meta.env.BASE_URL}logos/fbs_team_colors.csv`;

const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "&",
  "at",
  "a",
  "an",
  "university",
  "college",
  "state",
  "tech",
]);

function normalizeHex(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const v = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-f]{6}$/i.test(v)) return "";
  return v.toUpperCase();
}

function isPureBlackOrWhite(hex) {
  const h = normalizeHex(hex);
  return h === "#000000" || h === "#FFFFFF";
}

function tokenizeName(name) {
  const normalized = toNameKey(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t && !STOPWORDS.has(t));
}

function scoreMatch(targetName, candidateName) {
  const targetKey = toNameKey(targetName);
  const candidateKey = toNameKey(candidateName);
  if (!targetKey || !candidateKey) return -Infinity;
  if (targetKey === candidateKey) return 1000;

  let score = 0;
  if (targetKey.includes(candidateKey) || candidateKey.includes(targetKey)) score += 200;

  const targetTokens = tokenizeName(targetName);
  const candidateTokens = tokenizeName(candidateName);
  const targetSet = new Set(targetTokens);

  let intersection = 0;
  for (const t of candidateTokens) {
    if (targetSet.has(t)) intersection += 1;
  }
  score += intersection * 10;

  const last = candidateTokens[candidateTokens.length - 1] || "";
  if (last && targetSet.has(last)) score += 50;

  const lastTwo = candidateTokens.slice(-2).join(" ");
  if (lastTwo && targetKey.includes(lastTwo)) score += 30;

  score -= Math.max(0, candidateTokens.length - intersection) * 2;

  return score;
}

let _teamColorsCache = null; // Array<{ school, schoolKey, colors }>
let _teamColorsPromise = null;

async function loadTeamColors() {
  if (_teamColorsCache) return _teamColorsCache;
  if (_teamColorsPromise) return _teamColorsPromise;

  _teamColorsPromise = (async () => {
    let text = "";
    try {
      const res = await fetch(TEAM_COLORS_CSV_PATH, { cache: "no-store" });
      if (!res.ok) return [];
      text = await res.text();
    } catch {
      return [];
    }

    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data || [];

    const out = [];
    for (const r of rows) {
      const school = String(r.School ?? r.school ?? r.Team ?? r.team ?? "").trim();
      if (!school) continue;

      const primary = normalizeHex(r["Primary Hex"] ?? r.PrimaryHex ?? r.primary ?? r.primaryHex);
      const secondary = normalizeHex(
        r["Secondary Hex"] ?? r.SecondaryHex ?? r.secondary ?? r.secondaryHex
      );
      const fallback = normalizeHex(r["Fallback Hex"] ?? r.FallbackHex ?? r.fallback ?? r.fallbackHex);

      const colors = [primary, secondary, fallback].filter(Boolean);
      if (!colors.length) continue;

      out.push({
        school,
        schoolKey: toNameKey(school),
        colors,
      });
    }

    _teamColorsCache = out;
    return out;
  })();

  const result = await _teamColorsPromise;
  _teamColorsPromise = null;
  return result;
}

export async function pickTeamAccentColor(teamName) {
  const name = String(teamName ?? "").trim();
  if (!name) return null;

  const rows = await loadTeamColors();
  if (!rows.length) return null;

  const targetKey = toNameKey(name);

  let best = null;
  let bestScore = -Infinity;

  for (const r of rows) {
    if (!r?.school) continue;
    if (r.schoolKey && r.schoolKey === targetKey) {
      best = r;
      bestScore = 1000;
      break;
    }

    const s = scoreMatch(name, r.school);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }

  if (!best || !Number.isFinite(bestScore) || bestScore < 20) return null;

  for (const c of best.colors || []) {
    if (!c) continue;
    if (isPureBlackOrWhite(c)) continue;
    return c;
  }

  return null;
}
