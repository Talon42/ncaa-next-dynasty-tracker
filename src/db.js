import Dexie from "dexie";

export const db = new Dexie("dynasty-tracker-v1");

// v1
db.version(1).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
});

// v2 (settings)
db.version(2).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",
});

// v3 (logos)
db.version(3).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",

  // Base logos from bundled CSV keyed by normalized team name (global, not per dynasty)
  logoBaseByName: "nameKey",

  // Resolved logo per dynasty + TGID (what schedule will use)
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",

  // Optional manual overrides per dynasty + TGID (future UI)
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
});

// v4 (team stats)
db.version(4).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",

  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",

  // TSSE season snapshot per team
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});

// v5 (performance indexes)
db.version(5).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",

  // Add indexes to fetch a team's games without scanning the whole dynasty
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",

  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});

// v6 (rebuild indexes) — same schema as v5
// NOTE: If you previously deployed a corrupted schema, v7 below forces a rebuild with the corrected schema.
db.version(6).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});


// v7 (force rebuild with corrected schema) — same schema as v6
db.version(7).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});


// v8 (postseason bowl metadata)
db.version(8).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
});

// v9 (coaches)
db.version(9).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
});

// v10 (coach quotes)
db.version(10).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
});

// v11 (coach career baselines)
db.version(11)
  .stores({
    dynasties: "id, name, startYear, currentYear",
    teams: "[dynastyId+tgid], dynastyId, tgid",
    teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
    games:
      "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
    settings: "key",
    logoBaseByName: "nameKey",
    teamLogos: "[dynastyId+tgid], dynastyId, tgid",
    logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
    teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
    bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
    coaches:
      "[dynastyId+seasonYear+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
    coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
    coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  })
  .upgrade(async (tx) => {
    const coachRows = await tx.table("coaches").toArray();
    if (!coachRows.length) return;

    const rowsByDynasty = new Map();
    for (const r of coachRows) {
      const dynastyId = r.dynastyId;
      if (!dynastyId) continue;
      const list = rowsByDynasty.get(dynastyId) || [];
      list.push(r);
      rowsByDynasty.set(dynastyId, list);
    }

    const baseRows = [];

    for (const [dynastyId, list] of rowsByDynasty.entries()) {
      let baseSeasonYear = null;
      const ccids = new Set();

      for (const r of list) {
        const yr = Number(r.seasonYear);
        if (Number.isFinite(yr)) baseSeasonYear = baseSeasonYear == null ? yr : Math.min(baseSeasonYear, yr);
        const ccid = String(r.ccid ?? "");
        if (ccid) ccids.add(ccid);
      }

      if (baseSeasonYear == null) continue;

      const baseCoachByCcid = new Map(
        list
          .filter((r) => Number(r.seasonYear) === baseSeasonYear)
          .map((r) => [String(r.ccid ?? ""), r])
      );

      for (const ccid of ccids) {
        const source = baseCoachByCcid.get(ccid) || null;
        const baseWins = Number(source?.careerWins);
        const baseLosses = Number(source?.careerLosses);

        baseRows.push({
          dynastyId,
          ccid,
          baseSeasonYear,
          baseWins: Number.isFinite(baseWins) ? baseWins : 0,
          baseLosses: Number.isFinite(baseLosses) ? baseLosses : 0,
        });
      }
    }

    if (baseRows.length) {
      await tx.table("coachCareerBases").bulkPut(baseRows);
    }
  });

// v12 (player stats + identities)
db.version(12).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",

  // Derived per-season player stats index
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",

  // Stable identity mapping across seasons
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid], dynastyId, seasonYear, pgid, playerUid",
});

// v13 (player awards)
db.version(13).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid], dynastyId, seasonYear, pgid, playerUid",
  playerAllAmericans:
    "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid",
});

// v14 (player awards)
db.version(14).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid], dynastyId, seasonYear, pgid, playerUid",
  playerAllAmericans:
    "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid",
  playerAwards:
    "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid, awardKey",
});

// v15 (index optimizations)
db.version(15).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons:
    "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+seasonYear],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear], dynastyId, seasonYear, pgid, playerUid",
  playerAllAmericans:
    "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid",
  playerAwards:
    "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid, awardKey",
});

