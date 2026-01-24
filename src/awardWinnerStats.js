import { derivedValue, formatStat, getGpForTab, ONE_DECIMAL_KEYS, positionLabel, classLabel } from "./playerStatsUtils";

const DERIVED_STAT_KEYS = new Set(["retTd", "totalTd", "scoringPts", "scoringPtsPg"]);

function maxFinite(values) {
  let out = null;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    out = out == null ? n : Math.max(out, n);
  }
  return out;
}

function getGpOverall(row) {
  if (!row) return null;
  return maxFinite([row.gpOff, row.gpDef, row.gpSpec, row.gpOl, row.gp]);
}

function statValue(row, key, tab) {
  if (!row) return null;
  const effectiveTab = tab || "Passing";
  if (key === "gp") return getGpOverall(row);
  if (ONE_DECIMAL_KEYS.has(key) || DERIVED_STAT_KEYS.has(key)) {
    return derivedValue(row, key, getGpForTab(row, effectiveTab));
  }
  return row[key];
}

function formatStatLine(row, key, tab, label) {
  const v = statValue(row, key, tab);
  const formatted = formatStat(v, key);
  if (formatted === "" || formatted == null) return null;
  return { key, label, value: formatted };
}

export function awardStatsForPlayerRow(row) {
  const pos = positionLabel(row?.position);
  const cls = classLabel(row?.classYear);

  const out = [];
  out.push(formatStatLine(row, "gp", "Passing", "GP"));

  const add = (key, tab, label) => {
    out.push(formatStatLine(row, key, tab, label));
  };

  if (pos === "QB") {
    add("passYds", "Passing", "PASS YDS");
    add("passTd", "Passing", "PASS TD");
    add("passInt", "Passing", "INT");
    add("passPct", "Passing", "CMP%");
    add("rushYds", "Rushing", "RUSH YDS");
    add("rushTd", "Rushing", "RUSH TD");
  } else if (pos === "HB" || pos === "FB") {
    add("rushYds", "Rushing", "RUSH YDS");
    add("rushTd", "Rushing", "RUSH TD");
    add("rushYpc", "Rushing", "YPC");
    add("recvYds", "Receiving", "REC YDS");
    add("recvTd", "Receiving", "REC TD");
  } else if (pos === "WR" || pos === "TE") {
    add("recvCat", "Receiving", "REC");
    add("recvYds", "Receiving", "REC YDS");
    add("recvTd", "Receiving", "REC TD");
    add("recvYpc", "Receiving", "YPC");
    add("rushYds", "Rushing", "RUSH YDS");
  } else if (pos === "LT" || pos === "LG" || pos === "C" || pos === "RG" || pos === "RT") {
    add("olPancakes", "Offensive Line", "PANCAKES");
    add("olSacksAllowed", "Offensive Line", "SACKS ALLOWED");
  } else if (pos === "K") {
    add("fgm", "Kicking", "FGM");
    add("fga", "Kicking", "FGA");
    add("fgPct", "Kicking", "FG%");
    add("fgLong", "Kicking", "LNG");
    add("xpm", "Kicking", "XPM");
    add("xpa", "Kicking", "XPA");
  } else if (pos === "P") {
    add("puntAtt", "Punting", "PUNTS");
    add("puntYds", "Punting", "P YDS");
    add("puntAvg", "Punting", "P AVG");
    add("puntIn20", "Punting", "IN 20");
    add("puntLong", "Punting", "LNG");
  } else if (["CB", "FS", "SS", "LE", "RE", "DT", "LOLB", "MLB", "ROLB"].includes(pos)) {
    add("defTkl", "Defense", "TKL");
    add("defTfl", "Defense", "TFL");
    add("defSack", "Defense", "SACK");
    add("defInt", "Defense", "INT");
    add("defPDef", "Defense", "PD");
    add("defFF", "Defense", "FF");
  } else {
    add("scoringPts", "Scoring", "PTS");
    add("totalTd", "Scoring", "TD");
  }

  const cleaned = out.filter(Boolean);
  return { pos, cls, stats: cleaned };
}

