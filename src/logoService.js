import Papa from "papaparse";
import { db } from "./db";

const CSV_PATH = `${import.meta.env.BASE_URL}logos/fbs_logos.csv`;
const CONF_CSV_PATH = `${import.meta.env.BASE_URL}logos/conference_logos.csv`;
const CSV_HASH_KEY = "logosCsvHash";

/** Normalize a team display name to a stable key */
export function toNameKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "'"); // normalize apostrophes a bit
}

/** Convert GitHub blob URLs to raw URLs so <img> works reliably */
export function normalizeGithubUrl(url) {
  const u = String(url ?? "").trim();
  if (!u) return "";

  // https://github.com/<org>/<repo>/blob/<ref>/<path>
  const m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  if (m) {
    const [, org, repo, ref, path] = m;
    return `https://raw.githubusercontent.com/${org}/${repo}/${ref}/${path}`;
  }

  return u;
}

/** Normalize conference id/name keys for lookup */
export function normalizeConfKey(s) {
  return String(s ?? "").trim().toLowerCase();
}

let _confLogoMapCache = null; // Map
let _confLogoMapPromise = null;

/**
 * Load conference_logos.csv from /public/logos and return a Map of lookup keys -> url.
 * - Keys include both CGID values and conference names (lowercased).
 * - URLs are normalized (GitHub blob -> raw) to work reliably in <img>.
 * - Results are memoized in-memory for the session.
 */
export async function loadConferenceLogoMap() {
  if (_confLogoMapCache) return _confLogoMapCache;
  if (_confLogoMapPromise) return _confLogoMapPromise;

  _confLogoMapPromise = (async () => {
    let text = "";
    try {
      const res = await fetch(CONF_CSV_PATH, { cache: "no-store" });
      if (!res.ok) return new Map();
      text = await res.text();
    } catch {
      return new Map();
    }

    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data || [];

    const map = new Map();
    for (const r of rows) {
      const urlRaw = r.URL ?? r.Url ?? r.url ?? r.Logo ?? r.logo ?? r.logoUrl ?? r.LogoUrl ?? "";
      const url = normalizeGithubUrl(urlRaw);
      if (!url) continue;

      const cgidVal = r.CGID ?? r.cgid ?? r.ConfId ?? r.confId ?? r.ID ?? r.id ?? "";
      const nameVal =
        r.Conference ??
        r.conference ??
        r.CNAM ??
        r.CNAME ??
        r.Name ??
        r.name ??
        r.Conf ??
        r.conf ??
        "";

      if (String(cgidVal).trim()) map.set(normalizeConfKey(cgidVal), url);
      if (String(nameVal).trim()) map.set(normalizeConfKey(nameVal), url);
    }

    _confLogoMapCache = map;
    return map;
  })();

  const result = await _confLogoMapPromise;
  _confLogoMapPromise = null;
  return result;
}

