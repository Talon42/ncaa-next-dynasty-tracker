import Papa from "papaparse";
import { db } from "./db";

const CSV_PATH = "/logos/fbs_logos.csv";
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

/** Simple deterministic hash for "did the CSV change?" */
function hashString(str) {
  // djb2
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  // make it unsigned
  return (h >>> 0).toString(16);
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
    if (!res.ok) {
      // If you haven't added the file yet, we just skip silently
      return { loaded: false, reason: `CSV not found (${res.status})` };
    }
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
    // keep silent-ish; store nothing if malformed
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
    if (records.length) {
      await db.logoBaseByName.bulkPut(records);
    }
    await db.settings.put({ key: CSV_HASH_KEY, value: newHash });
  });

  return { loaded: true, changed: true, count: records.length };
}

/**
 * After TEAM import for a season, resolve teamLogos for that dynasty:
 * teamLogos: dynastyId + tgid -> url
 */
export async function upsertTeamLogosFromSeasonTeams({ dynastyId, seasonYear }) {
  // Ensure base map exists
  await ensureBundledLogoBaseLoaded();

  const teams = await db.teamSeasons.where({ dynastyId, seasonYear }).toArray();
  if (!teams.length) return { updated: 0 };

  // Pull base logos into a Map for quick lookups
  const base = await db.logoBaseByName.toArray();
  const baseMap = new Map(base.map((x) => [x.nameKey, x.url]));

  const toUpsert = [];

  for (const t of teams) {
    const display = `${t.tdna} ${t.tmna}`.trim();
    const key = toNameKey(display);
    const url = baseMap.get(key);
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
