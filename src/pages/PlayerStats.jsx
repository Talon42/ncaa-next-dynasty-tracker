import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";

const TAB_ORDER = ["Offense", "Defense", "Special Teams"];

const STAT_DEFS = [
  // Offense (Passing)
  { key: "passComp", label: "P Comp", fullLabel: "Pass Completions", group: "Offense" },
  { key: "passAtt", label: "P Att", fullLabel: "Pass Attempts", group: "Offense" },
  { key: "passPct", label: "P Pct", fullLabel: "Completion Percentage", group: "Offense" },
  { key: "passYds", label: "P Yds", fullLabel: "Passing Yards", group: "Offense" },
  { key: "passYpg", label: "P YPG", fullLabel: "Passing Yards Per Game", group: "Offense" },
  { key: "passTd", label: "P TD", fullLabel: "Passing TD", group: "Offense" },
  { key: "passInt", label: "P Int", fullLabel: "Passing INT", group: "Offense" },
  { key: "passSacks", label: "P Sck", fullLabel: "Times Sacked", group: "Offense" },
  { key: "passQbr", label: "QBR", fullLabel: "Quarterback Rating", group: "Offense" },

  // Offense (Rushing)
  { key: "rushAtt", label: "R Att", fullLabel: "Rush Attempts", group: "Offense" },
  { key: "rushYds", label: "R Yds", fullLabel: "Rush Yards", group: "Offense" },
  { key: "rushYpc", label: "R YPC", fullLabel: "Rush Yards Per Carry", group: "Offense" },
  { key: "rushYpg", label: "R YPG", fullLabel: "Rush Yards Per Game", group: "Offense" },
  { key: "rushTd", label: "R TD", fullLabel: "Rush TD", group: "Offense" },
  { key: "rushFum", label: "R Fum", fullLabel: "Rushing Fumbles", group: "Offense" },
  { key: "rushYac", label: "R YAC", fullLabel: "Rushing YAC", group: "Offense" },
  { key: "rushBtk", label: "R BTk", fullLabel: "Rush Broken Tackles", group: "Offense" },
  { key: "rush20", label: "R 20+", fullLabel: "Rush 20+ Yards", group: "Offense" },

  // Offense (Receiving)
  { key: "recvCat", label: "Rec", fullLabel: "Receptions", group: "Offense" },
  { key: "recvYds", label: "Rec Yds", fullLabel: "Receiving Yards", group: "Offense" },
  { key: "recvYpc", label: "Rec YPC", fullLabel: "Receiving Yards Per Catch", group: "Offense" },
  { key: "recvYpg", label: "Rec YPG", fullLabel: "Receiving Yards Per Game", group: "Offense" },
  { key: "recvTd", label: "Rec TD", fullLabel: "Receiving TD", group: "Offense" },
  { key: "recvFum", label: "Rec Fum", fullLabel: "Receiving Fumbles", group: "Offense" },
  { key: "recvYac", label: "Rec YAC", fullLabel: "Receiving YAC", group: "Offense" },
  { key: "recvYaca", label: "YACA", fullLabel: "YAC Per Catch", group: "Offense" },
  { key: "recvDrops", label: "Drops", fullLabel: "Drops", group: "Offense" },

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
  const [tab, setTab] = useState("Offense");
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);

  const [confFilter, setConfFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");

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
    writeSeasonFilter(seasonYear);
    navigate({ pathname: "/player-stats", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, tab, sortKey, sortDir, confFilter, teamFilter, navigate, location.search]);

  useEffect(() => {
    setVisibleCount(200);
  }, [seasonYear, tab, confFilter, teamFilter]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !seasonYear) {
        setRows([]);
        setTeamSeasons([]);
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
      const name = `${first} ${last}`.trim() || `PGID ${r.pgid}`;
      const teamName = tgid ? teamNameByTgid.get(tgid) || `TGID ${tgid}` : "Unknown";
      const confName = tgid ? getConferenceName(confByTgid.get(tgid)) : "Unknown";
      return {
        ...r,
        tgid,
        playerName: name,
        playerSortName: `${last} ${first}`.trim() || name,
        teamName,
        confName,
      };
    });
  }, [rows, teamNameByTgid, confByTgid]);

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

  const filteredRows = useMemo(() => {
    return mergedRows.filter((r) => {
      if (confFilter !== "All" && r.confName !== confFilter) return false;
      if (teamFilter !== "All" && r.tgid !== teamFilter) return false;
      return true;
    });
  }, [mergedRows, confFilter, teamFilter]);

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
          <div style={{ display: "flex", gap: 6 }}>
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
                    "jersey",
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
        </div>
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
          <div className="muted" style={{ marginBottom: 8 }}>
            Showing {Math.min(visibleCount, filteredRows.length)} of {filteredRows.length} players
          </div>
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
                    onClick={() => clickSort("jersey")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                  >
                    #{sortIndicator("jersey")}
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
                    <td data-label="Player">{r.playerName}</td>
                    <td data-label="Team">
                      {r.tgid ? (
                        <Link to={`/team/${r.tgid}`} style={{ color: "inherit", textDecoration: "none" }}>
                          {r.teamName}
                        </Link>
                      ) : (
                        r.teamName
                      )}
                    </td>
                    <td data-label="Pos">{positionLabel(r.position)}</td>
                    <td data-label="Yr">{classLabel(r.classYear)}</td>
                    <td data-label="#">{Number.isFinite(Number(r.jersey)) ? Number(r.jersey) : ""}</td>
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
