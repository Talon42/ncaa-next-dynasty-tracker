import Papa from "papaparse";
import { db, getDynasty } from "./db";
import { ensureCoachQuotesForSeason } from "./coachQuotes";
import { upsertTeamLogosFromSeasonTeams } from "./logoService";
import { computeCoachCareerBases } from "./coachRecords";

function parseCsvText(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (res.errors?.length) throw new Error(res.errors[0]?.message || "CSV parse error");
  return res.data;
}

function requireColumns(rows, required, label) {
  if (!rows.length) throw new Error(`${label} has no rows.`);
  const cols = Object.keys(rows[0] || {});
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) throw new Error(`${label} missing required columns: ${missing.join(", ")}`);
}

function getTypeFromName(fileName) {
  const m = fileName.match(/([A-Za-z0-9]{4})\.csv$/i);
  return m ? m[1].toUpperCase() : null;
}

function normId(x) {
  const s = String(x ?? "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? String(Math.trunc(n)) : s;
}
function dedupeCoachRows(rows) {
  const seen = new Map();
  for (const row of rows || []) {
    const ccid = String(row.CCID ?? "").trim();
    const first = String(row.CLFN ?? "").trim();
    const last = String(row.CLLN ?? "").trim();
    const nameKey = `${first}|${last}`.toLowerCase();

    if (!ccid) {
      if (!nameKey || nameKey === "|") continue;
      const key = `name:${nameKey}`;
      if (!seen.has(key)) seen.set(key, row);
      continue;
    }

    const key = `ccid:${ccid}|${nameKey}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
      continue;
    }

    const existingTgid = String(existing.TGID ?? "").trim();
    const currentTgid = String(row.TGID ?? "").trim();
    const existingUnassigned = !existingTgid || existingTgid === "511";
    const currentUnassigned = !currentTgid || currentTgid === "511";

    if (existingUnassigned && !currentUnassigned) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}



export async function seasonExists({ dynastyId, seasonYear }) {
  const count = await db.games.where({ dynastyId, seasonYear }).count();
  return count > 0;
}

export async function importSeasonBatch({ dynastyId, seasonYear, files }) {
  const dynasty = await getDynasty(dynastyId);
  if (!dynasty) throw new Error("No active dynasty selected.");

  const year = Number(seasonYear);
  if (!Number.isFinite(year)) throw new Error("Season year must be a number.");
  if (!files?.length) throw new Error("Please select CSV files to upload.");

  const byType = {};
  for (const f of files) {
    const t = getTypeFromName(f.name);
    if (t) byType[t] = f;
  }

  // Mandatory set for now (and will remain mandatory)
  const requiredTypes = ["TEAM", "SCHD", "TSSE", "BOWL", "COCH"];
  const missingTypes = requiredTypes.filter((t) => !byType[t]);
  if (missingTypes.length) {
    throw new Error(
      `Missing required CSV(s): ${missingTypes.join(", ")}. Required: TEAM, SCHD, TSSE, BOWL, and COCH.`
    );
  }

  const [teamText, schdText, tsseText, bowlText, cochText] = await Promise.all([
    byType.TEAM.text(),
    byType.SCHD.text(),
    byType.TSSE.text(),
    byType.BOWL.text(),
    byType.COCH.text(),
  ]);

  const teamRows = parseCsvText(teamText);
  const schdRows = parseCsvText(schdText);
  const tsseRows = parseCsvText(tsseText);
  const bowlRows = parseCsvText(bowlText);
  const cochRowsRaw = parseCsvText(cochText);

  // Contract (confirmed headers)
  requireColumns(teamRows, ["TGID", "CGID", "TDNA", "TMNA", "TMPR"], "TEAM");
  requireColumns(schdRows, ["GATG", "GHTG", "GASC", "GHSC", "SEWN", "SGNM"], "SCHD");
  requireColumns(tsseRows, ["TGID"], "TSSE");
  requireColumns(bowlRows, ["SEWN", "SGNM", "BNME"], "BOWL");
  requireColumns(
    cochRowsRaw,
    ["CCID", "CLFN", "CLLN", "TGID", "CFUC", "CPRE", "CCPO", "CTOP", "CSWI", "CSLO", "CPID", "CDST", "COST"],
    "COCH"
  );

  const cochRows = dedupeCoachRows(cochRowsRaw);

  const teamSeasons = teamRows.map((r) => ({
    dynastyId,
    seasonYear: year,
    tgid: normId(r.TGID),
    cgid: normId(r.CGID), // conference id (season snapshot; supports realignment)
    tdna: String(r.TDNA ?? "").trim(),
    tmna: String(r.TMNA ?? "").trim(),
    tmpr: (() => {
      const n = Number(String(r.TMPR ?? "").trim());
      return Number.isFinite(n) ? n : null;
    })(),
  }));

  const teams = teamSeasons.map((t) => ({ dynastyId, tgid: t.tgid }));

  const games = schdRows.map((r) => {
    const week = Number(String(r.SEWN ?? "").trim()); // supports 0..22
    const stage = Number(String(r.SGNM ?? "").trim());
    const awayScore = Number(String(r.GASC ?? "").trim());
    const homeScore = Number(String(r.GHSC ?? "").trim());

    return {
      dynastyId,
      seasonYear: year,
      week: Number.isFinite(week) ? week : 0,
      sgnm: Number.isFinite(stage) ? stage : null,
      homeTgid: normId(r.GHTG),
      awayTgid: normId(r.GATG),
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
    };
  });

  function toNumberOrNull(v) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : null;
  }

  const teamStats = tsseRows.map((r) => {
    const tgid = normId(r.TGID);

    // Copy every TSSE column except TGID into a stats object
    const stats = {};

    for (const [k, v] of Object.entries(r)) {
      if (k === "TGID") continue;

      const rawKey = String(k ?? "").trim();
      if (!rawKey) continue;

      const lowerKey = rawKey.toLowerCase();

      // Parse value (same logic you already have)
      const num = toNumberOrNull(v);
      let parsed;
      if (num !== null) parsed = num;
      else {
        const s = String(v ?? "").trim();
        parsed = s ? s : null;
      }

      // Store original header key (preserves case-sensitive keys like tsTy)
      stats[rawKey] = parsed;

      // Also store lowercase alias (supports your UI lookups and normalization)
      if (lowerKey !== rawKey) {
        stats[lowerKey] = parsed;
      }
    }

    return {
      dynastyId,
      seasonYear: year,
      tgid,
      ...stats,
    };
  });

  const bowlGames = bowlRows.map((r) => {
    const sewn = Number(String(r.SEWN ?? "").trim());
    const sgnm = Number(String(r.SGNM ?? "").trim());

    return {
      dynastyId,
      seasonYear: year,
      sewn: Number.isFinite(sewn) ? sewn : null,
      sgnm: Number.isFinite(sgnm) ? sgnm : null,
      bnme: String(r.BNME ?? "").trim(),
    };
  });

  const coaches = cochRows.map((r) => ({
    dynastyId,
    seasonYear: year,
    ccid: normId(r.CCID),
    tgid: normId(r.TGID),
    firstName: String(r.CLFN ?? "").trim(),
    lastName: String(r.CLLN ?? "").trim(),
    isUser: Number(String(r.CFUC ?? "").trim()) === 1,
    hcPrestige: toNumberOrNull(r.CPRE),
    approval: toNumberOrNull(r.CCPO),
    storedTeamPrestige: toNumberOrNull(r.CTOP),
    seasonWins: toNumberOrNull(r.CSWI),
    seasonLosses: toNumberOrNull(r.CSLO),
    careerWins: toNumberOrNull(r.CCWI ?? r.ccwi),
    careerLosses: toNumberOrNull(r.CCLO ?? r.cclo),
    winningSeasons: toNumberOrNull(r.CCWS ?? r.ccws),
    top25Wins: toNumberOrNull(r.CTTW ?? r.cttw),
    top25Losses: toNumberOrNull(r.CTTL ?? r.cttl),
    conferenceTitles: toNumberOrNull(r.CCTW ?? r.cctw),
    nationalTitles: toNumberOrNull(r.CNTW ?? r.cntw),
    runPassTendency: toNumberOrNull(r.COTR ?? r.cotr),
    defenseRunPassTendency: toNumberOrNull(r.CDTR ?? r.cdtr),
    bowlWins: toNumberOrNull(r.CBLW ?? r.cblw),
    bowlLosses: toNumberOrNull(r.CBLL ?? r.cbll),
    contractYear: toNumberOrNull(r.CCYR ?? r.ccyr),
    contractLength: toNumberOrNull(r.CCFY ?? r.ccfy),
    playbookId: toNumberOrNull(r.CPID ?? r.cpid),
    baseDefenseId: toNumberOrNull(r.CDST ?? r.cdst),
    offenseTypeId: toNumberOrNull(r.COST ?? r.cost),
  }));

  await db.transaction(
    "rw",
    db.teamSeasons,
    db.games,
    db.teams,
    db.teamStats,
    db.bowlGames,
    db.coaches,
    db.coachCareerBases,
    db.dynasties,
    async () => {
      // Overwrite ONLY this season year
      await db.teamSeasons.where({ dynastyId, seasonYear: year }).delete();
      await db.games.where({ dynastyId, seasonYear: year }).delete();
      await db.teamStats.where({ dynastyId, seasonYear: year }).delete();
      await db.bowlGames.where({ dynastyId, seasonYear: year }).delete();
      await db.coaches.where({ dynastyId, seasonYear: year }).delete();

      await db.teams.bulkPut(teams);
      await db.teamSeasons.bulkPut(teamSeasons);
      await db.games.bulkPut(games);
      await db.teamStats.bulkPut(teamStats);
      await db.bowlGames.bulkPut(bowlGames);
      await db.coaches.bulkPut(coaches);

      const allCoachRows = await db.coaches.where({ dynastyId }).toArray();
      const baseRows = computeCoachCareerBases({ dynastyId, coachRows: allCoachRows });
      await db.coachCareerBases.where({ dynastyId }).delete();
      if (baseRows.length) await db.coachCareerBases.bulkPut(baseRows);

      // Option A currentYear advance
      const d = await db.dynasties.get(dynastyId);
      if (d && year >= Number(d.currentYear)) {
        await db.dynasties.update(dynastyId, { currentYear: year + 1 });
      }
    }
  );

  try {
    await ensureCoachQuotesForSeason({
      dynastyId,
      coachIds: coaches.map((c) => c.ccid),
    });
  } catch {
    // Coach quotes are optional; don't block imports if the file can't be read.
  }

  // ✅ Silent logo mapping step (no UI required)
  // If the bundled CSV doesn't exist, it does nothing.
  try {
    await upsertTeamLogosFromSeasonTeams({ dynastyId, seasonYear: year });
  } catch {
    // stay silent per your preference
  }

  return { dynastyId, seasonYear: year, teams: teamSeasons.length, games: games.length };
}