// v16 (drop unused player info/raw stat tables)
db.version(16).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons:
    "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+seasonYear],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear], dynastyId, seasonYear, pgid, playerUid",
  playerAllAmericans:
    "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid",
  playerAwards:
    "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid], dynastyId, seasonYear, playerUid, pgid, awardKey",
});

// v17 (season-scope indexes for remaining tables)
db.version(17).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons:
    "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+seasonYear],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm],[dynastyId+seasonYear], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear], dynastyId, seasonYear, pgid, playerUid",
  playerAllAmericans:
    "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid",
  playerAwards:
    "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid, awardKey",
});

// v18 (latest snapshot tables for search performance)
db.version(18)
  .stores({
    dynasties: "id, name, startYear, currentYear",
    teams: "[dynastyId+tgid], dynastyId, tgid",
    teamSeasons:
      "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear],[dynastyId+tgid], dynastyId, seasonYear, tgid",
    games:
      "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+seasonYear],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
    settings: "key",
    logoBaseByName: "nameKey",
    teamLogos: "[dynastyId+tgid], dynastyId, tgid",
    logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
    teamStats: "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear], dynastyId, seasonYear, tgid",
    bowlGames: "[dynastyId+seasonYear+sewn+sgnm],[dynastyId+seasonYear], dynastyId, seasonYear, sewn, sgnm",
    coaches:
      "[dynastyId+seasonYear+ccid],[dynastyId+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
    coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
    coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
    playerSeasonStats:
      "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
    playerIdentities:
      "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
    playerIdentitySeasonMap:
      "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear], dynastyId, seasonYear, pgid, playerUid",
    playerAllAmericans:
      "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid",
    playerAwards:
      "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid, awardKey",

    // Latest snapshots (one row per entity)
    latestTeamSeasons: "[dynastyId+tgid], dynastyId, tgid, seasonYear",
    latestCoaches: "[dynastyId+ccid], dynastyId, ccid, seasonYear",
    latestPlayerSeasons: "[dynastyId+playerUid], dynastyId, playerUid, seasonYear, tgid, pgid",
  })
  .upgrade(async (tx) => {
    const [teamRows, coachRows, playerRows] = await Promise.all([
      tx.table("teamSeasons").toArray(),
      tx.table("coaches").toArray(),
      tx.table("playerSeasonStats").toArray(),
    ]);

    const latestTeams = new Map();
    for (const row of teamRows) {
      const dynastyId = row.dynastyId;
      const tgid = String(row.tgid ?? "");
      if (!dynastyId || !tgid) continue;
      const key = `${dynastyId}|${tgid}`;
      const yr = Number(row.seasonYear);
      const existing = latestTeams.get(key);
      if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
        latestTeams.set(key, row);
      }
    }

    const latestCoaches = new Map();
    for (const row of coachRows) {
      const dynastyId = row.dynastyId;
      const ccid = String(row.ccid ?? "");
      if (!dynastyId || !ccid) continue;
      const key = `${dynastyId}|${ccid}`;
      const yr = Number(row.seasonYear);
      const existing = latestCoaches.get(key);
      if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
        latestCoaches.set(key, row);
      }
    }

    const latestPlayers = new Map();
    for (const row of playerRows) {
      const dynastyId = row.dynastyId;
      const playerUid = String(row.playerUid ?? "");
      if (!dynastyId || !playerUid) continue;
      const key = `${dynastyId}|${playerUid}`;
      const yr = Number(row.seasonYear);
      const existing = latestPlayers.get(key);
      if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
        latestPlayers.set(key, {
          dynastyId,
          playerUid,
          seasonYear: row.seasonYear ?? null,
          tgid: row.tgid ?? null,
          pgid: row.pgid ?? null,
        });
      }
    }

    const teamList = Array.from(latestTeams.values());
    const coachList = Array.from(latestCoaches.values());
    const playerList = Array.from(latestPlayers.values());

    if (teamList.length) await tx.table("latestTeamSeasons").bulkPut(teamList);
    if (coachList.length) await tx.table("latestCoaches").bulkPut(coachList);
    if (playerList.length) await tx.table("latestPlayerSeasons").bulkPut(playerList);
  });

