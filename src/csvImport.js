import Papa from "papaparse";
import { db, getDynasty } from "./db";
import { upsertTeamLogosFromSeasonTeams } from "./logoService";

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
  const requiredTypes = ["TEAM", "SCHD"];
  const missingTypes = requiredTypes.filter((t) => !byType[t]);
  if (missingTypes.length) {
    throw new Error(`Missing required CSV(s): ${missingTypes.join(", ")}. Required: TEAM and SCHD.`);
  }

  const [teamText, schdText] = await Promise.all([byType.TEAM.text(), byType.SCHD.text()]);
  const teamRows = parseCsvText(teamText);
  const schdRows = parseCsvText(schdText);

  // Contract (confirmed headers)
  requireColumns(teamRows, ["TGID", "CGID", "TDNA", "TMNA"], "TEAM");
  requireColumns(schdRows, ["GATG", "GHTG", "GASC", "GHSC", "SEWN"], "SCHD");

  const teamSeasons = teamRows.map((r) => ({
    dynastyId,
    seasonYear: year,
    tgid: normId(r.TGID),
    cgid: normId(r.CGID), // conference id (season snapshot; supports realignment)
    tdna: String(r.TDNA ?? "").trim(),
    tmna: String(r.TMNA ?? "").trim(),
  }));

  const teams = teamSeasons.map((t) => ({ dynastyId, tgid: t.tgid }));

  const games = schdRows.map((r) => {
    const week = Number(String(r.SEWN ?? "").trim()); // supports 0..22
    const awayScore = Number(String(r.GASC ?? "").trim());
    const homeScore = Number(String(r.GHSC ?? "").trim());

    return {
      dynastyId,
      seasonYear: year,
      week: Number.isFinite(week) ? week : 0,
      homeTgid: normId(r.GHTG),
      awayTgid: normId(r.GATG),
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
    };
  });

  await db.transaction("rw", db.teamSeasons, db.games, db.teams, db.dynasties, async () => {
    // Overwrite ONLY this season year
    await db.teamSeasons.where({ dynastyId, seasonYear: year }).delete();
    await db.games.where({ dynastyId, seasonYear: year }).delete();

    await db.teams.bulkPut(teams);
    await db.teamSeasons.bulkPut(teamSeasons);
    await db.games.bulkPut(games);

    // Option A currentYear advance
    const d = await db.dynasties.get(dynastyId);
    if (d && year >= Number(d.currentYear)) {
      await db.dynasties.update(dynastyId, { currentYear: year + 1 });
    }
  });

  // ✅ Silent logo mapping step (no UI required)
  // If the bundled CSV doesn't exist, it does nothing.
  try {
    await upsertTeamLogosFromSeasonTeams({ dynastyId, seasonYear: year });
  } catch {
    // stay silent per your preference
  }

  return { dynastyId, seasonYear: year, teams: teamSeasons.length, games: games.length };
}
