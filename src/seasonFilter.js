const SEASON_FILTER_KEY = "seasonFilterYear";

export function normalizeSeasonYear(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.trunc(n));
}

export function readSeasonFilter() {
  try {
    const v = sessionStorage.getItem(SEASON_FILTER_KEY);
    const normalized = normalizeSeasonYear(v);
    if (!normalized && v != null) sessionStorage.removeItem(SEASON_FILTER_KEY);
    return normalized;
  } catch {
    return null;
  }
}

export function writeSeasonFilter(value) {
  try {
    const normalized = normalizeSeasonYear(value);
    if (!normalized) return;
    sessionStorage.setItem(SEASON_FILTER_KEY, normalized);
  } catch {
    // ignore storage errors
  }
}

export function getSeasonFromParamOrSaved(paramSeason) {
  const normalized = normalizeSeasonYear(paramSeason);
  if (normalized) {
    writeSeasonFilter(normalized);
    return normalized;
  }
  return readSeasonFilter();
}

export function pickSeasonFromList({ currentSeason, availableSeasons, fallbackSeason }) {
  const seasons = (availableSeasons || []).map(String);
  if (!seasons.length) return null;
  const current = normalizeSeasonYear(currentSeason);
  if (current && seasons.includes(current)) return current;

  const saved = readSeasonFilter();
  if (saved && seasons.includes(saved)) return saved;

  const fallback = normalizeSeasonYear(fallbackSeason);
  if (fallback && seasons.includes(fallback)) return fallback;

  return seasons[0] ?? null;
}
