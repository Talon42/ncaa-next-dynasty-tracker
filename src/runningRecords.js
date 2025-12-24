export function formatRecord({ w, l, t }) {
  if (!Number.isFinite(w) || !Number.isFinite(l)) return "-";
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export function buildRunningRecords({ games, confByTgid }) {
  if (!games || !games.length) {
    return { getRecordAtWeek: () => null };
  }
  const byWeek = new Map();
  const weeks = Array.from(new Set(games.map((g) => Number(g.week)).filter(Number.isFinite))).sort((a, b) => a - b);
  let lastSnapshot = new Map();

  for (const week of weeks) {
    const next = new Map();
    for (const [key, rec] of lastSnapshot.entries()) {
      next.set(key, { ...rec });
    }

    const weekGames = games.filter((g) => Number(g.week) === week);
    for (const g of weekGames) {
      const hasScore = g.homeScore != null && g.awayScore != null;
      if (!hasScore) continue;

      const homeId = String(g.homeTgid);
      const awayId = String(g.awayTgid);
      if (!next.has(homeId)) next.set(homeId, { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 });
      if (!next.has(awayId)) next.set(awayId, { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 });

      const homeRec = next.get(homeId);
      const awayRec = next.get(awayId);
      const hs = Number(g.homeScore);
      const as = Number(g.awayScore);

      if (hs > as) {
        homeRec.w += 1;
        awayRec.l += 1;
      } else if (hs < as) {
        homeRec.l += 1;
        awayRec.w += 1;
      } else {
        homeRec.t += 1;
        awayRec.t += 1;
      }

      const homeConf = confByTgid.get(homeId);
      const awayConf = confByTgid.get(awayId);
      if (homeConf && awayConf && homeConf === awayConf) {
        if (hs > as) {
          homeRec.cw += 1;
          awayRec.cl += 1;
        } else if (hs < as) {
          homeRec.cl += 1;
          awayRec.cw += 1;
        } else {
          homeRec.ct += 1;
          awayRec.ct += 1;
        }
      }
    }

    byWeek.set(week, next);
    lastSnapshot = next;
  }

  const getRecordAtWeek = (tgid, week) => {
    if (week == null) return null;
    const weekMap = byWeek.get(Number(week));
    return weekMap ? weekMap.get(String(tgid)) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 } : null;
  };

  return { getRecordAtWeek };
}
