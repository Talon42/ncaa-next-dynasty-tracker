import Papa from "papaparse";
import { db, getDynasty } from "./db";
import { ensureCoachQuotesForSeason } from "./coachQuotes";
import { upsertTeamLogosFromSeasonTeams } from "./logoService";
import { computeCoachCareerBases } from "./coachRecords";
import { rebuildLatestSnapshotsForDynasty } from "./latestSnapshots";
import { prluLurtFromLuvl } from "./prlu";

const OSPA_AWARDS = new Map([
  [0, "Heisman Memorial Trophy"],
  [1, "Maxwell Award"],
  [2, "Chuck Bednarik Award"],
  [3, "Davey O'Brien Award"],
  [4, "Doak Walker Award"],
  [5, "Fred Biletnikoff Award"],
  [6, "John Mackey Award"],
  [7, "Outland Trophy"],
  [8, "Rimington Trophy"],
  [9, "Lombardi Award"],
  [10, "Dick Butkus Award"],
  [11, "Jim Thorpe Award"],
  [12, "Lou Groza Award"],
  [13, "Ray Guy Award"],
  [14, "Paul Hornung Award"],
]);

function parseCsvText(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (res.errors?.length) throw new Error(res.errors[0]?.message || "CSV parse error");
  return res.data;
}

function normalizeFieldKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function requireColumns(rows, required, label) {
  if (!rows.length) throw new Error(`${label} has no rows.`);
  const cols = Object.keys(rows[0] || {});
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) throw new Error(`${label} missing required columns: ${missing.join(", ")}`);
}

function requireColumnsLoose(rows, required, label) {
  if (!rows.length) throw new Error(`${label} has no rows.`);
  const cols = Object.keys(rows[0] || {}).map((c) => normalizeFieldKey(c));
  const missing = required.filter((c) => !cols.includes(normalizeFieldKey(c)));
  if (missing.length) throw new Error(`${label} missing required columns: ${missing.join(", ")}`);
}

function requireColumnsLooseFromFields(fields, required, label) {
  if (!fields?.length) throw new Error(`${label} has no rows.`);
  const cols = fields.map((c) => normalizeFieldKey(c));
  const missing = required.filter((c) => !cols.includes(normalizeFieldKey(c)));
  if (missing.length) throw new Error(`${label} missing required columns: ${missing.join(", ")}`);
}