// v19 (latest player snapshot includes position)
db.version(19)
  .stores({
    dynasties: "id, name, startYear, currentYear",
    teams: "[dynastyId+tgid], dynastyId, tgid",
    teamSeasons:
      "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear],[dynastyId+tgid], dynastyId, seasonYear, tgid",
    games:
      "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+seasonYear],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
    settings: "key",
    logoBaseByName: "nameKey",
    teamLogos: "[dynastyId+tgid], dynastyId, tgid",
    logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
    teamStats: "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear], dynastyId, seasonYear, tgid",
    bowlGames: "[dynastyId+seasonYear+sewn+sgnm],[dynastyId+seasonYear], dynastyId, seasonYear, sewn, sgnm",
    coaches:
      "[dynastyId+seasonYear+ccid],[dynastyId+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
    coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
    coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
    playerSeasonStats:
      "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid",
    playerIdentities:
      "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
    playerIdentitySeasonMap:
      "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear], dynastyId, seasonYear, pgid, playerUid",
    playerAllAmericans:
      "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid",
    playerAwards:
      "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid, awardKey",

    latestTeamSeasons: "[dynastyId+tgid], dynastyId, tgid, seasonYear",
    latestCoaches: "[dynastyId+ccid], dynastyId, ccid, seasonYear",
    latestPlayerSeasons:
      "[dynastyId+playerUid], dynastyId, playerUid, seasonYear, tgid, pgid, position",
  })
  .upgrade(async (tx) => {
    const [teamRows, coachRows, playerRows] = await Promise.all([
      tx.table("teamSeasons").toArray(),
      tx.table("coaches").toArray(),
      tx.table("playerSeasonStats").toArray(),
    ]);

    const latestTeams = new Map();
    for (const row of teamRows) {
      const dynastyId = row.dynastyId;
      const tgid = String(row.tgid ?? "");
      if (!dynastyId || !tgid) continue;
      const key = `${dynastyId}|${tgid}`;
      const yr = Number(row.seasonYear);
      const existing = latestTeams.get(key);
      if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
        latestTeams.set(key, row);
      }
    }

    const latestCoaches = new Map();
    for (const row of coachRows) {
      const dynastyId = row.dynastyId;
      const ccid = String(row.ccid ?? "");
      if (!dynastyId || !ccid) continue;
      const key = `${dynastyId}|${ccid}`;
      const yr = Number(row.seasonYear);
      const existing = latestCoaches.get(key);
      if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
        latestCoaches.set(key, row);
      }
    }

    const latestPlayers = new Map();
    for (const row of playerRows) {
      const dynastyId = row.dynastyId;
      const playerUid = String(row.playerUid ?? "");
      if (!dynastyId || !playerUid) continue;
      const key = `${dynastyId}|${playerUid}`;
      const yr = Number(row.seasonYear);
      const existing = latestPlayers.get(key);
      if (!existing || (Number.isFinite(yr) && yr > Number(existing.seasonYear))) {
        latestPlayers.set(key, {
          dynastyId,
          playerUid,
          seasonYear: row.seasonYear ?? null,
          tgid: row.tgid ?? null,
          pgid: row.pgid ?? null,
          position: row.position ?? null,
        });
      }
    }

    const teamList = Array.from(latestTeams.values());
    const coachList = Array.from(latestCoaches.values());
    const playerList = Array.from(latestPlayers.values());

    if (teamList.length) await tx.table("latestTeamSeasons").bulkPut(teamList);
    if (coachList.length) await tx.table("latestCoaches").bulkPut(coachList);
    if (playerList.length) await tx.table("latestPlayerSeasons").bulkPut(playerList);
  });

