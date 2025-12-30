import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loadTeamAbbreviationIndex, matchTeamAbbreviation } from "../abbreviationService";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import {
  ONE_DECIMAL_KEYS,
  classLabel,
  derivedValue,
  formatStat,
  getPlayerCardStatDefs,
  getGpForTab,
  positionLabel,
  rowHasStatsForTab,
} from "../playerStatsUtils";


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

const TAB_ORDER = ["Passing", "Rushing", "Receiving", "Defense", "Scoring", "Kicking", "Punting", "Returns"];
const OFFENSE_TABS = ["Passing", "Rushing", "Receiving"];
const SPECIAL_TEAMS_TABS = [
  { key: "Returns", label: "Returning" },
  { key: "Kicking", label: "Kicking" },
  { key: "Punting", label: "Punting" },
];
const CATEGORY_TABS = ["Offense", "Defense", "Scoring", "Special Teams"];

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

function normalizeTab(tab) {
  return tab === "Kicking" || tab === "Returns" || tab === "Punting" ? "Special Teams" : tab;
}

function categoryForTab(tab) {
  if (OFFENSE_TABS.includes(tab)) return "Offense";
  if (tab === "Defense") return "Defense";
  if (tab === "Scoring") return "Scoring";
  if (tab === "Kicking" || tab === "Returns" || tab === "Punting") return "Special Teams";
  return "Offense";
}

function defaultTabForCategory(category) {
  if (category === "Defense") return "Defense";
  if (category === "Scoring") return "Scoring";
  if (category === "Special Teams") return "Returns";
  return "Passing";
}

function statsDefsForTab(tab) {
  if (tab !== "Kicking" && tab !== "Returns" && tab !== "Punting") return getPlayerCardStatDefs(tab);

  const all = getPlayerCardStatDefs("Special Teams");
  const kickingKeys = new Set(["fgm", "fga", "fgPct", "fgLong", "xpm", "xpa", "xpPct"]);
  const puntingKeys = new Set(["puntAtt", "puntYds", "puntAvg", "puntLong", "puntIn20", "puntBlocked"]);
  const returnsKeys = new Set([
    "krAtt",
    "krYds",
    "krAvg",
    "krLong",
    "krTd",
    "prAtt",
    "prYds",
    "prAvg",
    "prLong",
    "prTd",
  ]);
  const allowed = tab === "Kicking" ? kickingKeys : tab === "Punting" ? puntingKeys : returnsKeys;
  return all.filter((d) => allowed.has(d.key));
}

const DERIVED_STAT_KEYS = new Set(["retTd", "totalTd", "scoringPts"]);

function valueForStat(row, key, tab) {
  const effectiveTab = normalizeTab(tab);
  if (key === "gp") return getGpForTab(row, effectiveTab);
  if (ONE_DECIMAL_KEYS.has(key) || DERIVED_STAT_KEYS.has(key)) {
    return derivedValue(row, key, getGpForTab(row, effectiveTab));
  }
  return row[key];
}

function fallbackTeamAbbr(name) {
  const cleaned = String(name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]/g, "");
  if (!cleaned) return "";
  return cleaned.length > 4 ? cleaned.slice(0, 4) : cleaned;
}


