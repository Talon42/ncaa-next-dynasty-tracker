import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";

const TAB_ORDER = ["Passing", "Rushing", "Receiving", "Defense", "Special Teams"];

const STAT_DEFS = [
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

const ONE_DECIMAL_KEYS = new Set([
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

const POSITION_LABELS = [
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

const CLASS_LABELS = ["FR", "SO", "JR", "SR"];

const POSITION_FILTER_ORDER = [
  "QB",
  "HB",
  "FB",
  "WR",
  "TE",
  "Edge",
  "DT",
  "LB",
  "CB",
  "SS",
  "FS",
  "K",
  "P",
];

function positionCategory(value) {
  const label = positionLabel(value);
  if (!label) return null;
  if (label === "LE" || label === "RE") return "Edge";
  if (label === "DT") return "DT";
  if (label === "LOLB" || label === "MLB" || label === "ROLB") return "LB";
  if (label === "QB") return "QB";
  if (label === "HB") return "HB";
  if (label === "FB") return "FB";
  if (label === "WR") return "WR";
  if (label === "TE") return "TE";
  if (label === "CB") return "CB";
  if (label === "SS") return "SS";
  if (label === "FS") return "FS";
  if (label === "K") return "K";
  if (label === "P") return "P";
  return null;
}

function toComparable(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const n = Number(String(v).trim());
  if (Number.isFinite(n)) return n;

  const s = String(v).trim();
  return s ? s.toLowerCase() : null;
}

function safeDiv(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

function round1(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function derivedValue(row, key) {
  const gp = Number(row.gp);
  const passComp = Number(row.passComp);
  const passAtt = Number(row.passAtt);
  const passYds = Number(row.passYds);
  const passTd = Number(row.passTd);
  const passInt = Number(row.passInt);

  const rushAtt = Number(row.rushAtt);
  const rushYds = Number(row.rushYds);

  const recvCat = Number(row.recvCat);
  const recvYds = Number(row.recvYds);
  const recvYac = Number(row.recvYac);

  const fgm = Number(row.fgm);
  const fga = Number(row.fga);
  const xpm = Number(row.xpm);
  const xpa = Number(row.xpa);

  const puntAtt = Number(row.puntAtt);
  const puntYds = Number(row.puntYds);

  switch (key) {
    case "passPct":
      return round1(safeDiv(passComp * 100, passAtt));
    case "passYpg":
      return round1(safeDiv(passYds, gp));
    case "passQbr":
      return round1(
        safeDiv(8.4 * passYds + 330 * passTd + 100 * passComp - 200 * passInt, passAtt)
      );
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

function valueForStat(row, key) {
  if (ONE_DECIMAL_KEYS.has(key)) {
    return derivedValue(row, key);
  }
  return row[key];
}

function formatStat(value, key) {
  if (value === null || value === undefined) return "";
  if (ONE_DECIMAL_KEYS.has(key)) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(1) : "";
  }
  return value;
}

function positionLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? POSITION_LABELS[n] || String(n) : "";
}

function classLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? CLASS_LABELS[n] || String(n) : "";
}

export default function PlayerStats() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [seasonYear, setSeasonYear] = useState(null);
  const [tab, setTab] = useState("Passing");
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

  const [confFilter, setConfFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [posFilter, setPosFilter] = useState("All");

  const [sortKey, setSortKey] = useState("playerName");
  const [sortDir, setSortDir] = useState("asc");
  const [visibleCount, setVisibleCount] = useState(200);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
    const tabParam = params.get("tab");
    const sort = params.get("sort");
    const dir = params.get("dir");
    const conf = params.get("conf");
    const team = params.get("team");
    const pos = params.get("pos");

    const resolved = getSeasonFromParamOrSaved(season);
    if (resolved != null) {
      const n = Number(resolved);
      if (Number.isFinite(n)) setSeasonYear(n);
    }
    if (tabParam && TAB_ORDER.includes(tabParam)) setTab(tabParam);
    if (sort) setSortKey(sort);
    if (dir === "asc" || dir === "desc") setSortDir(dir);
    if (conf) setConfFilter(conf);
    if (team) setTeamFilter(team);
    if (pos) setPosFilter(pos);
  }, [location.search]);

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
      if (!id) {
        setAvailableYears([]);
        setSeasonYear(null);
        setLoading(false);
        return;
      }

      const statsRows = await db.playerSeasonStats.where({ dynastyId: id }).toArray();
      const years = Array.from(
        new Set(statsRows.map((r) => Number(r.seasonYear)).filter((n) => Number.isFinite(n)))
      ).sort((a, b) => b - a);

      setAvailableYears(years);
      setSeasonYear((cur) => {
        if (cur != null) return cur;
        const picked = pickSeasonFromList({ availableSeasons: years });
        if (picked == null) return years[0] ?? null;
        const pickedNum = Number(picked);
        return Number.isFinite(pickedNum) ? pickedNum : years[0] ?? null;
      });
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) return;
    const params = new URLSearchParams(location.search);
    params.set("season", String(seasonYear));
    params.set("tab", tab);
    params.set("sort", sortKey);
    params.set("dir", sortDir);
    params.set("conf", confFilter);
    params.set("team", teamFilter);
    params.set("pos", posFilter);
    writeSeasonFilter(seasonYear);
    navigate({ pathname: "/player-stats", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, tab, sortKey, sortDir, confFilter, teamFilter, posFilter, navigate, location.search]);

  useEffect(() => {
    setVisibleCount(200);
  }, [seasonYear, tab, confFilter, teamFilter, posFilter]);

  useEffect(() => {
    if (tab === "Passing") {
      setSortKey("passYds");
      setSortDir("desc");
    } else if (tab === "Rushing") {
      setSortKey("rushYds");
      setSortDir("desc");
    } else if (tab === "Receiving") {
      setSortKey("recvCat");
      setSortDir("desc");
    }
  }, [tab]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !seasonYear) {
        setRows([]);
        setTeamSeasons([]);
        setLogoByTgid(new Map());
        setOverrideByTgid(new Map());
        setLoading(false);
        return;
      }

      setLoading(true);
      const [statsRows, seasonTeams] = await Promise.all([
        db.playerSeasonStats.where({ dynastyId, seasonYear }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear }).toArray(),
      ]);

      if (!alive) return;

      setRows(statsRows);
      setTeamSeasons(seasonTeams);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear]);

  useEffect(() => {
    if (!dynastyId) {
      setLogoByTgid(new Map());
      setOverrideByTgid(new Map());
      return;
    }

    let alive = true;

    (async () => {
      const [teamLogoRows, overrideRows] = await Promise.all([
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      setLogoByTgid(new Map(teamLogoRows.map((r) => [String(r.tgid), r.url])));
      setOverrideByTgid(new Map(overrideRows.map((r) => [String(r.tgid), r.url])));
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId]);

  const teamNameByTgid = useMemo(() => {
    const map = new Map();
    for (const t of teamSeasons) {
      const tdna = String(t.tdna ?? "").trim();
      const tmna = String(t.tmna ?? "").trim();
      const name = `${tdna}${tdna && tmna ? " " : ""}${tmna}`.trim() || String(t.tgid);
      map.set(String(t.tgid), name);
    }
    return map;
  }, [teamSeasons]);

  const confByTgid = useMemo(() => {
    return new Map(teamSeasons.map((t) => [String(t.tgid), t.cgid]));
  }, [teamSeasons]);

  const mergedRows = useMemo(() => {
    return rows.map((r) => {
      const tgid = r.tgid != null ? String(r.tgid) : "";
      const first = String(r.firstName ?? "").trim();
      const last = String(r.lastName ?? "").trim();
      const jersey = Number.isFinite(Number(r.jersey)) ? Number(r.jersey) : null;
      const nameBase = `${first} ${last}`.trim() || `PGID ${r.pgid}`;
      const name = nameBase;
      const teamName = tgid ? teamNameByTgid.get(tgid) || `TGID ${tgid}` : "Unknown";
      const confName = tgid ? getConferenceName(confByTgid.get(tgid)) : "Unknown";
      const logoUrl = overrideByTgid.get(tgid) || logoByTgid.get(tgid) || null;
      return {
        ...r,
        tgid,
        playerName: name,
        playerNameBase: nameBase,
        playerSortName: `${last} ${first}`.trim() || nameBase,
        teamName,
        confName,
        logoUrl,
        jerseyNumber: jersey,
      };
    });
  }, [rows, teamNameByTgid, confByTgid, logoByTgid, overrideByTgid]);

  const confOptions = useMemo(() => {
    const uniq = new Set();
    teamSeasons.forEach((t) => {
      const confName = getConferenceName(t.cgid);
      if (confName) uniq.add(confName);
    });
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  }, [teamSeasons]);

  const teamOptions = useMemo(() => {
    return teamSeasons
      .map((t) => {
        const tgid = String(t.tgid);
        const name = teamNameByTgid.get(tgid) || `TGID ${tgid}`;
        return { tgid, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamSeasons, teamNameByTgid]);

  const positionOptions = useMemo(() => {
    const uniq = new Set();
    rows.forEach((r) => {
      const label = positionCategory(r.position);
      if (label) uniq.add(label);
    });
    return POSITION_FILTER_ORDER.filter((label) => uniq.has(label));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return mergedRows.filter((r) => {
      if (confFilter !== "All" && r.confName !== confFilter) return false;
      if (teamFilter !== "All" && r.tgid !== teamFilter) return false;
      if (posFilter !== "All" && positionCategory(r.position) !== posFilter) return false;
      return true;
    });
  }, [mergedRows, confFilter, teamFilter, posFilter]);

  const colsForTab = useMemo(() => STAT_DEFS.filter((d) => d.group === tab), [tab]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;
    const arr = [...filteredRows];

    arr.sort((a, b) => {
      const av =
        key === "playerName"
          ? a.playerSortName
          : key === "teamName"
            ? a.teamName
            : valueForStat(a, key);
      const bv =
        key === "playerName"
          ? b.playerSortName
          : key === "teamName"
            ? b.teamName
            : valueForStat(b, key);

      const ca = toComparable(av);
      const cb = toComparable(bv);

      if (ca === null && cb === null) return 0;
      if (ca === null) return 1;
      if (cb === null) return -1;

      if (typeof ca === "number" && typeof cb === "number") {
        return (ca - cb) * dir;
      }

      return String(ca).localeCompare(String(cb)) * dir;
    });

    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const displayedRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount]);

  function clickSort(nextKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir("desc");
      return;
    }
    setSortDir((curDir) => (curDir === "asc" ? "desc" : "asc"));
  }

  function sortIndicator(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ^" : " v";
  }

  const hasAnyYears = availableYears.length > 0;

  return (
    <div>
      <div className="hrow">
        <h2>Player Stats - {tab}</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Season
            </span>
            <select
              value={seasonYear ?? ""}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSeasonYear(next);
                writeSeasonFilter(next);
              }}
              disabled={!hasAnyYears}
            >
              {!hasAnyYears ? (
                <option value="">No stats imported</option>
              ) : (
                availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Conference
            </span>
            <select
              value={confFilter}
              onChange={(e) => {
                setConfFilter(e.target.value);
                setTeamFilter("All");
              }}
              disabled={!confOptions.length}
            >
              <option value="All">All</option>
              {confOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Team
            </span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              disabled={!teamOptions.length}
            >
              <option value="All">All</option>
              {teamOptions.map((t) => (
                <option key={t.tgid} value={t.tgid}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Position
            </span>
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              disabled={!positionOptions.length}
            >
              <option value="All">All</option>
              {positionOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            className="toggleBtn"
            onClick={() => {
              setTab(t);

              const allowedKeys = new Set([
                "playerName",
                "teamName",
                "position",
                "classYear",
                "gp",
                ...STAT_DEFS.filter((d) => d.group === t).map((d) => d.key),
              ]);
              setSortKey((cur) => (allowedKeys.has(cur) ? cur : "playerName"));
            }}
            style={{
              fontWeight: tab === t ? 800 : 600,
              opacity: 1,
              color: tab === t ? "var(--text)" : "var(--muted)",
              borderColor: tab === t ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
              background: tab === t ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
              boxShadow: tab === t ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="muted">Loading...</div>
      ) : !hasAnyYears ? (
        <div className="muted">
          No Player Stats imported yet. Import a season with PLAY.csv, PSOF.csv, PSDE.csv, PSKI.csv, and PSKP.csv.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="muted">No player stats found for {seasonYear}.</div>
      ) : (
        <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
          <div className="statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
            <table className="table">
              <thead>
                <tr>
                  <th
                    onClick={() => clickSort("playerName")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                  >
                    Player{sortIndicator("playerName")}
                  </th>
                  <th
                    onClick={() => clickSort("teamName")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                  >
                    Team{sortIndicator("teamName")}
                  </th>
                  <th
                    onClick={() => clickSort("position")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                  >
                    Pos{sortIndicator("position")}
                  </th>
                  <th
                    onClick={() => clickSort("classYear")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                  >
                    Yr{sortIndicator("classYear")}
                  </th>
                  <th
                    onClick={() => clickSort("gp")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                  >
                    GP{sortIndicator("gp")}
                  </th>

                  {colsForTab.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => clickSort(c.key)}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title={c.fullLabel}
                    >
                      {c.label}
                      {sortIndicator(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r) => (
                  <tr key={`${r.pgid}-${r.seasonYear}`}>
                    <td data-label="Player">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            minWidth: 28,
                            textAlign: "right",
                            color: "var(--muted)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {r.jerseyNumber != null ? `#${r.jerseyNumber}` : ""}
                        </span>
                        <span>{r.playerNameBase || r.playerName}</span>
                      </span>
                    </td>
                    <td data-label="Team">
                      {r.tgid ? (
                        <Link to={`/team/${r.tgid}`} style={{ color: "inherit", textDecoration: "none" }}>
                          <div className="teamCell">
                            {r.logoUrl ? (
                              <img
                                className="teamLogo"
                                src={r.logoUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <span>{r.teamName}</span>
                          </div>
                        </Link>
                      ) : (
                        r.teamName
                      )}
                    </td>
                    <td data-label="Pos">{positionLabel(r.position)}</td>
                    <td data-label="Yr">{classLabel(r.classYear)}</td>
                    <td data-label="GP">{Number.isFinite(Number(r.gp)) ? Number(r.gp) : ""}</td>
                    {colsForTab.map((c) => (
                      <td key={c.key} data-label={c.fullLabel || c.label}>
                        {formatStat(valueForStat(r, c.key), c.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < filteredRows.length ? (
            <div style={{ marginTop: 12 }}>
              <button
                className="toggleBtn"
                onClick={() => setVisibleCount((cur) => cur + 200)}
              >
                Load 200 more
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
