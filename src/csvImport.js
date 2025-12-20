import Papa from "papaparse";
import { db, ensureDefaultDynasty } from "./db";

function parseCsvText(text) {
  const res = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (res.errors?.length) {
    const first = res.errors[0];
    throw new Error(first?.message || "CSV parse error");
  }

  return res.data;
}

function requireColumns(rows, required, label) {
  if (!rows.length) throw new Error(`${label} has no rows.`);
  const cols = Object.keys(rows[0] || {});
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) throw new Error(`${label} missing required columns: ${missing.join(", ")}`);
}

function getTypeFromName(fileName) {
  // Only last 4 chars before ".csv" matter (per spec)
  // Example: "BASLUS-21214DDyn1 - TEAM.csv" -> TEAM
  const m = fileName.match(/([A-Za-z0-9]{4})\.csv$/i);
  return m ? m[1].toUpperCase() : null;
}

export async function seasonExists({ dynastyId, seasonYear }) {
  const count = await db.games.where({ dynastyId, seasonYear }).count();
  return count > 0;
}

export async function importSeasonBatch({ seasonYear, files }) {
  const dynasty = await ensureDefaultDynasty();
  const year = Number(seasonYear);

  if (!Number.isFinite(year)) throw new Error("Season year must be a number.");
  if (!files?.length) throw new Error("Please select CSV files to upload.");

  // Map by the 4-char suffix type
  const byType = {};
  for (const f of files) {
    const t = getTypeFromName(f.name);
    if (t) byType[t] = f;
  }

  // Phase 1 required set
  const requiredTypes = ["TEAM", "SCHD"];
  const missingTypes = requiredTypes.filter((t) => !byType[t]);
  if (missingTypes.length) {
    throw new Error(`Missing required CSV(s): ${missingTypes.join(", ")}. Required: TEAM and SCHD.`);
  }

  // Read + parse
  const [teamText, schdText] = await Promise.all([byType.TEAM.text(), byType.SCHD.text()]);
  const teamRows = parseCsvText(teamText);
  const schdRows = parseCsvText(schdText);

  // IMPORTANT: In your actual TEAM export, the stable team id is TEZ1 (TGID equivalent)
  requireColumns(teamRows, ["TEZ1", "TDNA", "TMNA"], "TEAM");
  requireColumns(schdRows, ["GATG", "GHTG", "GASC", "GHSC", "SEWN"], "SCHD");

  // Transform TEAM rows -> team season snapshots
  const teamSeasons = teamRows.map((r) => ({
    dynastyId: dynasty.id,
    seasonYear: year,
    tgid: String(r.TEZ1),
    tdna: String(r.TDNA ?? "").trim(),
    tmna: String(r.TMNA ?? "").trim(),
  }));

  // Stable teams identity table (just dynastyId+tgid)
  const teams = teamSeasons.map((t) => ({
    dynastyId: dynasty.id,
    tgid: t.tgid,
  }));

  // Transform schedule -> games
  // NOTE: SCHD SEWN appears 0-based in your file (0..22). We store 0-based and display +1.
  const games = schdRows.map((r) => {
    const awayScore = Number(r.GASC);
    const homeScore = Number(r.GHSC);
    const week0 = Number(r.SEWN);

    return {
      dynastyId: dynasty.id,
      seasonYear: year,
      week: Number.isFinite(week0) ? week0 : 0,
      homeTgid: String(r.GHTG),
      awayTgid: String(r.GATG),
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
    };
  });

  // Overwrite ONLY this season year (per spec)
  await db.transaction("rw", db.teamSeasons, db.games, db.teams, db.dynasties, async () => {
    await db.teamSeasons.where({ dynastyId: dynasty.id, seasonYear: year }).delete();
    await db.games.where({ dynastyId: dynasty.id, seasonYear: year }).delete();

    await db.teams.bulkPut(teams);
    await db.teamSeasons.bulkPut(teamSeasons);
    await db.games.bulkPut(games);

    // Option A: currentYear advances only if uploaded year >= currentYear
    const d = await db.dynasties.get(dynasty.id);
    if (d && year >= Number(d.currentYear)) {
      await db.dynasties.update(dynasty.id, { currentYear: year + 1 });
    }
  });

  return { dynastyId: dynasty.id, seasonYear: year, teams: teamSeasons.length, games: games.length };
}
