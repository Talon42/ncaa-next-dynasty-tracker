function toIntOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function buildTeamSeasonWinLossMap(games) {
  const map = new Map();

  for (const g of games || []) {
    const seasonYear = Number(g.seasonYear);
    if (!Number.isFinite(seasonYear)) continue;

    const hs = g.homeScore;
    const as = g.awayScore;
    if (hs == null || as == null) continue;

    const homeKey = `${seasonYear}|${String(g.homeTgid ?? "")}`;
    const awayKey = `${seasonYear}|${String(g.awayTgid ?? "")}`;

    const homeRec = map.get(homeKey) || { w: 0, l: 0 };
    const awayRec = map.get(awayKey) || { w: 0, l: 0 };

    if (Number(hs) > Number(as)) {
      homeRec.w += 1;
      awayRec.l += 1;
    } else if (Number(hs) < Number(as)) {
      homeRec.l += 1;
      awayRec.w += 1;
    }

    map.set(homeKey, homeRec);
    map.set(awayKey, awayRec);
  }

  return map;
}

export function computeCoachCareerBases({ dynastyId, coachRows }) {
  const rows = Array.isArray(coachRows) ? coachRows : [];
  if (!rows.length) return [];

  let baseSeasonYear = null;
  const ccids = new Set();

  for (const r of rows) {
    if (r?.dynastyId !== dynastyId) continue;
    const yr = Number(r.seasonYear);
    if (Number.isFinite(yr)) baseSeasonYear = baseSeasonYear == null ? yr : Math.min(baseSeasonYear, yr);
    const ccid = String(r.ccid ?? "");
    if (ccid) ccids.add(ccid);
  }

  if (baseSeasonYear == null) return [];

  const baseCoachByCcid = new Map(
    rows
      .filter((r) => r?.dynastyId === dynastyId && Number(r.seasonYear) === baseSeasonYear)
      .map((r) => [String(r.ccid ?? ""), r])
  );

  const baseRows = [];
  for (const ccid of ccids) {
    const source = baseCoachByCcid.get(ccid) || null;
    baseRows.push({
      dynastyId,
      ccid,
      baseSeasonYear,
      baseWins: toIntOrZero(source?.careerWins),
      baseLosses: toIntOrZero(source?.careerLosses),
    });
  }

  return baseRows;
}

export function computeCoachCareerRecord({
  coachSeasons,
  teamSeasonWinLossByKey,
  baseSeasonYear,
  baseWins,
  baseLosses,
  asOfSeasonYear,
}) {
  const wins = toIntOrZero(baseWins);
  const losses = toIntOrZero(baseLosses);

  const cutoff = Number(asOfSeasonYear);
  const baseYear = Number(baseSeasonYear);

  if (!Number.isFinite(cutoff) || !Number.isFinite(baseYear)) {
    return { wins, losses };
  }

  let w = wins;
  let l = losses;

  for (const s of coachSeasons || []) {
    const yr = Number(s?.seasonYear);
    if (!Number.isFinite(yr) || yr <= baseYear || yr > cutoff) continue;

    const tgid = String(s?.tgid ?? "");
    if (!tgid || tgid === "511") continue;

    const rec = teamSeasonWinLossByKey?.get(`${yr}|${tgid}`) || null;
    if (!rec) continue;
    w += toIntOrZero(rec.w);
    l += toIntOrZero(rec.l);
  }

  return { wins: w, losses: l };
}

export function computeCoachTeamRecord({ coachSeasons, teamSeasonWinLossByKey, tgid }) {
  const teamId = String(tgid ?? "");
  if (!teamId || teamId === "511") return { wins: 0, losses: 0 };

  let w = 0;
  let l = 0;

  for (const s of coachSeasons || []) {
    if (String(s?.tgid ?? "") !== teamId) continue;
    const yr = Number(s?.seasonYear);
    if (!Number.isFinite(yr)) continue;
    const rec = teamSeasonWinLossByKey?.get(`${yr}|${teamId}`) || null;
    if (!rec) continue;
    w += toIntOrZero(rec.w);
    l += toIntOrZero(rec.l);
  }

  return { wins: w, losses: l };
}
