export const TAB_ORDER = ["Passing", "Rushing", "Receiving", "Defense", "Special Teams"];

export const STAT_DEFS = [
  // Passing
  { key: "passQbr", label: "QBR", fullLabel: "Quarterback Rating", group: "Passing" },
  { key: "passComp", label: "Comp", fullLabel: "Pass Completions", group: "Passing" },
  { key: "passAtt", label: "Att", fullLabel: "Pass Attempts", group: "Passing" },
  { key: "passPct", label: "Pct", fullLabel: "Completion Percentage", group: "Passing" },
  { key: "passYds", label: "Yds", fullLabel: "Passing Yards", group: "Passing" },
  { key: "passYpg", label: "YPG", fullLabel: "Passing Yards Per Game", group: "Passing" },
  { key: "passTd", label: "TD", fullLabel: "Passing TD", group: "Passing" },
  { key: "passInt", label: "Int", fullLabel: "Passing INT", group: "Passing" },
  { key: "passSacks", label: "Sacks", fullLabel: "Times Sacked", group: "Passing" },

  // Rushing
  { key: "rushAtt", label: "Att", fullLabel: "Rush Attempts", group: "Rushing" },
  { key: "rushYds", label: "Yds", fullLabel: "Rush Yards", group: "Rushing" },
  { key: "rushTd", label: "TD", fullLabel: "Rush TD", group: "Rushing" },
  { key: "rushYpc", label: "YPC", fullLabel: "Rush Yards Per Carry", group: "Rushing" },
  { key: "rushYpg", label: "YPG", fullLabel: "Rush Yards Per Game", group: "Rushing" },
  { key: "rushFum", label: "Fum", fullLabel: "Rushing Fumbles", group: "Rushing" },
  { key: "rushBtk", label: "BTk", fullLabel: "Broken Tackles", group: "Rushing" },
  { key: "rush20", label: "20+", fullLabel: "Rush 20+ Yards", group: "Rushing" },
  { key: "rushYac", label: "YAC", fullLabel: "Yards After Contact", group: "Rushing" },

  // Receiving
  { key: "recvCat", label: "Cat", fullLabel: "Catches", group: "Receiving" },
  { key: "recvYds", label: "Yds", fullLabel: "Receiving Yards", group: "Receiving" },
  { key: "recvTd", label: "TD", fullLabel: "Receiving TD", group: "Receiving" },
  { key: "recvYpc", label: "YPC", fullLabel: "Yards Per Catch", group: "Receiving" },
  { key: "recvYpg", label: "YPG", fullLabel: "Receiving Yards Per Game", group: "Receiving" },
  { key: "recvFum", label: "Fum", fullLabel: "Receiving Fumbles", group: "Receiving" },
  { key: "recvYac", label: "YAC", fullLabel: "Yards After Catch", group: "Receiving" },
  { key: "recvYaca", label: "YACA", fullLabel: "YAC Per Catch", group: "Receiving" },
  { key: "recvDrops", label: "Drops", fullLabel: "Drops", group: "Receiving" },

  // Defense
  { key: "defTkl", label: "Tkl", fullLabel: "Tackles", group: "Defense" },
  { key: "defTfl", label: "TFL", fullLabel: "Tackles For Loss", group: "Defense" },
  { key: "defSack", label: "Sack", fullLabel: "Sacks", group: "Defense" },
  { key: "defInt", label: "Int", fullLabel: "Interceptions", group: "Defense" },
  { key: "defPDef", label: "PD", fullLabel: "Pass Deflections", group: "Defense" },
  { key: "defFF", label: "FF", fullLabel: "Forced Fumbles", group: "Defense" },
  { key: "defFR", label: "FR", fullLabel: "Fumble Recoveries", group: "Defense" },
  { key: "defDTD", label: "DTD", fullLabel: "Defensive TD", group: "Defense" },
  { key: "defFumYds", label: "Fum Yds", fullLabel: "Fumble Yards", group: "Defense" },
  { key: "defIntYds", label: "Int Yds", fullLabel: "Interception Yards", group: "Defense" },
  { key: "defIntLong", label: "Int Long", fullLabel: "Longest Interception Return", group: "Defense" },
  { key: "defSafety", label: "Safety", fullLabel: "Safeties", group: "Defense" },
  { key: "defBlk", label: "Blk", fullLabel: "Blocks", group: "Defense" },

  // Special Teams (Kicking)
  { key: "fgm", label: "FGM", fullLabel: "Field Goals Made", group: "Special Teams" },
  { key: "fga", label: "FGA", fullLabel: "Field Goals Attempted", group: "Special Teams" },
  { key: "fgPct", label: "FG%", fullLabel: "Field Goal Percentage", group: "Special Teams" },
  { key: "fgLong", label: "FG Long", fullLabel: "Longest Field Goal", group: "Special Teams" },
  { key: "xpm", label: "XPM", fullLabel: "Extra Points Made", group: "Special Teams" },
  { key: "xpa", label: "XPA", fullLabel: "Extra Points Attempted", group: "Special Teams" },
  { key: "xpPct", label: "XP%", fullLabel: "Extra Point Percentage", group: "Special Teams" },

  // Special Teams (Punting)
  { key: "puntAtt", label: "Punt", fullLabel: "Punts", group: "Special Teams" },
  { key: "puntYds", label: "P Yds", fullLabel: "Punt Yards", group: "Special Teams" },
  { key: "puntAvg", label: "P Avg", fullLabel: "Punt Average", group: "Special Teams" },
  { key: "puntLong", label: "P Long", fullLabel: "Longest Punt", group: "Special Teams" },
  { key: "puntIn20", label: "In 20", fullLabel: "Punts Inside 20", group: "Special Teams" },
  { key: "puntBlocked", label: "Blk", fullLabel: "Punts Blocked", group: "Special Teams" },

  // Special Teams (Returns)
  { key: "krAtt", label: "KR", fullLabel: "Kick Returns", group: "Special Teams" },
  { key: "krYds", label: "KR Yds", fullLabel: "Kick Return Yards", group: "Special Teams" },
  { key: "krTd", label: "KR TD", fullLabel: "Kick Return TD", group: "Special Teams" },
  { key: "krLong", label: "KR Long", fullLabel: "Longest Kick Return", group: "Special Teams" },
  { key: "prAtt", label: "PR", fullLabel: "Punt Returns", group: "Special Teams" },
  { key: "prYds", label: "PR Yds", fullLabel: "Punt Return Yards", group: "Special Teams" },
  { key: "prTd", label: "PR TD", fullLabel: "Punt Return TD", group: "Special Teams" },
  { key: "prLong", label: "PR Long", fullLabel: "Longest Punt Return", group: "Special Teams" },
];