// v20 (player season indexes for faster filtering)
db.version(20).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons:
    "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+seasonYear],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid],[dynastyId+seasonYear], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm],[dynastyId+seasonYear], dynastyId, seasonYear, sewn, sgnm",
  coaches:
    "[dynastyId+seasonYear+ccid],[dynastyId+ccid],[dynastyId+seasonYear],[dynastyId+seasonYear+tgid], dynastyId, seasonYear, ccid, tgid",
  coachQuotes: "[dynastyId+ccid], dynastyId, ccid",
  coachCareerBases: "[dynastyId+ccid], dynastyId, ccid, baseSeasonYear",
  playerSeasonStats:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear+tgid],[dynastyId+seasonYear+position],[dynastyId+seasonYear],[dynastyId+playerUid], dynastyId, seasonYear, pgid, playerUid, tgid, position",
  playerIdentities:
    "[dynastyId+playerUid],[dynastyId+fingerprint], dynastyId, playerUid, fingerprint",
  playerIdentitySeasonMap:
    "[dynastyId+seasonYear+pgid],[dynastyId+seasonYear], dynastyId, seasonYear, pgid, playerUid",
  playerAllAmericans:
    "[dynastyId+seasonYear+playerUid],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid",
  playerAwards:
    "[dynastyId+seasonYear+playerUid+awardKey],[dynastyId+playerUid],[dynastyId+seasonYear], dynastyId, seasonYear, playerUid, pgid, awardKey",

  latestTeamSeasons: "[dynastyId+tgid], dynastyId, tgid, seasonYear",
  latestCoaches: "[dynastyId+ccid], dynastyId, ccid, seasonYear",
  latestPlayerSeasons:
    "[dynastyId+playerUid], dynastyId, playerUid, seasonYear, tgid, pgid, position",
});

const ACTIVE_KEY = "activeDynastyId";

export async function listDynasties() {
  return db.dynasties.toArray();
}

export async function getActiveDynastyId() {
  const row = await db.settings.get(ACTIVE_KEY);
  const id = row?.value ?? null;
  if (!id) return null;

  const exists = await db.dynasties.get(id);
  if (!exists) return null;

  return id;
}

export async function setActiveDynastyId(idOrNull) {
  await db.settings.put({ key: ACTIVE_KEY, value: idOrNull ?? null });
}

export async function createDynasty({ name, startYear }) {
  const yr = Number(startYear);
  if (!name?.trim()) throw new Error("Dynasty name is required.");
  if (!Number.isFinite(yr)) throw new Error("Start year is invalid.");

  const id = crypto.randomUUID();
  await db.dynasties.add({
    id,
    name: name.trim(),
    startYear: yr,
    currentYear: yr,
  });

  await setActiveDynastyId(id);
  return id;
}

export async function getDynasty(id) {
  if (!id) return null;
  return db.dynasties.get(id);
}

export async function deleteDynasty(id) {
  // Delete dynasty itself
  await db.dynasties.delete(id);

  // Delete all related records
  await Promise.all([
    db.teams.where("dynastyId").equals(id).delete(),
    db.teamSeasons.where("dynastyId").equals(id).delete(),
    db.games.where("dynastyId").equals(id).delete(),
    db.teamStats.where("dynastyId").equals(id).delete(),
    db.teamLogos.where("dynastyId").equals(id).delete(),
    db.logoOverrides.where("dynastyId").equals(id).delete(),
    db.bowlGames.where("dynastyId").equals(id).delete(),
    db.coaches.where("dynastyId").equals(id).delete(),
    db.coachQuotes.where("dynastyId").equals(id).delete(),
    db.coachCareerBases.where("dynastyId").equals(id).delete(),
    db.playerSeasonStats.where("dynastyId").equals(id).delete(),
    db.playerIdentities.where("dynastyId").equals(id).delete(),
    db.playerIdentitySeasonMap.where("dynastyId").equals(id).delete(),
    db.playerAllAmericans.where("dynastyId").equals(id).delete(),
    db.playerAwards.where("dynastyId").equals(id).delete(),
    db.latestTeamSeasons.where("dynastyId").equals(id).delete(),
    db.latestCoaches.where("dynastyId").equals(id).delete(),
    db.latestPlayerSeasons.where("dynastyId").equals(id).delete(),
  ]);

  const active = await getActiveDynastyId();
  if (active === id) {
    await setActiveDynastyId(null);
  }

  const remaining = await db.dynasties.count();
  if (remaining === 0) {
    // If no dynasties remain, wipe IndexedDB storage entirely to avoid leftovers.
    db.close();
    const result = await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(db.name);
      req.onsuccess = () => resolve({ clearedAll: true, blocked: false });
      req.onerror = () => resolve({ clearedAll: false, blocked: false, error: req.error });
      req.onblocked = () => resolve({ clearedAll: false, blocked: true });
    });
    return result;
  }
  return { clearedAll: false };
}
