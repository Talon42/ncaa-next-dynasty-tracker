import { db } from "./db";

function pickLatestRows(rows, keyOf) {
  const latestByKey = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const yr = Number(row.seasonYear);
    const existing = latestByKey.get(key);
    if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
      latestByKey.set(key, row);
    }
  }
  return Array.from(latestByKey.values());
}

export async function rebuildLatestSnapshotsForDynasty({ dynastyId }) {
  if (!dynastyId) return;

  const [teamRows, coachRows, playerRows] = await Promise.all([
    db.teamSeasons.where({ dynastyId }).toArray(),
    db.coaches.where({ dynastyId }).toArray(),
    db.playerSeasonStats.where({ dynastyId }).toArray(),
  ]);

  const latestTeams = pickLatestRows(teamRows, (row) => {
    const tgid = String(row.tgid ?? "");
    return tgid ? `${dynastyId}|${tgid}` : null;
  });
  const latestCoaches = pickLatestRows(coachRows, (row) => {
    const ccid = String(row.ccid ?? "");
    return ccid ? `${dynastyId}|${ccid}` : null;
  });
  const latestPlayers = pickLatestRows(
    playerRows.map((row) => ({
      dynastyId,
      playerUid: row.playerUid,
      seasonYear: row.seasonYear ?? null,
      tgid: row.tgid ?? null,
      pgid: row.pgid ?? null,
      position: row.position ?? null,
    })),
    (row) => {
      const playerUid = String(row.playerUid ?? "");
      return playerUid ? `${dynastyId}|${playerUid}` : null;
    }
  );

  await db.transaction(
    "rw",
    db.latestTeamSeasons,
    db.latestCoaches,
    db.latestPlayerSeasons,
    async () => {
      await db.latestTeamSeasons.where("dynastyId").equals(dynastyId).delete();
      await db.latestCoaches.where("dynastyId").equals(dynastyId).delete();
      await db.latestPlayerSeasons.where("dynastyId").equals(dynastyId).delete();

      if (latestTeams.length) await db.latestTeamSeasons.bulkPut(latestTeams);
      if (latestCoaches.length) await db.latestCoaches.bulkPut(latestCoaches);
      if (latestPlayers.length) await db.latestPlayerSeasons.bulkPut(latestPlayers);
    }
  );
}
