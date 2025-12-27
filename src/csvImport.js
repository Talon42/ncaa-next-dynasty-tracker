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

function requireColumnsLoose(rows, required, label) {
  if (!rows.length) throw new Error(`${label} has no rows.`);
  const cols = Object.keys(rows[0] || {}).map((c) => String(c ?? "").toLowerCase());
  const missing = required.filter((c) => !cols.includes(String(c ?? "").toLowerCase()));
  if (missing.length) throw new Error(`${label} missing required columns: ${missing.join(", ")}`);
}

function requireColumnsLooseFromFields(fields, required, label) {
  if (!fields?.length) throw new Error(`${label} has no rows.`);
  const cols = fields.map((c) => String(c ?? "").toLowerCase());
  const missing = required.filter((c) => !cols.includes(String(c ?? "").toLowerCase()));
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

function normalizeTeamId(x) {
  const v = normId(x);
  if (!v || v === "0") return null;
  return v;
}

function calcTeamIdFromPgid(pgid) {
  const raw = Number(pgid);
  if (!Number.isFinite(raw)) return null;
  const tgid = Math.floor(raw / 70);
  return tgid > 0 ? String(tgid) : null;
}

function toNumberOrNull(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseRowWithNumbers(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    const s = String(v ?? "").trim();
    if (!s) {
      out[key] = null;
      continue;
    }
    const n = Number(s);
    out[key] = Number.isFinite(n) ? n : s;
  }
  return out;
}

function parseCsvFileStream(file, { label, requiredColumns, onRow }) {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    let checkedHeaders = false;
    let done = false;

    const finish = (err) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve();
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      step: (results, parser) => {
        if (results.errors?.length) {
          parser.abort();
          finish(new Error(results.errors[0]?.message || "CSV parse error"));
          return;
        }

        if (!checkedHeaders) {
          const fields = results.meta?.fields || Object.keys(results.data || {});
          if (requiredColumns?.length) {
            requireColumnsLooseFromFields(fields, requiredColumns, label);
          }
          checkedHeaders = true;
        }

        rowCount += 1;
        onRow(results.data);
      },
      complete: () => {
        if (!rowCount) {
          finish(new Error(`${label} has no rows.`));
          return;
        }
        finish();
      },
      error: (err) => finish(err),
    });
  });
}

function getRowValue(row, key) {
  if (!row) return null;
  if (row[key] !== undefined) return row[key];
  const target = String(key ?? "").toLowerCase();
  if (!target) return null;
  const found = Object.keys(row).find((k) => String(k ?? "").toLowerCase() === target);
  return found ? row[found] : null;
}

function toLowerKeyMap(row) {
  const lc = {};
  for (const [k, v] of Object.entries(row || {})) {
    lc[String(k ?? "").toLowerCase()] = v;
  }
  return lc;
}

function getRowValueFast(row, lc, key) {
  if (row[key] !== undefined) return row[key];
  return lc[String(key ?? "").toLowerCase()];
}