function findHeaderByNormalized(fields, key) {
  const target = normalizeFieldKey(key);
  if (!target) return null;
  return (fields || []).find((field) => normalizeFieldKey(field) === target) || null;
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
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
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

function parseCsvFileStream(file, { label, requiredColumns, onRow, onHeaders }) {
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
          if (typeof onHeaders === "function") onHeaders(fields);
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
  const target = normalizeFieldKey(key);
  if (!target) return null;
  const found = Object.keys(row).find((k) => normalizeFieldKey(k) === target);
  return found ? row[found] : null;
}

function toLowerKeyMap(row) {
  const lc = {};
  for (const [k, v] of Object.entries(row || {})) {
    const key = normalizeFieldKey(k);
    if (!key) continue;
    if (lc[key] === undefined) lc[key] = v;
  }
  return lc;
}

function getRowValueFast(row, lc, key) {
  if (row[key] !== undefined) return row[key];
  return lc[normalizeFieldKey(key)];
}

function normalizeNamePart(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isOffensiveLinePosition(value) {
  const n = Number(value);
  return n === 5 || n === 6 || n === 7 || n === 8 || n === 9;
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

function buildPlayerNameKey(info) {
  const parts = [
    normalizeNamePart(info.firstName),
    normalizeNamePart(info.lastName),
    normalizeNamePart(info.hometown),
  ];

  const hasAny = parts.some((p) => p);
  return hasAny ? parts.join("|") : null;
}

function createPlayerStatsAccumulator({
  dynastyId,
  seasonYear,
  seasonIndex,
  existingIdentitiesByNameKey,
  identityByUid,
  priorSeasonByPgid,
  priorSeasonByUid,
  teamGamesByTgid,
}) {
  const playByPgid = new Map();
  const statsByPgid = new Map();

  const ensure = (pgid) => {
    let entry = statsByPgid.get(pgid);
    if (!entry) {
      const base = playByPgid.get(pgid) || {};
      entry = {
        pgid,
        tgid: base.tgid ?? null,
        gpOff: null,
        gpDef: null,
        gpKick: null,
        gpRet: null,
        gpOl: null,
        hasOffRow: false,
        hasDefRow: false,
        hasKickRow: false,
        hasRetRow: false,
        hasOlRow: false,
        off: {},
        def: {},
        kick: {},
        ret: {},
        ol: {},
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
        weight: (() => {
          const raw = toNumberOrNull(getRowValue(row, "PWGT"));
          return raw == null ? null : raw + 160;
        })(),
        jersey: toNumberOrNull(getRowValue(row, "PJEN")),
        position: toNumberOrNull(getRowValue(row, "PPOS")),
        classYear: toNumberOrNull(getRowValue(row, "PYER")),
        overall: toNumberOrNull(getRowValue(row, "POVR")),
        pten: toNumberOrNull(getRowValue(row, "PTEN")),
        pacc: prluLurtFromLuvl(getRowValue(row, "PACC")),
        pagi: prluLurtFromLuvl(getRowValue(row, "PAGI")),
        pawr: prluLurtFromLuvl(getRowValue(row, "PAWR")),
        pcar: prluLurtFromLuvl(getRowValue(row, "PCAR")),
        pbtk: prluLurtFromLuvl(getRowValue(row, "PBTK")),
        pcth: prluLurtFromLuvl(getRowValue(row, "PCTH")),
        pinj: prluLurtFromLuvl(getRowValue(row, "PINJ")),
        pjmp: prluLurtFromLuvl(getRowValue(row, "PJMP")),
        pkac: prluLurtFromLuvl(getRowValue(row, "PKAC")),
        pkpr: prluLurtFromLuvl(getRowValue(row, "PKPR")),
        ppbk: prluLurtFromLuvl(getRowValue(row, "PPBK")),
        prbk: prluLurtFromLuvl(getRowValue(row, "PRBK")),
        pspd: prluLurtFromLuvl(getRowValue(row, "PSPD")),
        psta: prluLurtFromLuvl(getRowValue(row, "PSTA")),
        pstr: prluLurtFromLuvl(getRowValue(row, "PSTR")),
        ptak: prluLurtFromLuvl(getRowValue(row, "PTAK")),
        ptha: prluLurtFromLuvl(getRowValue(row, "PTHA")),
        pthp: prluLurtFromLuvl(getRowValue(row, "PTHP")),
        povr: prluLurtFromLuvl(getRowValue(row, "POVR")),
        redshirt: toNumberOrNull(getRowValue(row, "PRSD")),
        skin: toNumberOrNull(getRowValue(row, "PSKI")),
        faceShape: toNumberOrNull(getRowValue(row, "PFGM")),
        faceId: toNumberOrNull(getRowValue(row, "PFMP")),
      };

    playByPgid.set(pgid, info);
    const entry = ensure(pgid);
    if (info.tgid) entry.tgid = info.tgid;
  };

  const shouldIncludeSeasonRow = (row, lc) => {
    const seyr = toNumberOrNull(getRowValueFast(row, lc, "SEYR"));
    if (seyr == null) return true;
    return Number.isFinite(seasonIndex) ? seyr === seasonIndex : true;
  };

  const addOffenseRow = (row) => {
    const lc = toLowerKeyMap(row);
    if (!shouldIncludeSeasonRow(row, lc)) return;
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = toNumberOrNull(getRowValueFast(row, lc, "SGMP"));
    if (sgmp != null) entry.gpOff = entry.gpOff == null ? sgmp : Math.max(entry.gpOff, sgmp);
    entry.hasOffRow = true;

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
    if (!shouldIncludeSeasonRow(row, lc)) return;
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = toNumberOrNull(getRowValueFast(row, lc, "SGMP"));
    if (sgmp != null) entry.gpDef = entry.gpDef == null ? sgmp : Math.max(entry.gpDef, sgmp);
    entry.hasDefRow = true;

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
    addStat(entry.def, "blk", getRowValueFast(row, lc, "slbl"));
    addStat(entry.def, "intYds", getRowValueFast(row, lc, "ssiy"));
    const intLongRaw = getRowValueFast(row, lc, "ssIR") ?? getRowValueFast(row, lc, "sslR");
    addStat(entry.def, "intLong", intLongRaw);
    addStat(entry.def, "safety", getRowValueFast(row, lc, "slsa"));
    addStat(entry.def, "fumYds", getRowValueFast(row, lc, "slfy"));
  };

  const addKickingRow = (row) => {
    const lc = toLowerKeyMap(row);
    if (!shouldIncludeSeasonRow(row, lc)) return;
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = toNumberOrNull(getRowValueFast(row, lc, "SGMP"));
    if (sgmp != null) entry.gpKick = entry.gpKick == null ? sgmp : Math.max(entry.gpKick, sgmp);
    entry.hasKickRow = true;

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
    if (!shouldIncludeSeasonRow(row, lc)) return;
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = toNumberOrNull(getRowValueFast(row, lc, "SGMP"));
    if (sgmp != null) entry.gpRet = entry.gpRet == null ? sgmp : Math.max(entry.gpRet, sgmp);
    entry.hasRetRow = true;

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

  const addOffensiveLineRow = (row) => {
    const lc = toLowerKeyMap(row);
    if (!shouldIncludeSeasonRow(row, lc)) return;
    const pgid = normId(getRowValueFast(row, lc, "PGID"));
    if (!pgid) return;
    const entry = ensure(pgid);
    const sgmp = toNumberOrNull(getRowValueFast(row, lc, "SGMP") ?? getRowValueFast(row, lc, "sgmp"));
    if (sgmp != null) entry.gpOl = entry.gpOl == null ? sgmp : Math.max(entry.gpOl, sgmp);
    entry.hasOlRow = true;

    const tgid =
      normalizeTeamId(getRowValueFast(row, lc, "TGID")) || calcTeamIdFromPgid(pgid);
    if (!entry.tgid && tgid) entry.tgid = tgid;

    addStat(entry.ol, "pancakes", getRowValueFast(row, lc, "SOPA") ?? getRowValueFast(row, lc, "sopa"));
    addStat(entry.ol, "sacksAllowed", getRowValueFast(row, lc, "SOSA") ?? getRowValueFast(row, lc, "sosa"));
  };

  const finalize = () => {
    for (const pgid of playByPgid.keys()) {
      ensure(pgid);
    }

    const playerSeasonStats = [];
    const seasonIdentityMapRows = [];
    const newIdentities = [];
    const identityUpdates = new Map();

    for (const entry of statsByPgid.values()) {
      const info = playByPgid.get(entry.pgid) || {};
      const teamGp = entry.tgid ? teamGamesByTgid.get(String(entry.tgid)) ?? 0 : 0;

      const gpOff = entry.hasOffRow
        ? Number.isFinite(entry.gpOff) && entry.gpOff > 0
          ? entry.gpOff
          : teamGp
        : 0;
      const gpDef = entry.hasDefRow
        ? Number.isFinite(entry.gpDef) && entry.gpDef > 0
          ? entry.gpDef
          : teamGp
        : 0;
      const gpSpec = (() => {
        if (entry.gpKick == null && entry.gpRet == null) return null;
        if (entry.gpKick == null) return entry.gpRet;
        if (entry.gpRet == null) return entry.gpKick;
        return Math.max(entry.gpKick, entry.gpRet);
      })();
      const resolvedGpSpec = entry.hasKickRow || entry.hasRetRow
        ? Number.isFinite(gpSpec) && gpSpec > 0
          ? gpSpec
          : teamGp
        : 0;
      const gpOl = entry.hasOlRow
        ? Number.isFinite(entry.gpOl) && entry.gpOl > 0
          ? entry.gpOl
          : teamGp
        : 0;

      const hasStat =
        (Number.isFinite(gpOff) && gpOff > 0) ||
        (Number.isFinite(gpDef) && gpDef > 0) ||
        (Number.isFinite(resolvedGpSpec) && resolvedGpSpec > 0) ||
        (Number.isFinite(gpOl) && gpOl > 0) ||
        Object.values(entry.off).some((v) => Number.isFinite(v) && v !== 0) ||
        Object.values(entry.def).some((v) => Number.isFinite(v) && v !== 0) ||
        Object.values(entry.kick).some((v) => Number.isFinite(v) && v !== 0) ||
        Object.values(entry.ret).some((v) => Number.isFinite(v) && v !== 0) ||
        Object.values(entry.ol).some((v) => Number.isFinite(v) && v !== 0);
      // Always include offensive line players in `playerSeasonStats` (roster/ratings),
      // even though they often have no counting stats rows in PSOF.

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

      const fgm = entry.kick.fgm ?? null;
      const fga = entry.kick.fga ?? null;
      const fgLong = entry.kick.fgLong ?? null;
      const xpm = entry.kick.xpm ?? null;
      const xpa = entry.kick.xpa ?? null;

      const puntAtt = entry.kick.puntAtt ?? null;
      const puntYds = entry.kick.puntYds ?? null;
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

      const olPancakes = entry.ol.pancakes ?? null;
      const olSacksAllowed = entry.ol.sacksAllowed ?? null;

      const nameKey = buildPlayerNameKey(info);
      const priorUid = priorSeasonByPgid.get(entry.pgid) || null;
      let playerUid = null;

      const priorSeason = priorUid ? priorSeasonByUid.get(priorUid) || null : null;
      const targetYear = Number(info.classYear);
      const targetRedshirt = Number(info.redshirt);
      const isProgressionValid = (prev) => {
        if (!prev) return true;
        const prevYear = Number(prev.classYear);
        const prevRedshirt = Number(prev.redshirt);
        if (Number.isFinite(prevYear) && Number.isFinite(targetYear)) {
          if (targetYear < prevYear) return false;
        }
        if (Number.isFinite(prevRedshirt) && Number.isFinite(targetRedshirt)) {
          if (targetRedshirt < prevRedshirt) {
            if (!(prevRedshirt === 3 && targetRedshirt === 2)) return false;
          }
        }
        return true;
      };

      if (priorUid) {
        if (!nameKey) {
          if (isProgressionValid(priorSeason)) playerUid = priorUid;
        } else {
          const priorIdentity = identityByUid.get(priorUid) || null;
          const priorKey = priorIdentity ? buildPlayerNameKey(priorIdentity) : null;
          if (priorKey && priorKey === nameKey && isProgressionValid(priorSeason)) {
            playerUid = priorUid;
          }
        }
      }

      if (!playerUid && nameKey) {
        const matches = existingIdentitiesByNameKey.get(nameKey) || [];
        if (matches.length) {
          const scored = matches
            .map((uid) => {
              const existing = identityByUid.get(uid) || null;
              const score = { uid, value: 0 };

              const targetPos = Number(info.position);
              const existingPos = Number(existing?.position);
              if (
                Number.isFinite(targetPos) &&
                Number.isFinite(existingPos) &&
                targetPos === existingPos
              ) {
                score.value += 2;
              }

              const prevSeason = priorSeasonByUid.get(uid) || null;
              if (isProgressionValid(prevSeason)) score.value += 1;

              const attrs = [
                ["skin", "skin"],
                ["faceShape", "faceShape"],
                ["faceId", "faceId"],
              ];
              for (const [a, b] of attrs) {
                const av = Number(info[a]);
                const bv = Number(existing?.[b]);
                if (Number.isFinite(av) && Number.isFinite(bv) && av === bv) {
                  score.value += 1;
                }
              }

              return score;
            })
            .sort((a, b) => b.value - a.value);

          if (scored.length) {
            const top = scored[0];
            const second = scored[1];
            if (top.value > 0 && (!second || top.value > second.value)) {
              playerUid = top.uid;
            }
          }
        }
      }

      if (!playerUid) {
        playerUid = crypto.randomUUID();
        if (nameKey) {
          const list = existingIdentitiesByNameKey.get(nameKey) || [];
          list.push(playerUid);
          existingIdentitiesByNameKey.set(nameKey, list);
        }
        newIdentities.push({
          dynastyId,
          playerUid,
          fingerprint: nameKey || `pgid:${entry.pgid}|season:${seasonYear}`,
          firstName: info.firstName ?? "",
          lastName: info.lastName ?? "",
          hometown: info.hometown ?? "",
          height: info.height ?? null,
          weight: info.weight ?? null,
          position: info.position ?? null,
          redshirt: info.redshirt ?? null,
          skin: info.skin ?? null,
          faceShape: info.faceShape ?? null,
          faceId: info.faceId ?? null,
        });
      } else {
        const existing = identityByUid.get(playerUid) || null;
        if (existing) {
          const nextHeight = Number.isFinite(info.height) ? info.height : existing.height ?? null;
          const nextWeight = Number.isFinite(info.weight) ? info.weight : existing.weight ?? null;
          const changed = nextHeight !== (existing.height ?? null) || nextWeight !== (existing.weight ?? null);
          if (changed) {
            identityUpdates.set(playerUid, {
              ...existing,
              height: nextHeight,
              weight: nextWeight,
            });
          }
        }
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
        gpOff,
        gpDef,
        gpSpec: resolvedGpSpec,
        gpOl,
        jersey: info.jersey ?? null,
        position: info.position ?? null,
        classYear: info.classYear ?? null,
        redshirt: info.redshirt ?? null,
        pten: info.pten ?? null,

        pacc: info.pacc ?? null,
        pagi: info.pagi ?? null,
        pawr: info.pawr ?? null,
        pcar: info.pcar ?? null,
        pbtk: info.pbtk ?? null,
        pcth: info.pcth ?? null,
        pinj: info.pinj ?? null,
        pjmp: info.pjmp ?? null,
        pkac: info.pkac ?? null,
        pkpr: info.pkpr ?? null,
        ppbk: info.ppbk ?? null,
        prbk: info.prbk ?? null,
        pspd: info.pspd ?? null,
        psta: info.psta ?? null,
        pstr: info.pstr ?? null,
        ptak: info.ptak ?? null,
        ptha: info.ptha ?? null,
        pthp: info.pthp ?? null,
        povr: info.povr ?? null,

        passComp,
        passAtt,
        passYds,
        passTd,
        passInt,
        passSacks,

        rushAtt,
        rushYds,
        rushTd,
        rushFum,
        rushYac,
        rushBtk,
        rush20,

        recvCat,
        recvYds,
        recvTd,
        recvFum,
        recvYac,
        recvDrops,

        defTkl: entry.def.tkl ?? null,
        defTfl: entry.def.tfl ?? null,
        defSack: entry.def.sack ?? null,
        defInt: entry.def.int ?? null,
        defPDef: entry.def.pdef ?? null,
        defFF: entry.def.ff ?? null,
        defFR: entry.def.fr ?? null,
        defDTD: entry.def.dtd ?? null,
        defBlk: entry.def.blk ?? null,
        defIntYds: entry.def.intYds ?? null,
        defIntLong: entry.def.intLong ?? null,
        defSafety: entry.def.safety ?? null,
        defFumYds: entry.def.fumYds ?? null,

        fgm,
        fga,
        fgLong,
        xpm,
        xpa,

        puntAtt,
        puntYds,
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

        olPancakes,
        olSacksAllowed,
      });
    }

    return {
      playerSeasonStats,
      seasonIdentityMapRows,
      newIdentities,
      identityUpdates: Array.from(identityUpdates.values()),
    };
  };

  return {
    addPlayRow,
    addOffenseRow,
    addDefenseRow,
    addKickingRow,
    addReturnRow,
    addOffensiveLineRow,
    finalize,
  };
}

function collectSeyrValuesFromRows(rows) {
  const values = [];
  for (const row of rows || []) {
    const lc = toLowerKeyMap(row);
    const seyr = toNumberOrNull(getRowValueFast(row, lc, "SEYR"));
    if (!Number.isFinite(seyr)) continue;
    values.push(seyr);
  }
  return values;
}

function pickSeasonIndexFromSeyr({ seasonYear, dynastyStartYear, rowsByType, seyrHeaderByType } = {}) {
  const year = Number(seasonYear);
  if (!Number.isFinite(year)) return { seasonIndex: null, inferredStartYear: null, usedFallback: false };

  // `SEYR` is a 0-based season index within the dynasty/save.
  // If the dynasty has a startYear, then SEYR for a given seasonYear is fixed as:
  //   expectedIndex = seasonYear - startYear
  // This matters for overwriting older seasons (e.g. reimport 2025 => SEYR=0 even if later seasons exist).
  const expectedIndex = Number.isFinite(Number(dynastyStartYear))
    ? year - Number(dynastyStartYear)
    : null;

  const allSeyr = [];
  for (const rows of Object.values(rowsByType || {})) {
    allSeyr.push(...collectSeyrValuesFromRows(rows));
  }

  if (!allSeyr.length) return { seasonIndex: expectedIndex, inferredStartYear: null, usedFallback: false };

  const seyrSet = new Set(allSeyr);
  const unique = Array.from(seyrSet.values()).filter((v) => Number.isFinite(v));

  if (Number.isFinite(expectedIndex)) {
    if (seyrSet.has(expectedIndex)) {
      return { seasonIndex: expectedIndex, inferredStartYear: null, usedFallback: false };
    }

    if (unique.length === 1) {
      // Per-season exports sometimes only include one SEYR value; accept it but mark fallback.
      return { seasonIndex: unique[0], inferredStartYear: null, usedFallback: true };
    }

    const detail = Object.entries(rowsByType || {})
      .map(([type, rows]) => {
        const vals = Array.from(new Set(collectSeyrValuesFromRows(rows))).sort((a, b) => a - b);
        const header = seyrHeaderByType?.[type];
        const headerLabel = header ? `SEYR header "${header}"` : "SEYR header missing";
        return vals.length ? `${type}: ${vals.join(", ")} (${headerLabel})` : `${type}: (no SEYR values found, ${headerLabel})`;
      })
      .join(" | ");
    throw new Error(
      `Season ${year} maps to SEYR=${expectedIndex} (startYear=${dynastyStartYear}), but the selected files contain SEYR values: ${unique
        .slice()
        .sort((a, b) => a - b)
        .join(", ")}. (${detail}) Pick the correct season year for this dynasty file, or adjust the dynasty start year so SEYR=0 matches the dynasty's first season.`
    );
  }

  if (unique.length === 1) {
    return {
      seasonIndex: unique[0],
      inferredStartYear: Number.isFinite(expectedIndex) ? null : year - unique[0],
      usedFallback: Number.isFinite(expectedIndex) && expectedIndex !== unique[0],
    };
  }

  const maxSeyr = Math.max(...unique);
  if (!Number.isFinite(maxSeyr)) return { seasonIndex: expectedIndex, inferredStartYear: null, usedFallback: false };

  return {
    seasonIndex: maxSeyr,
    inferredStartYear: Number.isFinite(expectedIndex) ? null : year - maxSeyr,
    usedFallback: Number.isFinite(expectedIndex) && expectedIndex !== maxSeyr,
  };
}


export async function seasonExists({ dynastyId, seasonYear }) {
  const count = await db.games
    .where("[dynastyId+seasonYear]")
    .equals([dynastyId, seasonYear])
    .count();
  return count > 0;
}

export async function importSeasonBatch({ dynastyId, seasonYear, files, options } = {}) {
  const dynasty = await getDynasty(dynastyId);
  if (!dynasty) throw new Error("No active dynasty selected.");

  const year = Number(seasonYear);
  if (!Number.isFinite(year)) throw new Error("Season year must be a number.");
  if (!files?.length) throw new Error("Please select CSV files to upload.");

  const runMaintenance = options?.runMaintenance !== false;

  const byType = {};
  for (const f of files) {
    const t = getTypeFromName(f.name);
    if (t) byType[t] = f;
  }

  // Mandatory set for now (and will remain mandatory)
  const requiredTypes = [
    "TEAM",
    "SCHD",
    "TSSE",
    "BOWL",
    "COCH",
    "PLAY",
    "PSOF",
    "PSDE",
    "PSKI",
    "PSKP",
    "AAPL",
    "OSPA",
  ];
  const missingTypes = requiredTypes.filter((t) => !byType[t]);
  if (missingTypes.length) {
    throw new Error(
      `Missing required CSV(s): ${missingTypes.join(", ")}. Required: TEAM, SCHD, TSSE, BOWL, COCH, PLAY, PSOF, PSDE, PSKI, PSKP, AAPL, and OSPA.`
    );
  }

  const teamRows = [];
  const schdRows = [];
  const tsseRows = [];
  const bowlRows = [];
  const cochRowsRaw = [];

  await parseCsvFileStream(byType.TEAM, {
    label: "TEAM",
    requiredColumns: ["TGID", "CGID", "TDNA", "TMNA", "TMPR"],
    onRow: (row) => teamRows.push(row),
  });

  await parseCsvFileStream(byType.SCHD, {
    label: "SCHD",
    requiredColumns: ["GATG", "GHTG", "GASC", "GHSC", "SEWN", "SGNM"],
    onRow: (row) => schdRows.push(row),
  });

  await parseCsvFileStream(byType.TSSE, {
    label: "TSSE",
    requiredColumns: ["TGID"],
    onRow: (row) => tsseRows.push(row),
  });

  await parseCsvFileStream(byType.BOWL, {
    label: "BOWL",
    requiredColumns: ["SEWN", "SGNM", "BNME"],
    onRow: (row) => bowlRows.push(row),
  });

  await parseCsvFileStream(byType.COCH, {
    label: "COCH",
    requiredColumns: [
      "CCID",
      "CLFN",
      "CLLN",
      "TGID",
      "CFUC",
      "CPRE",
      "CCPO",
      "CTOP",
      "CSWI",
      "CSLO",
      "CPID",
      "CDST",
      "COST",
    ],
    onRow: (row) => cochRowsRaw.push(row),
  });

  const cochRows = dedupeCoachRows(cochRowsRaw);

  const teamSeasons = teamRows.map((r) => ({
    dynastyId,
    seasonYear: year,
    tgid: normId(r.TGID),
    cgid: normId(r.CGID), // conference id (season snapshot; supports realignment)
    tdna: String(r.TDNA ?? "").trim(),
    tmna: String(r.TMNA ?? "").trim(),
    tmab: String(getRowValue(r, "TMAB") ?? "").trim(),
    tmpr: (() => {
      const n = Number(String(r.TMPR ?? "").trim());
      return Number.isFinite(n) ? n : null;
    })(),
    tcrk: toNumberOrNull(r.TCRK ?? r.tcrk),
    ocap: toNumberOrNull(r.OCAP ?? r.ocap),
    dcap: toNumberOrNull(r.DCAP ?? r.dcap),
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

  const teamGamesByTgid = new Map();
  for (const g of games) {
    const ht = String(g.homeTgid ?? "");
    const at = String(g.awayTgid ?? "");
    if (ht) teamGamesByTgid.set(ht, (teamGamesByTgid.get(ht) ?? 0) + 1);
    if (at) teamGamesByTgid.set(at, (teamGamesByTgid.get(at) ?? 0) + 1);
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
  const identityByUid = new Map(
    existingIdentityRows
      .map((r) => {
        const uid = String(r.playerUid ?? "").trim();
        return uid ? [uid, r] : null;
      })
      .filter(Boolean)
  );
  const existingIdentitiesByNameKey = new Map();
  for (const row of existingIdentityRows) {
    const key = buildPlayerNameKey(row);
    if (!key) continue;
    const list = existingIdentitiesByNameKey.get(key) || [];
    list.push(row.playerUid);
    existingIdentitiesByNameKey.set(key, list);
  }

  const priorSeasonYear = year - 1;
  const [priorSeasonRows, priorSeasonStats] = await Promise.all([
    db.playerIdentitySeasonMap
      .where("[dynastyId+seasonYear]")
      .equals([dynastyId, priorSeasonYear])
      .toArray(),
    db.playerSeasonStats
      .where("[dynastyId+seasonYear]")
      .equals([dynastyId, priorSeasonYear])
      .toArray(),
  ]);
  const priorSeasonByPgid = new Map(
    priorSeasonRows
      .map((r) => {
        const pgid = String(r.pgid ?? "").trim();
        const uid = String(r.playerUid ?? "").trim();
        return pgid && uid ? [pgid, uid] : null;
      })
      .filter(Boolean)
  );
  const priorSeasonByUid = new Map(
    priorSeasonStats
      .map((r) => {
        const uid = String(r.playerUid ?? "").trim();
        return uid ? [uid, { classYear: r.classYear, redshirt: r.redshirt }] : null;
      })
      .filter(Boolean)
  );

  const playRowsRaw = [];
  await parseCsvFileStream(byType.PLAY, {
    label: "PLAY",
    requiredColumns: ["PGID", "FirstName", "LastName", "RCHD"],
    onRow: (row) => {
      playRowsRaw.push(row);
    },
  });

  const psofRowsRaw = [];
  const psdeRowsRaw = [];
  const pskiRowsRaw = [];
  const pskpRowsRaw = [];
  const psolRowsRaw = [];
  const seyrHeaderByType = {};

  await parseCsvFileStream(byType.PSOF, {
    label: "PSOF",
    requiredColumns: ["PGID", "SEYR", "SGMP"],
    onHeaders: (fields) => {
      seyrHeaderByType.PSOF = findHeaderByNormalized(fields, "SEYR");
    },
    onRow: (row) => psofRowsRaw.push(row),
  });

  await parseCsvFileStream(byType.PSDE, {
    label: "PSDE",
    requiredColumns: ["PGID", "SEYR", "SGMP"],
    onHeaders: (fields) => {
      seyrHeaderByType.PSDE = findHeaderByNormalized(fields, "SEYR");
    },
    onRow: (row) => psdeRowsRaw.push(row),
  });

  await parseCsvFileStream(byType.PSKI, {
    label: "PSKI",
    requiredColumns: ["PGID", "SEYR", "SGMP"],
    onHeaders: (fields) => {
      seyrHeaderByType.PSKI = findHeaderByNormalized(fields, "SEYR");
    },
    onRow: (row) => pskiRowsRaw.push(row),
  });

  await parseCsvFileStream(byType.PSKP, {
    label: "PSKP",
    requiredColumns: ["PGID", "SEYR", "SGMP"],
    onHeaders: (fields) => {
      seyrHeaderByType.PSKP = findHeaderByNormalized(fields, "SEYR");
    },
    onRow: (row) => pskpRowsRaw.push(row),
  });

  if (byType.PSOL) {
    await parseCsvFileStream(byType.PSOL, {
      label: "PSOL",
      requiredColumns: ["PGID", "SEYR", "SGMP"],
      onHeaders: (fields) => {
        seyrHeaderByType.PSOL = findHeaderByNormalized(fields, "SEYR");
      },
      onRow: (row) => psolRowsRaw.push(row),
    });
  }

  const picked = pickSeasonIndexFromSeyr({
    seasonYear: year,
    dynastyStartYear: dynasty.startYear,
    rowsByType: { PSOF: psofRowsRaw, PSDE: psdeRowsRaw, PSKI: pskiRowsRaw, PSKP: pskpRowsRaw, PSOL: psolRowsRaw },
    seyrHeaderByType,
  });
  const seasonIndex = picked.seasonIndex;

  const statsAccumulator = createPlayerStatsAccumulator({
    dynastyId,
    seasonYear: year,
    seasonIndex,
    existingIdentitiesByNameKey,
    identityByUid,
    priorSeasonByPgid,
    priorSeasonByUid,
    teamGamesByTgid,
  });

  for (const row of playRowsRaw) statsAccumulator.addPlayRow(row);
  for (const row of psofRowsRaw) statsAccumulator.addOffenseRow(row);
  for (const row of psdeRowsRaw) statsAccumulator.addDefenseRow(row);
  for (const row of pskiRowsRaw) statsAccumulator.addKickingRow(row);
  for (const row of pskpRowsRaw) statsAccumulator.addReturnRow(row);
  for (const row of psolRowsRaw) statsAccumulator.addOffensiveLineRow(row);

  const { playerSeasonStats, seasonIdentityMapRows, newIdentities, identityUpdates } =
    statsAccumulator.finalize();
  const playerUidByPgid = new Map(
    seasonIdentityMapRows
      .map((r) => [String(r.pgid ?? "").trim(), String(r.playerUid ?? "").trim()])
      .filter(([pgid, uid]) => pgid && uid)
  );
  const identityByUidCombined = new Map(identityByUid);
  for (const identity of newIdentities) {
    const uid = String(identity.playerUid ?? "").trim();
    if (uid) identityByUidCombined.set(uid, identity);
  }
  const nameByPgid = new Map(
    Array.from(playerUidByPgid.entries())
      .map(([pgid, uid]) => {
        const identity = identityByUidCombined.get(uid) || null;
        if (!pgid) return null;
        return [
          pgid,
          {
            firstName: identity?.firstName ?? "",
            lastName: identity?.lastName ?? "",
          },
        ];
      })
      .filter(Boolean)
  );
  const allAmericanRows = [];
  const awardRows = [];
  const pendingOspaByPoat = new Map();

  const shouldIncludeSeasonRow = (row) => {
    const lc = toLowerKeyMap(row);
    const seyr = toNumberOrNull(getRowValueFast(row, lc, "SEYR"));
    if (seyr == null) return true;
    return Number.isFinite(seasonIndex) ? seyr === seasonIndex : true;
  };

  await parseCsvFileStream(byType.AAPL, {
    label: "AAPL",
    requiredColumns: ["CGID", "PGID", "TTYP", "SEYR", "PPOS"],
    onRow: (row) => {
      if (!shouldIncludeSeasonRow(row)) return;
      const lc = toLowerKeyMap(row);
      const pgid = normId(getRowValueFast(row, lc, "PGID"));
      if (!pgid) return;
      const playerUid = playerUidByPgid.get(pgid);
      if (!playerUid) return;
      allAmericanRows.push({
        dynastyId,
        seasonYear: year,
        playerUid,
        pgid,
        cgid: normId(getRowValueFast(row, lc, "CGID")),
        ttyp: toNumberOrNull(getRowValueFast(row, lc, "TTYP")),
        seyr: toNumberOrNull(getRowValueFast(row, lc, "SEYR")),
        ppos: toNumberOrNull(getRowValueFast(row, lc, "PPOS")),
      });
    },
  });

  await parseCsvFileStream(byType.OSPA, {
    label: "OSPA",
    requiredColumns: ["PGID", "POAR", "POAT", "SEYR"],
    onRow: (row) => {
      const lc = toLowerKeyMap(row);
      const seyr = toNumberOrNull(getRowValueFast(row, lc, "SEYR"));
      if (!Number.isFinite(seyr)) return;
      if (Number.isFinite(seasonIndex) && seyr !== seasonIndex) return;

      const pgid = normId(getRowValueFast(row, lc, "PGID"));
      if (!pgid) return;
      const poar = toNumberOrNull(getRowValueFast(row, lc, "POAR"));
      if (!Number.isFinite(poar)) return;
      const poat = toNumberOrNull(getRowValueFast(row, lc, "POAT"));
      if (!Number.isFinite(poat)) return;

      // Defer picking the winner until we've seen all rows for a given award.
      // Some exports may encode placement differently; prefer POAR=0 when present,
      // otherwise fall back to the minimum POAR within that POAT group.
      const list = pendingOspaByPoat.get(poat) || [];
      list.push({ pgid, poar });
      pendingOspaByPoat.set(poat, list);
    },
  });

  for (const [poat, rows] of pendingOspaByPoat.entries()) {
    const awardName = OSPA_AWARDS.get(poat);
    if (!awardName) continue;

    const poarValues = rows.map((r) => r.poar).filter((v) => Number.isFinite(v));
    if (!poarValues.length) continue;

    const hasZero = poarValues.includes(0);
    const winnerRank = hasZero ? 0 : Math.min(...poarValues);

    for (const r of rows) {
      if (r.poar !== winnerRank) continue;
      const pgid = r.pgid;
      const playerUid = playerUidByPgid.get(pgid);
      if (!playerUid) continue;
      const name = nameByPgid.get(pgid) || { firstName: "", lastName: "" };
      awardRows.push({
        dynastyId,
        seasonYear: year,
        playerUid,
        pgid,
        firstName: name.firstName,
        lastName: name.lastName,
        awardKey: String(poat),
        awardName,
        poat,
        poar: r.poar,
      });
    }
  }

  await db.transaction(
    "rw",
    db.teamSeasons,
    db.games,
    db.teams,
    db.teamStats,
    db.bowlGames,
    db.coaches,
    db.playerSeasonStats,
    db.playerAllAmericans,
    db.playerAwards,
    db.playerIdentities,
    db.playerIdentitySeasonMap,
    db.dynasties,
    async () => {
      // Overwrite ONLY this season year
      await db.teamSeasons.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.games.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.teamStats.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.bowlGames.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.coaches.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.playerSeasonStats
        .where("[dynastyId+seasonYear]")
        .equals([dynastyId, year])
        .delete();
      await db.playerAllAmericans.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.playerAwards.where("[dynastyId+seasonYear]").equals([dynastyId, year]).delete();
      await db.playerIdentitySeasonMap
        .where("[dynastyId+seasonYear]")
        .equals([dynastyId, year])
        .delete();

      await db.teams.bulkPut(teams);
      await db.teamSeasons.bulkPut(teamSeasons);
      await db.games.bulkPut(games);
      await db.teamStats.bulkPut(teamStats);
      await db.bowlGames.bulkPut(bowlGames);
      await db.coaches.bulkPut(coaches);
      await db.playerSeasonStats.bulkPut(playerSeasonStats);
      if (allAmericanRows.length) await db.playerAllAmericans.bulkPut(allAmericanRows);
      if (awardRows.length) await db.playerAwards.bulkPut(awardRows);
      if (identityUpdates.length) await db.playerIdentities.bulkPut(identityUpdates);
      if (newIdentities.length) await db.playerIdentities.bulkPut(newIdentities);
      if (seasonIdentityMapRows.length) await db.playerIdentitySeasonMap.bulkPut(seasonIdentityMapRows);

      // Option A currentYear advance
      const d = await db.dynasties.get(dynastyId);
      if (d && year >= Number(d.currentYear)) {
        const patch = { currentYear: year + 1 };
        if (!Number.isFinite(Number(d.startYear)) && Number.isFinite(Number(picked?.inferredStartYear))) {
          patch.startYear = Math.trunc(Number(picked.inferredStartYear));
        }
        await db.dynasties.update(dynastyId, patch);
      }
    }
  );

  if (runMaintenance) {
    try {
      await db.transaction("rw", db.playerIdentitySeasonMap, db.playerIdentities, async () => {
        const identityMapRows = await db.playerIdentitySeasonMap.where({ dynastyId }).toArray();
        const usedUids = new Set(identityMapRows.map((r) => String(r.playerUid ?? "")).filter(Boolean));
        const identityRows = await db.playerIdentities.where({ dynastyId }).toArray();
        const orphanUids = identityRows
          .map((r) => String(r.playerUid ?? ""))
          .filter((uid) => uid && !usedUids.has(uid));
        if (!orphanUids.length) return;
        await db.playerIdentities
          .where("[dynastyId+playerUid]")
          .anyOf(orphanUids.map((uid) => [dynastyId, uid]))
          .delete();
      });
    } catch {
      // Pruning is optional; don't block imports.
    }

    try {
      const allCoachRows = await db.coaches.where({ dynastyId }).toArray();
      const baseRows = computeCoachCareerBases({ dynastyId, coachRows: allCoachRows });
      await db.transaction("rw", db.coachCareerBases, async () => {
        await db.coachCareerBases.where({ dynastyId }).delete();
        if (baseRows.length) await db.coachCareerBases.bulkPut(baseRows);
      });
    } catch {
      // Derived; don't block imports.
    }

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

  try {
    await rebuildLatestSnapshotsForDynasty({ dynastyId });
  } catch {
    // If snapshots fail, don't block import.
  }
  }

  return { dynastyId, seasonYear: year, teams: teamSeasons.length, games: games.length };
}
