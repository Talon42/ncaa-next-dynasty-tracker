export function normalizeBowlName(name) {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .trim()
    .toLowerCase();
}

export function createPostseasonLogoResolver(map) {
  return (name) => {
    if (!name) return "";
    const raw = String(name);
    const direct = map.get(normalizeBowlName(raw));
    if (direct) return direct;

    const stripped = raw
      .replace(/^cfp\s*-\s*/i, "")
      .replace(/^college football playoff\s*-\s*/i, "");
    const strippedKey = normalizeBowlName(stripped);
    if (strippedKey && map.has(strippedKey)) {
      return map.get(strippedKey) || "";
    }

    const rawKey = normalizeBowlName(raw);
    for (const [key, url] of map.entries()) {
      if (rawKey.includes(key) || key.includes(rawKey)) {
        return url || "";
      }
    }

    return "";
  };
}

export function buildSeasonBowlNameMap(bowlRows) {
  const bowlByKey = new Map();
  for (const r of bowlRows) {
    if (r.seasonYear == null || r.sewn == null || r.sgnm == null) continue;
    const name = String(r.bnme ?? "").trim();
    if (!name) continue;
    bowlByKey.set(`${r.seasonYear}|${r.sewn}|${r.sgnm}`, name);
  }
  return bowlByKey;
}

export function getSeasonBowlName(bowlByKey, seasonYearValue, sewnValue, sgnmValue) {
  if (seasonYearValue == null || sewnValue == null || sgnmValue == null) return "";
  return bowlByKey.get(`${seasonYearValue}|${sewnValue}|${sgnmValue}`) || "";
}