function safeDiv(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

function round1(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function normalizeNamePart(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePlayerRow(row, { dynastyId, seasonYear }) {
  const parsed = parseRowWithNumbers(row);
  const pgid = normId(getRowValue(row, "PGID"));
  const tgid = normalizeTeamId(getRowValue(row, "TGID")) || calcTeamIdFromPgid(pgid);
  return {
    dynastyId,
    seasonYear,
    pgid,
    tgid: tgid || null,
    ...parsed,
  };
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

function buildPlayerFingerprint(info) {
  const parts = [
    normalizeNamePart(info.firstName),
    normalizeNamePart(info.lastName),
    normalizeNamePart(info.hometown),
    normalizeNamePart(info.height),
    normalizeNamePart(info.weight),
    normalizeNamePart(info.position),
  ];

  const hasAny = parts.some((p) => p);
  return hasAny ? parts.join("|") : null;
}

function createPlayerStatsAccumulator({ dynastyId, seasonYear, existingIdentitiesByFingerprint }) {
  const playByPgid = new Map();
  const statsByPgid = new Map();

  const ensure = (pgid) => {
    let entry = statsByPgid.get(pgid);
    if (!entry) {
      const base = playByPgid.get(pgid) || {};
      entry = {
        pgid,
        tgid: base.tgid ?? null,
        gpSet: new Set(),
        off: {},
        def: {},
        kick: {},
        ret: {},
      };
      statsByPgid.set(pgid, entry);
    }
    return entry;
  };

  const addStat = (target, key, value) => {
    const n = toNumberOrNull(value);
    if (n == null) return;
    target[key] = (target[key] ?? 0) + n;
  };

  const addPlayRow = (row) => {
    const pgid = normId(getRowValue(row, "PGID"));
    if (!pgid) return;

    const info = {
      pgid,
      tgid: normalizeTeamId(getRowValue(row, "TGID")) || calcTeamIdFromPgid(pgid),
      firstName: String(getRowValue(row, "FirstName") ?? "").trim(),
      lastName: String(getRowValue(row, "LastName") ?? "").trim(),
      hometown: String(getRowValue(row, "RCHD") ?? "").trim(),
      height: toNumberOrNull(getRowValue(row, "PHGT")),
      weight: toNumberOrNull(getRowValue(row, "PWGT")),
      jersey: toNumberOrNull(getRowValue(row, "PJEN")),
      position: toNumberOrNull(getRowValue(row, "PPOS")),
      classYear: toNumberOrNull(getRowValue(row, "PYER")),
      overall: toNumberOrNull(getRowValue(row, "POVR")),
    };

    playByPgid.set(pgid, info);
    const entry = ensure(pgid);
    if (info.tgid) entry.tgid = info.tgid;
  };

  const addOffenseRow = (row) => {
    const lc = toLowerKeyMap(row);
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = normId(getRowValueFast(row, lc, "SGMP"));
    if (sgmp) entry.gpSet.add(sgmp);

    const tgid =
      normalizeTeamId(getRowValueFast(row, lc, "TGID")) || calcTeamIdFromPgid(pgid);
    if (!entry.tgid && tgid) entry.tgid = tgid;

    addStat(entry.off, "passComp", getRowValueFast(row, lc, "sacm"));
    addStat(entry.off, "passAtt", getRowValueFast(row, lc, "saat"));
    addStat(entry.off, "passYds", getRowValueFast(row, lc, "saya"));
    addStat(entry.off, "passTd", getRowValueFast(row, lc, "satd"));
    addStat(entry.off, "passInt", getRowValueFast(row, lc, "sain"));
    addStat(entry.off, "passSacks", getRowValueFast(row, lc, "sasa"));

    addStat(entry.off, "rushAtt", getRowValueFast(row, lc, "suat"));
    addStat(entry.off, "rushYds", getRowValueFast(row, lc, "suya"));
    addStat(entry.off, "rushTd", getRowValueFast(row, lc, "sutd"));
    addStat(entry.off, "rushFum", getRowValueFast(row, lc, "sufu"));
    addStat(entry.off, "rushYac", getRowValueFast(row, lc, "suyh"));
    addStat(entry.off, "rushBtk", getRowValueFast(row, lc, "subt"));
    addStat(entry.off, "rush20", getRowValueFast(row, lc, "su2y"));

    addStat(entry.off, "recvCat", getRowValueFast(row, lc, "scca"));
    addStat(entry.off, "recvYds", getRowValueFast(row, lc, "scya"));
    addStat(entry.off, "recvTd", getRowValueFast(row, lc, "sctd"));
    addStat(entry.off, "recvFum", getRowValueFast(row, lc, "sufu"));
    addStat(entry.off, "recvYac", getRowValueFast(row, lc, "scyc"));
    addStat(entry.off, "recvDrops", getRowValueFast(row, lc, "scdr"));
  };

  const addDefenseRow = (row) => {
    const lc = toLowerKeyMap(row);
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = normId(getRowValueFast(row, lc, "SGMP"));
    if (sgmp) entry.gpSet.add(sgmp);

    const tgid =
      normalizeTeamId(getRowValueFast(row, lc, "TGID")) || calcTeamIdFromPgid(pgid);
    if (!entry.tgid && tgid) entry.tgid = tgid;

    addStat(entry.def, "tkl", getRowValueFast(row, lc, "sdta"));
    addStat(entry.def, "tfl", getRowValueFast(row, lc, "sdtl"));
    addStat(entry.def, "sack", getRowValueFast(row, lc, "slsk"));
    addStat(entry.def, "int", getRowValueFast(row, lc, "ssin"));
    addStat(entry.def, "pdef", getRowValueFast(row, lc, "sdpd"));
    addStat(entry.def, "ff", getRowValueFast(row, lc, "slff"));
    addStat(entry.def, "fr", getRowValueFast(row, lc, "slfr"));
    addStat(entry.def, "dtd", getRowValueFast(row, lc, "ssdt"));
  };

  const addKickingRow = (row) => {
    const lc = toLowerKeyMap(row);
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = normId(getRowValueFast(row, lc, "SGMP"));
    if (sgmp) entry.gpSet.add(sgmp);

    const tgid =
      normalizeTeamId(getRowValueFast(row, lc, "TGID")) || calcTeamIdFromPgid(pgid);
    if (!entry.tgid && tgid) entry.tgid = tgid;

    addStat(entry.kick, "fgm", getRowValueFast(row, lc, "skfm"));
    addStat(entry.kick, "fga", getRowValueFast(row, lc, "skfa"));
    addStat(entry.kick, "fgLong", getRowValueFast(row, lc, "skfL"));
    addStat(entry.kick, "xpm", getRowValueFast(row, lc, "skem"));
    addStat(entry.kick, "xpa", getRowValueFast(row, lc, "skea"));

    addStat(entry.kick, "puntAtt", getRowValueFast(row, lc, "spat"));
    addStat(entry.kick, "puntYds", getRowValueFast(row, lc, "spya"));
    addStat(entry.kick, "puntLong", getRowValueFast(row, lc, "splN"));
    addStat(entry.kick, "puntIn20", getRowValueFast(row, lc, "sppt"));
    addStat(entry.kick, "puntBlocked", getRowValueFast(row, lc, "spbl"));
  };

  const addReturnRow = (row) => {
    const lc = toLowerKeyMap(row);
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = normId(getRowValueFast(row, lc, "SGMP"));
    if (sgmp) entry.gpSet.add(sgmp);

    const tgid =
      normalizeTeamId(getRowValueFast(row, lc, "TGID")) || calcTeamIdFromPgid(pgid);
    if (!entry.tgid && tgid) entry.tgid = tgid;

    addStat(entry.ret, "krAtt", getRowValueFast(row, lc, "srka"));
    addStat(entry.ret, "krYds", getRowValueFast(row, lc, "srky"));
    addStat(entry.ret, "krTd", getRowValueFast(row, lc, "srkt"));
    addStat(entry.ret, "krLong", getRowValueFast(row, lc, "srkL"));

    addStat(entry.ret, "prAtt", getRowValueFast(row, lc, "srpa"));
    addStat(entry.ret, "prYds", getRowValueFast(row, lc, "srpy"));
    addStat(entry.ret, "prTd", getRowValueFast(row, lc, "srpt"));
    addStat(entry.ret, "prLong", getRowValueFast(row, lc, "srpL"));
  };

  const finalize = () => {
    for (const pgid of playByPgid.keys()) {
      ensure(pgid);
    }

    const playerSeasonStats = [];
    const seasonIdentityMapRows = [];
    const newIdentities = [];

    for (const entry of statsByPgid.values()) {
      const info = playByPgid.get(entry.pgid) || {};
      const gp = entry.gpSet.size;

      const passComp = entry.off.passComp ?? null;
      const passAtt = entry.off.passAtt ?? null;
      const passYds = entry.off.passYds ?? null;
      const passTd = entry.off.passTd ?? null;
      const passInt = entry.off.passInt ?? null;
      const passSacks = entry.off.passSacks ?? null;

      const rushAtt = entry.off.rushAtt ?? null;
      const rushYds = entry.off.rushYds ?? null;
      const rushTd = entry.off.rushTd ?? null;
      const rushFum = entry.off.rushFum ?? null;
      const rushYac = entry.off.rushYac ?? null;
      const rushBtk = entry.off.rushBtk ?? null;
      const rush20 = entry.off.rush20 ?? null;

      const recvCat = entry.off.recvCat ?? null;
      const recvYds = entry.off.recvYds ?? null;
      const recvTd = entry.off.recvTd ?? null;
      const recvFum = entry.off.recvFum ?? null;
      const recvYac = entry.off.recvYac ?? null;
      const recvDrops = entry.off.recvDrops ?? null;

      const passPct = round1(safeDiv(passComp * 100, passAtt));
      const passYpg = round1(safeDiv(passYds, gp));
      const passQbr = round1(
        safeDiv(
          8.4 * (passYds ?? 0) + 330 * (passTd ?? 0) + 100 * (passComp ?? 0) - 200 * (passInt ?? 0),
          passAtt
        )
      );

      const rushYpc = round1(safeDiv(rushYds, rushAtt));
      const rushYpg = round1(safeDiv(rushYds, gp));

      const recvYpc = round1(safeDiv(recvYds, recvCat));
      const recvYpg = round1(safeDiv(recvYds, gp));
      const recvYaca = round1(safeDiv(recvYac, recvCat));

      const fgm = entry.kick.fgm ?? null;
      const fga = entry.kick.fga ?? null;
      const fgPct = round1(safeDiv(fgm * 100, fga));
      const fgLong = entry.kick.fgLong ?? null;
      const xpm = entry.kick.xpm ?? null;
      const xpa = entry.kick.xpa ?? null;
      const xpPct = round1(safeDiv(xpm * 100, xpa));

      const puntAtt = entry.kick.puntAtt ?? null;
      const puntYds = entry.kick.puntYds ?? null;
      const puntAvg = round1(safeDiv(puntYds, puntAtt));
      const puntLong = entry.kick.puntLong ?? null;
      const puntIn20 = entry.kick.puntIn20 ?? null;
      const puntBlocked = entry.kick.puntBlocked ?? null;

      const krAtt = entry.ret.krAtt ?? null;
      const krYds = entry.ret.krYds ?? null;
      const krTd = entry.ret.krTd ?? null;
      const krLong = entry.ret.krLong ?? null;
      const prAtt = entry.ret.prAtt ?? null;
      const prYds = entry.ret.prYds ?? null;
      const prTd = entry.ret.prTd ?? null;
      const prLong = entry.ret.prLong ?? null;

      const fingerprint = buildPlayerFingerprint(info) || `pgid:${entry.pgid}|season:${seasonYear}`;
      let playerUid = existingIdentitiesByFingerprint.get(fingerprint);
      if (!playerUid) {
        playerUid = crypto.randomUUID();
        existingIdentitiesByFingerprint.set(fingerprint, playerUid);
        newIdentities.push({
          dynastyId,
          playerUid,
          fingerprint,
          firstName: info.firstName ?? "",
          lastName: info.lastName ?? "",
          hometown: info.hometown ?? "",
        });
      }

      seasonIdentityMapRows.push({
        dynastyId,
        seasonYear,
        pgid: entry.pgid,
        playerUid,
      });

      const seasonTgid = info.tgid ?? entry.tgid ?? null;

      playerSeasonStats.push({
        dynastyId,
        seasonYear,
        pgid: entry.pgid,
        playerUid,
        tgid: seasonTgid,
        gp,
        firstName: info.firstName ?? "",
        lastName: info.lastName ?? "",
        hometown: info.hometown ?? "",
        height: info.height ?? null,
        weight: info.weight ?? null,
        jersey: info.jersey ?? null,
        position: info.position ?? null,
        classYear: info.classYear ?? null,
        overall: info.overall ?? null,

        passComp,
        passAtt,
        passPct,
        passYds,
        passYpg,
        passTd,
        passInt,
        passSacks,
        passQbr,

        rushAtt,
        rushYds,
        rushYpc,
        rushYpg,
        rushTd,
        rushFum,
        rushYac,
        rushBtk,
        rush20,

        recvCat,
        recvYds,
        recvYpc,
        recvYpg,
        recvTd,
        recvFum,
        recvYac,
        recvYaca,
        recvDrops,

        defTkl: entry.def.tkl ?? null,
        defTfl: entry.def.tfl ?? null,
        defSack: entry.def.sack ?? null,
        defInt: entry.def.int ?? null,
        defPDef: entry.def.pdef ?? null,
        defFF: entry.def.ff ?? null,
        defFR: entry.def.fr ?? null,
        defDTD: entry.def.dtd ?? null,

        fgm,
        fga,
        fgPct,
        fgLong,
        xpm,
        xpa,
        xpPct,

        puntAtt,
        puntYds,
        puntAvg,
        puntLong,
        puntIn20,
        puntBlocked,

        krAtt,
        krYds,
        krTd,
        krLong,
        prAtt,
        prYds,
        prTd,
        prLong,
      });
    }

    return { playerSeasonStats, seasonIdentityMapRows, newIdentities };
  };

  return {
    addPlayRow,
    addOffenseRow,
    addDefenseRow,
    addKickingRow,
    addReturnRow,
    finalize,
  };
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
  const requiredTypes = ["TEAM", "SCHD", "TSSE", "BOWL", "COCH", "PLAY", "PSOF", "PSDE", "PSKI", "PSKP"];
  const missingTypes = requiredTypes.filter((t) => !byType[t]);
  if (missingTypes.length) {
    throw new Error(
      `Missing required CSV(s): ${missingTypes.join(", ")}. Required: TEAM, SCHD, TSSE, BOWL, COCH, PLAY, PSOF, PSDE, PSKI, and PSKP.`
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
    tcrk: toNumberOrNull(r.TCRK ?? r.tcrk),
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
    cycd: toNumberOrNull(r.CYCD ?? r.cycd),
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

  const existingIdentityRows = await db.playerIdentities.where({ dynastyId }).toArray();
  const existingIdentitiesByFingerprint = new Map(
    existingIdentityRows
      .map((r) => {
        const fp = String(r.fingerprint ?? "").trim();
        return fp ? [fp, r.playerUid] : null;
      })
      .filter(Boolean)
  );

  const playerInfoRows = [];
  const statsAccumulator = createPlayerStatsAccumulator({
    dynastyId,
    seasonYear: year,
    existingIdentitiesByFingerprint,
  });

  await parseCsvFileStream(byType.PLAY, {
    label: "PLAY",
    requiredColumns: ["PGID", "FirstName", "LastName", "RCHD"],
    onRow: (row) => {
      const normalized = normalizePlayerRow(row, { dynastyId, seasonYear: year });
      if (normalized.pgid) playerInfoRows.push(normalized);
      statsAccumulator.addPlayRow(row);
    },
  });

  await parseCsvFileStream(byType.PSOF, {
    label: "PSOF",
    requiredColumns: ["PGID", "SGMP"],
    onRow: (row) => statsAccumulator.addOffenseRow(row),
  });

  await parseCsvFileStream(byType.PSDE, {
    label: "PSDE",
    requiredColumns: ["PGID", "SGMP"],
    onRow: (row) => statsAccumulator.addDefenseRow(row),
  });

  await parseCsvFileStream(byType.PSKI, {
    label: "PSKI",
    requiredColumns: ["PGID", "SGMP"],
    onRow: (row) => statsAccumulator.addKickingRow(row),
  });

  await parseCsvFileStream(byType.PSKP, {
    label: "PSKP",
    requiredColumns: ["PGID", "SGMP"],
    onRow: (row) => statsAccumulator.addReturnRow(row),
  });

  const { playerSeasonStats, seasonIdentityMapRows, newIdentities } = statsAccumulator.finalize();

  await db.transaction(
    "rw",
    db.teamSeasons,
    db.games,
    db.teams,
    db.teamStats,
    db.bowlGames,
    db.coaches,
    db.coachCareerBases,
    db.playerInfo,
    db.psofRows,
    db.psdeRows,
    db.pskiRows,
    db.pskpRows,
    db.playerSeasonStats,
    db.playerIdentities,
    db.playerIdentitySeasonMap,
    db.dynasties,
    async () => {
      // Overwrite ONLY this season year
      await db.teamSeasons.where({ dynastyId, seasonYear: year }).delete();
      await db.games.where({ dynastyId, seasonYear: year }).delete();
      await db.teamStats.where({ dynastyId, seasonYear: year }).delete();
      await db.bowlGames.where({ dynastyId, seasonYear: year }).delete();
      await db.coaches.where({ dynastyId, seasonYear: year }).delete();
      await db.playerInfo.where({ dynastyId, seasonYear: year }).delete();
      await db.psofRows.where({ dynastyId, seasonYear: year }).delete();
      await db.psdeRows.where({ dynastyId, seasonYear: year }).delete();
      await db.pskiRows.where({ dynastyId, seasonYear: year }).delete();
      await db.pskpRows.where({ dynastyId, seasonYear: year }).delete();
      await db.playerSeasonStats.where({ dynastyId, seasonYear: year }).delete();
      await db.playerIdentitySeasonMap.where({ dynastyId, seasonYear: year }).delete();

      await db.teams.bulkPut(teams);
      await db.teamSeasons.bulkPut(teamSeasons);
      await db.games.bulkPut(games);
      await db.teamStats.bulkPut(teamStats);
      await db.bowlGames.bulkPut(bowlGames);
      await db.coaches.bulkPut(coaches);
      await db.playerInfo.bulkPut(playerInfoRows);
      await db.playerSeasonStats.bulkPut(playerSeasonStats);
      if (newIdentities.length) await db.playerIdentities.bulkPut(newIdentities);
      if (seasonIdentityMapRows.length) await db.playerIdentitySeasonMap.bulkPut(seasonIdentityMapRows);

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