/** Simple deterministic hash for "did the CSV change?" */
function hashString(str) {
  // djb2
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/**
 * Expand a team display name into possible alias keys.
 * This solves cases like:
 * - "USF Bulls" (game) vs "South Florida Bulls" (logo CSV)
 *
 * We keep this explicit + safe (no fuzzy matching).
 */
function expandAliasKeys(displayName) {
  const raw = String(displayName ?? "").trim();
  if (!raw) return [];

  const keys = new Set();

  // Always try the exact display name
  keys.add(toNameKey(raw));

  // Normalize common punctuation variations (e.g. UConn vs U-Conn, Florida Intl vs Florida Int'l)
  keys.add(toNameKey(raw.replace(/\./g, "")));
  keys.add(toNameKey(raw.replace(/-/g, " ")));

  // Split into school + nickname (nickname assumed to be last token)
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return Array.from(keys);

  const nickname = parts[parts.length - 1];
  const school = parts.slice(0, -1).join(" ");
  const schoolKey = toNameKey(school);

  // Acronym → possible full school names (multiple allowed)
  // NOTE: these are ONLY applied to the "school" part; nickname stays from TEAM row.
  const schoolAliasMap = new Map([
    ["usf", ["south florida"]],
    ["ucf", ["central florida"]],
    ["utsa", ["texas san antonio"]],
    ["uab", ["alabama birmingham"]],
    ["uconn", ["connecticut"]],
    ["ull", ["louisiana", "louisiana lafayette"]],
    ["ulm", ["louisiana monroe"]],
    ["fiu", ["florida intl", "florida international"]],
  ]);

  const expansions = schoolAliasMap.get(schoolKey);
  if (expansions?.length) {
    for (const expandedSchool of expansions) {
      keys.add(toNameKey(`${expandedSchool} ${nickname}`));
    }
  }

  // Also try a few “normalization” attempts on the school piece:
  // - remove periods
  // - remove hyphens
  const schoolNoDots = school.replace(/\./g, "");
  const schoolNoHyphens = school.replace(/-/g, " ");
  keys.add(toNameKey(`${schoolNoDots} ${nickname}`));
  keys.add(toNameKey(`${schoolNoHyphens} ${nickname}`));

  return Array.from(keys);
}

/**
 * Loads bundled logo CSV into logoBaseByName if:
 * - CSV exists, and
 * - content hash differs from last time
 */
export async function ensureBundledLogoBaseLoaded() {
  let text = "";
  try {
    const res = await fetch(CSV_PATH, { cache: "no-store" });
    if (!res.ok) return { loaded: false, reason: `CSV not found (${res.status})` };
    text = await res.text();
  } catch (e) {
    return { loaded: false, reason: e?.message || String(e) };
  }

  const newHash = hashString(text);
  const prev = await db.settings.get(CSV_HASH_KEY);
  const prevHash = prev?.value ?? null;

  if (prevHash === newHash) {
    return { loaded: true, changed: false, count: await db.logoBaseByName.count() };
  }

  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    return { loaded: false, reason: parsed.errors[0]?.message || "CSV parse error" };
  }

  const rows = parsed.data || [];
  const records = [];

  for (const r of rows) {
    const team = r.Team ?? r.team ?? r.TEAM ?? "";
    const url = r.URL ?? r.url ?? r.Url ?? "";

    const nameKey = toNameKey(team);
    const normUrl = normalizeGithubUrl(url);

    if (!nameKey || !normUrl) continue;
    records.push({ nameKey, url: normUrl });
  }

  await db.transaction("rw", db.logoBaseByName, db.settings, async () => {
    await db.logoBaseByName.clear();
    if (records.length) await db.logoBaseByName.bulkPut(records);
    await db.settings.put({ key: CSV_HASH_KEY, value: newHash });
  });

  return { loaded: true, changed: true, count: records.length };
}

/**
 * After TEAM import for a season, resolve teamLogos for that dynasty:
 * teamLogos: dynastyId + tgid -> url
 */
export async function upsertTeamLogosFromSeasonTeams({ dynastyId, seasonYear }) {
  await ensureBundledLogoBaseLoaded();

  const teams = await db.teamSeasons.where({ dynastyId, seasonYear }).toArray();
  if (!teams.length) return { updated: 0 };

  const base = await db.logoBaseByName.toArray();
  const baseMap = new Map(base.map((x) => [x.nameKey, x.url]));

  const toUpsert = [];

  for (const t of teams) {
    const display = `${t.tdna} ${t.tmna}`.trim();

    // Try multiple alias keys (exact + acronym expansions)
    const keys = expandAliasKeys(display);

    let url = "";
    for (const k of keys) {
      url = baseMap.get(k) || "";
      if (url) break;
    }

    if (!url) continue;

    toUpsert.push({
      dynastyId,
      tgid: t.tgid,
      url,
    });
  }

  if (!toUpsert.length) return { updated: 0 };

  await db.teamLogos.bulkPut(toUpsert);
  return { updated: toUpsert.length };
}

/**
 * Silent helper: refresh logos for the active dynasty using the most recent season.
 * This fixes cases where you updated the CSV or alias logic after seasons were already imported.
 */
export async function refreshTeamLogosForActiveDynastyMostRecentSeason() {
  const active = await db.settings.get("activeDynastyId");
  const dynastyId = active?.value ?? null;
  if (!dynastyId) return { refreshed: false, reason: "no active dynasty" };

  const games = await db.games.where({ dynastyId }).toArray();
  if (!games.length) return { refreshed: false, reason: "no seasons imported" };

  const mostRecentSeason = Math.max(...games.map((g) => Number(g.seasonYear)));
  await upsertTeamLogosFromSeasonTeams({ dynastyId, seasonYear: mostRecentSeason });

  return { refreshed: true, seasonYear: mostRecentSeason };
}