export default function PlayerStats() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [seasonYear, setSeasonYear] = useState(null);
  const [tab, setTab] = useState("Passing");
  const [loading, setLoading] = useState(true);
  const [initLoaded, setInitLoaded] = useState(false);
  const [seasonLoaded, setSeasonLoaded] = useState(false);

  const [rows, setRows] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());
  const [abbrIndex, setAbbrIndex] = useState(null);

  const [confFilter, setConfFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [posFilter, setPosFilter] = useState("All");
  const [playerFilter, setPlayerFilter] = useState("");

  const [sortKey, setSortKey] = useState("playerName");
  const [sortDir, setSortDir] = useState("asc");
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
    const tabParam = params.get("tab");
    const sort = params.get("sort");
    const dir = params.get("dir");
    const conf = params.get("conf");
    const team = params.get("team");
    const pos = params.get("pos");
    const player = params.get("player");

    const resolved = getSeasonFromParamOrSaved(season);
    if (resolved != null) {
      const n = Number(resolved);
      if (Number.isFinite(n)) setSeasonYear(n);
    }
    if (tabParam === "Special Teams") {
      setTab("Returns");
    } else if (tabParam === "Scoring") {
      setTab("Scoring");
    } else if (tabParam === "Returning") {
      setTab("Returns");
    } else if (tabParam && TAB_ORDER.includes(tabParam)) {
      setTab(tabParam);
    }
    if (sort) setSortKey(sort);
    if (dir === "asc" || dir === "desc") setSortDir(dir);
    if (conf) setConfFilter(conf);
    if (team) setTeamFilter(team);
    if (pos) setPosFilter(pos);
    if (player) setPlayerFilter(player);
  }, [location.search]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const id = await getActiveDynastyId();
      setDynastyId(id);
      if (!id) {
        setAvailableYears([]);
        setSeasonYear(null);
        setInitLoaded(true);
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
      setInitLoaded(true);
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
    if (playerFilter.trim()) {
      params.set("player", playerFilter.trim());
    } else {
      params.delete("player");
    }
    writeSeasonFilter(seasonYear);
    navigate({ pathname: "/player-stats", search: `?${params.toString()}` }, { replace: true });
  }, [
    dynastyId,
    seasonYear,
    tab,
    sortKey,
    sortDir,
    confFilter,
    teamFilter,
    posFilter,
    playerFilter,
    navigate,
    location.search,
  ]);

  useEffect(() => {
    setVisibleCount(100);
  }, [seasonYear, tab, confFilter, teamFilter, posFilter, playerFilter]);

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
    } else if (tab === "Defense") {
      setSortKey("defTkl");
      setSortDir("desc");
    } else if (tab === "Kicking") {
      setSortKey("fgm");
      setSortDir("desc");
    } else if (tab === "Returns") {
      setSortKey("krYds");
      setSortDir("desc");
    } else if (tab === "Punting") {
      setSortKey("puntYds");
      setSortDir("desc");
    } else if (tab === "Scoring") {
      setSortKey("scoringPts");
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
        setSeasonLoaded(false);
        setLoading(false);
        return;
      }

      setSeasonLoaded(false);
      setLoading(true);
      const [statsRows, seasonTeams] = await Promise.all([
        db.playerSeasonStats.where({ dynastyId, seasonYear }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear }).toArray(),
      ]);

      if (!alive) return;

      setRows(statsRows);
      setTeamSeasons(seasonTeams);
      setSeasonLoaded(true);
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

  useEffect(() => {
    let alive = true;

    (async () => {
      const index = await loadTeamAbbreviationIndex();
      if (!alive) return;
      setAbbrIndex(index);
    })();

    return () => {
      alive = false;
    };
  }, []);

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

  const teamAbbrByTgid = useMemo(() => {
    const map = new Map();
    for (const t of teamSeasons) {
      const tgid = String(t.tgid ?? "");
      if (!tgid) continue;
      const explicit = String(t.tmab ?? "").trim();
      const name = teamNameByTgid.get(tgid) || `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
      const fromCsv = matchTeamAbbreviation(name, abbrIndex);
      map.set(tgid, fromCsv || explicit || fallbackTeamAbbr(name));
    }
    return map;
  }, [teamSeasons, teamNameByTgid, abbrIndex]);

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
      const teamAbbr = tgid ? teamAbbrByTgid.get(tgid) || "" : "";
      const confName = tgid ? getConferenceName(confByTgid.get(tgid)) : "Unknown";
      const logoUrl = overrideByTgid.get(tgid) || logoByTgid.get(tgid) || null;
      return {
        ...r,
        tgid,
        playerName: name,
        playerNameBase: nameBase,
        playerSortName: `${last} ${first}`.trim() || nameBase,
        teamName,
        teamAbbr,
        confName,
        logoUrl,
        jerseyNumber: jersey,
      };
    });
  }, [rows, teamNameByTgid, teamAbbrByTgid, confByTgid, logoByTgid, overrideByTgid]);

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
    const q = playerFilter.trim().toLowerCase();
    return mergedRows.filter((r) => {
      if (q) {
        const name = String(r.playerName ?? "").toLowerCase();
        const nameBase = String(r.playerNameBase ?? "").toLowerCase();
        const pgid = String(r.pgid ?? "").toLowerCase();
        if (!name.includes(q) && !nameBase.includes(q) && !pgid.includes(q)) return false;
      }
      if (confFilter !== "All" && r.confName !== confFilter) return false;
      if (teamFilter !== "All" && r.tgid !== teamFilter) return false;
      if (posFilter !== "All" && positionCategory(r.position) !== posFilter) return false;
      return true;
    });
  }, [mergedRows, confFilter, teamFilter, posFilter, playerFilter]);

  const colsForTab = useMemo(() => statsDefsForTab(tab), [tab]);
  const category = useMemo(() => categoryForTab(tab), [tab]);

  const tabRows = useMemo(() => {
    if (!colsForTab.length) return filteredRows;
    return filteredRows.filter((row) => rowHasStatsForTab(row, colsForTab, normalizeTab(tab)));
  }, [filteredRows, colsForTab, tab]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;
    const arr = [...tabRows];

    arr.sort((a, b) => {
      const av =
        key === "playerName"
          ? a.playerSortName
          : key === "teamName"
            ? a.teamName
          : valueForStat(a, key, tab);
      const bv =
        key === "playerName"
          ? b.playerSortName
          : key === "teamName"
            ? b.teamName
            : valueForStat(b, key, tab);

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
  }, [tabRows, sortKey, sortDir, tab]);

  const displayedRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount]);

  function clickSort(nextKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir("desc");
      return;
    }
    setSortDir((curDir) => (curDir === "asc" ? "desc" : "asc"));
  }

  function setTabWithSort(nextTab) {
    setTab(nextTab);
    const allowedKeys = new Set([
      "playerName",
      "position",
      "classYear",
      "gp",
      ...statsDefsForTab(nextTab).map((d) => d.key),
    ]);
    setSortKey((cur) => (allowedKeys.has(cur) ? cur : "playerName"));
  }

  function sortIndicator(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const hasAnyYears = availableYears.length > 0;
  const isReturnsTab = tab === "Returns";
  const isScoringTab = tab === "Scoring";
  const isDefenseTab = tab === "Defense";
  const isKickingTab = tab === "Kicking";
  const headerScope = useMemo(() => {
    if (teamFilter !== "All") return teamNameByTgid.get(teamFilter) || `TGID ${teamFilter}`;
    if (confFilter !== "All") return confFilter;
    return "All Conferences";
  }, [teamFilter, confFilter, teamNameByTgid]);
  const tabLabel = tab === "Returns" ? "Returning" : tab;
  const headerStatLabel =
    category === "Offense" || category === "Special Teams" ? tabLabel : category;
  const headerYear = seasonYear != null ? String(seasonYear) : "";
  const headerText = `${headerScope} Player ${headerStatLabel} Stats${headerYear ? ` ${headerYear}` : ""}`;

  return (
    <div>
      <div className="playerStatsHeader">
        <h2>{headerText}</h2>
      </div>

      <div className="playerStatsCategoryRow">
        {CATEGORY_TABS.map((cat) => (
          <button
            key={cat}
            className={`toggleBtn playerStatsCategoryBtn${category === cat ? " active" : ""}`}
            onClick={() => {
              const nextTab = defaultTabForCategory(cat);
              setTabWithSort(nextTab);
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="playerStatsControlRow">
        {category === "Offense" ? (
          <div className="playerStatsSubTabs">
            {OFFENSE_TABS.map((t) => (
              <button
                key={t}
                className={`toggleBtn playerStatsSubTabBtn${tab === t ? " active" : ""}`}
                onClick={() => setTabWithSort(t)}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

        {category === "Special Teams" ? (
          <div className="playerStatsSubTabs">
            {SPECIAL_TEAMS_TABS.map((t) => (
              <button
                key={t.key}
                className={`toggleBtn playerStatsSubTabBtn${tab === t.key ? " active" : ""}`}
                onClick={() => setTabWithSort(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="playerStatsFilters">
          <select
            value={seasonYear ?? ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSeasonYear(next);
              writeSeasonFilter(next);
            }}
            disabled={!hasAnyYears}
            aria-label="Year"
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

          <select
            value={confFilter}
            onChange={(e) => {
              setConfFilter(e.target.value);
              setTeamFilter("All");
            }}
            disabled={!confOptions.length}
            aria-label="Conference"
          >
            <option value="All">All Conferences</option>
            {confOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={teamFilter}
            onChange={(e) => {
              const next = e.target.value;
              setTeamFilter(next);
              if (next !== "All") setConfFilter("All");
            }}
            disabled={!teamOptions.length}
            aria-label="Team"
          >
            <option value="All">All Teams</option>
            {teamOptions.map((t) => (
              <option key={t.tgid} value={t.tgid}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            disabled={!positionOptions.length}
            aria-label="Position"
          >
            <option value="All">All Positions</option>
            {positionOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <input
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            placeholder="Search player"
            aria-label="Search player"
          />
        </div>
      </div>

      {loading || !initLoaded || (dynastyId && seasonYear != null && !seasonLoaded) ? (
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
                {isReturnsTab ? (
                  <>
                    <tr>
                      <th colSpan={2} className="tableGroupDivider"></th>
                      <th colSpan={3} className="tableGroupDivider"></th>
                      <th colSpan={5} className="tableGroupHeader tableGroupDivider">KICKOFFS</th>
                      <th colSpan={5} className="tableGroupHeader tableGroupDivider">PUNTS</th>
                    </tr>
                    <tr>
                      <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>#</th>
                      <th
                        onClick={() => clickSort("playerName")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                      >
                        NAME{sortIndicator("playerName")}
                      </th>
                      <th
                        onClick={() => clickSort("position")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="tableGroupDivider centerCol"
                      >
                        POS{sortIndicator("position")}
                      </th>
                      <th
                        onClick={() => clickSort("classYear")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        YR{sortIndicator("classYear")}
                      </th>
                        <th
                          onClick={() => clickSort("gp")}
                          style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                          title="Sort"
                          className="centerCol"
                        >
                          G{sortIndicator("gp")}
                        </th>

                      {colsForTab.map((c, idx) => {
                        const isKickoffStart = idx === 0;
                        const isPuntStart = idx === 5;
                        return (
                          <th
                            key={c.key}
                            onClick={() => clickSort(c.key)}
                            style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                            title={c.fullLabel}
                            className={`${isKickoffStart || isPuntStart ? "tableGroupDivider " : ""}statCol`}
                          >
                            {c.label}
                            {sortIndicator(c.key)}
                          </th>
                        );
                      })}
                    </tr>
                  </>
                ) : isKickingTab ? (
                  <>
                    <tr>
                      <th colSpan={5}></th>
                      <th colSpan={4} className="tableGroupHeader tableGroupDivider">FIELD GOALS</th>
                      <th colSpan={3} className="tableGroupHeader tableGroupDivider">EXTRA POINTS</th>
                    </tr>
                    <tr>
                      <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>#</th>
                      <th
                        onClick={() => clickSort("playerName")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                      >
                        NAME{sortIndicator("playerName")}
                      </th>
                      <th
                        onClick={() => clickSort("position")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        POS{sortIndicator("position")}
                      </th>
                      <th
                        onClick={() => clickSort("classYear")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        YR{sortIndicator("classYear")}
                      </th>
                      <th
                        onClick={() => clickSort("gp")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        G{sortIndicator("gp")}
                      </th>

                      {colsForTab.map((c, idx) => {
                        const isFgStart = idx === 0;
                        const isXpStart = idx === 4;
                        return (
                          <th
                            key={c.key}
                            onClick={() => clickSort(c.key)}
                            style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                            title={c.fullLabel}
                            className={`${isFgStart || isXpStart ? "tableGroupDivider " : ""}statCol`}
                          >
                            {c.label}
                            {sortIndicator(c.key)}
                          </th>
                        );
                      })}
                    </tr>
                  </>
                ) : isDefenseTab ? (
                  <>
                    <tr>
                      <th colSpan={5}></th>
                      <th colSpan={3} className="tableGroupHeader tableGroupDivider">TACKLES</th>
                      <th colSpan={4} className="tableGroupHeader tableGroupDivider">INTERCEPTIONS</th>
                      <th colSpan={3} className="tableGroupHeader tableGroupDivider">FUMBLES</th>
                      <th colSpan={3} className="tableGroupHeader tableGroupDivider">SCORING</th>
                    </tr>
                    <tr>
                      <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>#</th>
                      <th
                        onClick={() => clickSort("playerName")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                      >
                        NAME{sortIndicator("playerName")}
                      </th>
                      <th
                        onClick={() => clickSort("position")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        POS{sortIndicator("position")}
                      </th>
                      <th
                        onClick={() => clickSort("classYear")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        YR{sortIndicator("classYear")}
                      </th>
                      <th
                        onClick={() => clickSort("gp")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        G{sortIndicator("gp")}
                      </th>

                      {colsForTab.map((c, idx) => {
                        const isTackleStart = idx === 0;
                        const isIntStart = idx === 3;
                        const isFumbleStart = idx === 7;
                        const isScoreStart = idx === 10;
                        return (
                          <th
                            key={c.key}
                            onClick={() => clickSort(c.key)}
                            style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                            title={c.fullLabel}
                            className={`${
                              isTackleStart || isIntStart || isFumbleStart || isScoreStart
                                ? "tableGroupDivider "
                                : ""
                            }statCol`}
                          >
                            {c.label}
                            {sortIndicator(c.key)}
                          </th>
                        );
                      })}
                    </tr>
                  </>
                ) : isScoringTab ? (
                  <>
                    <tr>
                      <th colSpan={2}></th>
                      <th colSpan={3} className="tableGroupDivider"></th>
                      <th colSpan={4} className="tableGroupHeader tableGroupDivider">TOUCHDOWNS</th>
                        <th colSpan={5} className="tableGroupHeader tableGroupDivider">SCORING</th>
                      </tr>
                    <tr>
                      <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>#</th>
                      <th
                        onClick={() => clickSort("playerName")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                      >
                        NAME{sortIndicator("playerName")}
                      </th>
                      <th
                        onClick={() => clickSort("position")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="tableGroupDivider centerCol"
                      >
                        POS{sortIndicator("position")}
                      </th>
                      <th
                        onClick={() => clickSort("classYear")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        YR{sortIndicator("classYear")}
                      </th>
                      <th
                        onClick={() => clickSort("gp")}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="Sort"
                        className="centerCol"
                      >
                        G{sortIndicator("gp")}
                      </th>

                      {colsForTab.map((c, idx) => {
                        const isTdStart = idx === 0;
                        const isScoreStart = idx === 4;
                        return (
                          <th
                            key={c.key}
                            onClick={() => clickSort(c.key)}
                            style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                            title={c.fullLabel}
                            className={`${isTdStart || isScoreStart ? "tableGroupDivider " : ""}statCol`}
                          >
                            {c.label}
                            {sortIndicator(c.key)}
                          </th>
                        );
                      })}
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>#</th>
                    <th
                      onClick={() => clickSort("playerName")}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="Sort"
                    >
                      NAME{sortIndicator("playerName")}
                    </th>
                    <th
                      onClick={() => clickSort("position")}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="Sort"
                      className="centerCol"
                    >
                      POS{sortIndicator("position")}
                    </th>
                    <th
                      onClick={() => clickSort("classYear")}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="Sort"
                      className="centerCol"
                    >
                      YR{sortIndicator("classYear")}
                    </th>
                    <th
                      onClick={() => clickSort("gp")}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="Sort"
                      className="centerCol"
                    >
                      G{sortIndicator("gp")}
                    </th>

                    {colsForTab.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => clickSort(c.key)}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title={c.fullLabel}
                        className="statCol"
                      >
                        {c.label}
                        {sortIndicator(c.key)}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {displayedRows.map((r) => (
                  <tr key={`${r.pgid}-${r.seasonYear}`}>
                    <td data-label="#" style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          minWidth: 28,
                          color: "var(--muted)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.jerseyNumber != null ? `#${r.jerseyNumber}` : ""}
                      </span>
                    </td>
                    <td data-label="Player">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {r.tgid && r.logoUrl ? (
                          <Link
                            to={`/team/${r.tgid}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                            title={r.teamName}
                          >
                            <img
                              className="teamLogo"
                              src={r.logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          </Link>
                        ) : null}
                        {r.playerUid ? (
                          <Link
                            to={`/player/${r.playerUid}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {r.playerNameBase || r.playerName}
                          </Link>
                        ) : (
                          <span>{r.playerNameBase || r.playerName}</span>
                        )}
                        {r.teamAbbr ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontWeight: 400,
                              fontSize: "0.8em",
                              color: "var(--muted)",
                            }}
                          >
                            {r.teamAbbr}
                          </span>
                        ) : null}
                      </span>
                    </td>
                      <td
                        data-label="POS"
                        className={`${
                          isReturnsTab || isScoringTab ? "tableGroupDivider " : ""
                        }centerCol`}
                      >
                        {positionLabel(r.position)}
                      </td>
                    <td data-label="YR" className="centerCol">{classLabel(r.classYear)}</td>
                      <td data-label="G" className="centerCol">
                        {Number.isFinite(getGpForTab(r, normalizeTab(tab)))
                          ? getGpForTab(r, normalizeTab(tab))
                          : ""}
                      </td>
                    {colsForTab.map((c, idx) => {
                      const isKickoffStart = idx === 0;
                      const isPuntStart = idx === 5;
                      const isTdStart = idx === 0;
                      const isScoreStart = idx === 4;
                      const isTackleStart = idx === 0;
                      const isIntStart = idx === 3;
                      const isFumbleStart = idx === 7;
                      const isDefenseScoreStart = idx === 10;
                      const isFgStart = idx === 0;
                      const isXpStart = idx === 4;
                      const isGroupStart = isReturnsTab
                        ? isKickoffStart || isPuntStart
                        : isScoringTab
                          ? isTdStart || isScoreStart
                          : isDefenseTab
                            ? isTackleStart || isIntStart || isFumbleStart || isDefenseScoreStart
                            : isKickingTab
                              ? isFgStart || isXpStart
                              : false;
                      const rawValue = valueForStat(r, c.key, tab);
                      const displayValue = isScoringTab && !Number.isFinite(rawValue)
                        ? "0"
                        : formatStat(rawValue, c.key);
                      return (
                        <td
                          key={c.key}
                          data-label={c.fullLabel || c.label}
                          className={`${isGroupStart ? "tableGroupDivider " : ""}statCol`}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < filteredRows.length ? (
            <div style={{ marginTop: 12 }}>
              <button
                className="toggleBtn"
                  onClick={() => setVisibleCount((cur) => cur + 100)}
                >
                  Load 100 more
                </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