export const ONE_DECIMAL_KEYS = new Set([
  "passPct",
  "passYpg",
  "passQbr",
  "rushYpc",
  "rushYpg",
  "recvYpc",
  "recvYpg",
  "recvYaca",
  "fgPct",
  "xpPct",
  "puntAvg",
]);

export const POSITION_LABELS = [
  "QB",
  "HB",
  "FB",
  "WR",
  "TE",
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
  "LE",
  "RE",
  "DT",
  "LOLB",
  "MLB",
  "ROLB",
  "CB",
  "FS",
  "SS",
  "K",
  "P",
  "KR",
  "PR",
  "KO",
  "LS",
  "TDRB",
];

export const CLASS_LABELS = ["FR", "SO", "JR", "SR"];

export function positionLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? POSITION_LABELS[n] || String(n) : "";
}

export function classLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? CLASS_LABELS[n] || String(n) : "";
}

function safeDiv(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

function round1(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function derivedValue(row, key, gp) {
  const passAtt = Number(row.passAtt ?? 0);
  const passComp = Number(row.passComp ?? 0);
  const passYds = Number(row.passYds ?? 0);
  const passTd = Number(row.passTd ?? 0);
  const passInt = Number(row.passInt ?? 0);
  const rushAtt = Number(row.rushAtt ?? 0);
  const rushYds = Number(row.rushYds ?? 0);
  const recvCat = Number(row.recvCat ?? 0);
  const recvYds = Number(row.recvYds ?? 0);
  const recvYac = Number(row.recvYac ?? 0);
  const fgm = Number(row.fgm ?? 0);
  const fga = Number(row.fga ?? 0);
  const xpm = Number(row.xpm ?? 0);
  const xpa = Number(row.xpa ?? 0);
  const puntAtt = Number(row.puntAtt ?? 0);
  const puntYds = Number(row.puntYds ?? 0);

  switch (key) {
    case "passQbr":
      return round1(safeDiv(8.4 * passYds + 330 * passTd + 100 * passComp - 200 * passInt, passAtt));
    case "passPct":
      return round1(safeDiv(passComp * 100, passAtt));
    case "passYpg":
      return round1(safeDiv(passYds, gp));
    case "rushYpc":
      return round1(safeDiv(rushYds, rushAtt));
    case "rushYpg":
      return round1(safeDiv(rushYds, gp));
    case "recvYpc":
      return round1(safeDiv(recvYds, recvCat));
    case "recvYpg":
      return round1(safeDiv(recvYds, gp));
    case "recvYaca":
      return round1(safeDiv(recvYac, recvCat));
    case "fgPct":
      return round1(safeDiv(fgm * 100, fga));
    case "xpPct":
      return round1(safeDiv(xpm * 100, xpa));
    case "puntAvg":
      return round1(safeDiv(puntYds, puntAtt));
    default:
      return null;
  }
}

export function formatStat(value, key) {
  if (value === null || value === undefined) return "";
  if (ONE_DECIMAL_KEYS.has(key)) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(1) : "";
  }
  return value;
}

export function getGpForTab(row, tab) {
  const legacy = Number(row.gp);
  if (tab === "Passing" || tab === "Rushing" || tab === "Receiving") {
    const gpOff = Number(row.gpOff);
    return Number.isFinite(gpOff) ? gpOff : legacy;
  }
  if (tab === "Defense") {
    const gpDef = Number(row.gpDef);
    return Number.isFinite(gpDef) ? gpDef : legacy;
  }
  if (tab === "Special Teams") {
    const gpSpec = Number(row.gpSpec);
    return Number.isFinite(gpSpec) ? gpSpec : legacy;
  }
  const gpOff = Number(row.gpOff);
  return Number.isFinite(gpOff) ? gpOff : legacy;
}

export function rowHasStatsForTab(row, defs, tab) {
  for (const c of defs) {
    const value = ONE_DECIMAL_KEYS.has(c.key)
      ? derivedValue(row, c.key, getGpForTab(row, tab))
      : row[c.key];
    if (Number.isFinite(value) && value !== 0) return true;
  }
  return false;
}
