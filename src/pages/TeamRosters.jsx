import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loadTeamAbbreviationIndex, matchTeamAbbreviation } from "../abbreviationService";
import HeaderLogo from "../components/HeaderLogo";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { loadConferenceLogoMap, normalizeConfKey } from "../logoService";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import { POSITION_LABELS, classLabel, positionLabel } from "../playerStatsUtils";

const FALLBACK_TEAM_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";
const FALLBACK_CONF_LOGO = FALLBACK_TEAM_LOGO;

const POSITION_FILTER_ORDER = [
  "QB",
  "HB",
  "FB",
  "WR",
  "TE",
  "OT",
  "OG",
  "C",
  "Edge",
  "DT",
  "LB",
  "CB",
  "SS",
  "FS",
  "K",
  "P",
];

const POSITION_CODE_BY_LABEL = new Map(
  POSITION_LABELS.map((label, idx) => [label, idx]).filter(([label]) => label)
);

const POSITION_FILTER_CODES = new Map([
  ["Edge", ["LE", "RE"]],
  ["LB", ["LOLB", "MLB", "ROLB"]],
  ["DT", ["DT"]],
  ["CB", ["CB"]],
  ["SS", ["SS"]],
  ["FS", ["FS"]],
  ["QB", ["QB"]],
  ["HB", ["HB"]],
  ["FB", ["FB"]],
  ["WR", ["WR"]],
  ["TE", ["TE"]],
  ["OT", ["LT", "RT"]],
  ["OG", ["LG", "RG"]],
  ["C", ["C"]],
  ["K", ["K"]],
  ["P", ["P"]],
]);

function positionCodesForFilter(filter) {
  const labels = POSITION_FILTER_CODES.get(filter) || [];
  return labels
    .map((label) => POSITION_CODE_BY_LABEL.get(label))
    .filter((code) => Number.isFinite(code));
}

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
  if (label === "LT" || label === "RT") return "OT";
  if (label === "LG" || label === "RG") return "OG";
  if (label === "C") return "C";
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

function fallbackTeamAbbr(name) {
  const cleaned = String(name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]/g, "");
  if (!cleaned) return "";
  return cleaned.length > 4 ? cleaned.slice(0, 4) : cleaned;
}

const RATING_COLS = [
  { key: "povr", label: "OVR", divider: true },
  { key: "pspd", label: "SPD" },
  { key: "pstr", label: "STR" },
  { key: "pawr", label: "AWR" },
  { key: "pagi", label: "AGI" },
  { key: "pacc", label: "ACC" },
  { key: "pcth", label: "CTH" },
  { key: "pcar", label: "CAR" },
  { key: "pjmp", label: "JMP" },
  { key: "pbtk", label: "BTK" },
  { key: "ptak", label: "TAK" },
  { key: "pthp", label: "THP" },
  { key: "ptha", label: "THA" },
  { key: "ppbk", label: "PBK" },
  { key: "prbk", label: "RBK" },
  { key: "pkpr", label: "KPW" },
  { key: "pkac", label: "KAC" },
  { key: "psta", label: "STA" },
];

export default function TeamRosters() {
  const location = useLocation();
  const navigate = useNavigate();

  const [dynastyId, setDynastyId] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [seasonYear, setSeasonYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initLoaded, setInitLoaded] = useState(false);
  const [seasonLoaded, setSeasonLoaded] = useState(false);

  const [rows, setRows] = useState([]);
  const [baseRows, setBaseRows] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());
  const [confLogoByKey, setConfLogoByKey] = useState(new Map());
  const [identityByUid, setIdentityByUid] = useState(new Map());
  const [abbrIndex, setAbbrIndex] = useState(null);

  const [posFilter, setPosFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [confFilter, setConfFilter] = useState("All");

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [isCompactFilters, setIsCompactFilters] = useState(false);
  const filterMenuRef = useRef(null);

  const [sortKey, setSortKey] = useState("povr");
  const [sortDir, setSortDir] = useState("desc");
  const [visibleCount, setVisibleCount] = useState(100);

  const showPosColumn = posFilter === "All";
  const showTeamLogo = teamFilter === "All";
  const showTeamAbbr = teamFilter === "All";
  const [selectedTeamHeader, setSelectedTeamHeader] = useState({ loaded: false, name: "", logoUrl: "" });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia("(max-width: 1440px)");
    const sync = () => {
      const compact = Boolean(mql.matches);
      setIsCompactFilters(compact);
      setFiltersOpen(!compact);
    };

    sync();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }

    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, []);

  useEffect(() => {
    if (!isCompactFilters || !filtersOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };

    const onPointerDown = (e) => {
      const root = filterMenuRef.current;
      if (!root) return;
      if (root.contains(e.target)) return;
      setFiltersOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [filtersOpen, isCompactFilters]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
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

    if (sort) setSortKey(sort);
    if (dir === "asc" || dir === "desc") setSortDir(dir);
    if (pos) setPosFilter(pos);
    if (team) setTeamFilter(team);
    if (conf) setConfFilter(conf);
  }, []);

  useEffect(() => {
    if (teamFilter === "All") return;
    if (confFilter === "All") return;
    setConfFilter("All");
  }, [teamFilter, confFilter]);

  useEffect(() => {
    if (!dynastyId || seasonYear == null || teamFilter === "All") {
      setSelectedTeamHeader({ loaded: false, name: "", logoUrl: "" });
      return;
    }

    let alive = true;
    setSelectedTeamHeader((cur) => ({ ...cur, loaded: false }));

    (async () => {
      const tgidRaw = String(teamFilter);
      const tgidNum = Number(tgidRaw);
      const keys = [tgidRaw];
      if (Number.isFinite(tgidNum)) keys.push(tgidNum);

      const firstMatch = async (queryForKey) => {
        for (const key of keys) {
          // eslint-disable-next-line no-await-in-loop
          const row = await queryForKey(key);
          if (row) return row;
        }
        return null;
      };

      const [teamRow, logoRow, overrideRow] = await Promise.all([
        firstMatch((key) =>
          db.teamSeasons.where("[dynastyId+seasonYear+tgid]").equals([dynastyId, seasonYear, key]).first()
        ),
        firstMatch((key) => db.teamLogos.where("[dynastyId+tgid]").equals([dynastyId, key]).first()),
        firstMatch((key) => db.logoOverrides.where("[dynastyId+tgid]").equals([dynastyId, key]).first()),
      ]);

      if (!alive) return;

      const tdna = String(teamRow?.tdna ?? "").trim();
      const tmna = String(teamRow?.tmna ?? "").trim();
      const name = `${tdna}${tdna && tmna ? " " : ""}${tmna}`.trim() || `TGID ${tgidRaw}`;

      const logoUrl = String(overrideRow?.url ?? "").trim()
        || String(logoRow?.url ?? "").trim()
        || FALLBACK_TEAM_LOGO;

      setSelectedTeamHeader({ loaded: true, name, logoUrl });
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear, teamFilter]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const id = await getActiveDynastyId();
      if (!alive) return;
      setDynastyId(id);

      if (!id) {
        setInitLoaded(true);
        setLoading(false);
        return;
      }

      const statsRows = await db.playerSeasonStats.where({ dynastyId: id }).toArray();
      if (!alive) return;

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

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) return;
    const params = new URLSearchParams(location.search);
    params.set("season", String(seasonYear));
    params.set("sort", sortKey);
    params.set("dir", sortDir);
    params.set("pos", posFilter);
    params.set("team", teamFilter);
    params.set("conf", confFilter);
    writeSeasonFilter(seasonYear);
    navigate({ pathname: "/team-rosters", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, sortKey, sortDir, posFilter, teamFilter, confFilter, navigate, location.search]);

  useEffect(() => {
    setVisibleCount(100);
  }, [seasonYear, posFilter, teamFilter, confFilter]);

  useEffect(() => {
    if (!dynastyId) {
      setIdentityByUid(new Map());
      return;
    }

    let alive = true;

    (async () => {
      const identityRows = await db.playerIdentities.where({ dynastyId }).toArray();
      if (!alive) return;
      const map = new Map(
        identityRows
          .map((r) => {
            const uid = String(r.playerUid ?? "").trim();
            return uid ? [uid, r] : null;
          })
          .filter(Boolean)
      );
      setIdentityByUid(map);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId]);

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
      const map = await loadConferenceLogoMap();
      if (!alive) return;
      setConfLogoByKey(map);
    })();

    return () => {
      alive = false;
    };
  }, []);

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

  useEffect(() => {
    if (!dynastyId || seasonYear == null) return;

    let alive = true;
    setSeasonLoaded(false);

    (async () => {
      const statsQuery = (() => {
        if (teamFilter !== "All") {
          return db.playerSeasonStats
            .where("[dynastyId+seasonYear+tgid]")
            .equals([dynastyId, seasonYear, teamFilter]);
        }
        if (posFilter !== "All") {
          const codes = positionCodesForFilter(posFilter);
          if (codes.length === 1) {
            return db.playerSeasonStats
              .where("[dynastyId+seasonYear+position]")
              .equals([dynastyId, seasonYear, codes[0]]);
          }
          if (codes.length > 1) {
            return db.playerSeasonStats
              .where("[dynastyId+seasonYear+position]")
              .anyOf(codes.map((code) => [dynastyId, seasonYear, code]));
          }
        }
        return db.playerSeasonStats.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]);
      })();

      const baseQuery = (() => {
        if (teamFilter !== "All") {
          return db.playerSeasonStats
            .where("[dynastyId+seasonYear+tgid]")
            .equals([dynastyId, seasonYear, teamFilter]);
        }
        return db.playerSeasonStats.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]);
      })();

      const [statsRows, baseStatsRows, seasonTeams] = await Promise.all([
        statsQuery.toArray(),
        baseQuery.toArray(),
        db.teamSeasons.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
      ]);

      if (!alive) return;

      setRows(statsRows);
      setBaseRows(baseStatsRows);
      setTeamSeasons(seasonTeams);
      setSeasonLoaded(true);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear, teamFilter, posFilter]);

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
      const name =
        teamNameByTgid.get(tgid) || `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
      const fromCsv = matchTeamAbbreviation(name, abbrIndex);
      map.set(tgid, fromCsv || explicit || fallbackTeamAbbr(name));
    }
    return map;
  }, [teamSeasons, teamNameByTgid, abbrIndex]);

  const confByTgid = useMemo(() => {
    return new Map(teamSeasons.map((t) => [String(t.tgid), t.cgid]));
  }, [teamSeasons]);

  const baseRowsForPositionOptions = useMemo(() => {
    if (teamFilter !== "All") return baseRows;
    if (confFilter === "All") return baseRows;

    const desired = confFilter;
    return baseRows.filter((r) => {
      const tgid = r.tgid != null ? String(r.tgid) : "";
      if (!tgid) return false;
      const confName = getConferenceName(confByTgid.get(tgid));
      return confName === desired;
    });
  }, [baseRows, teamFilter, confFilter, confByTgid]);

  const mergedRows = useMemo(() => {
    return rows.map((r) => {
      const tgid = r.tgid != null ? String(r.tgid) : "";
      const identity = r.playerUid ? identityByUid.get(String(r.playerUid)) || null : null;
      const first = String(identity?.firstName ?? r.firstName ?? "").trim();
      const last = String(identity?.lastName ?? r.lastName ?? "").trim();
      const nameBase = `${first} ${last}`.trim() || `PGID ${r.pgid}`;
      const jersey = Number.isFinite(Number(r.jersey)) ? Number(r.jersey) : null;
      const confName = tgid ? getConferenceName(confByTgid.get(tgid)) : "Unknown";
      const teamName = tgid ? teamNameByTgid.get(tgid) || `TGID ${tgid}` : "Unknown";
      const teamAbbr = tgid ? teamAbbrByTgid.get(tgid) || "" : "";
      const logoUrl = tgid ? overrideByTgid.get(tgid) || logoByTgid.get(tgid) || null : null;
      return {
        ...r,
        tgid,
        playerName: nameBase,
        playerSortName: `${last} ${first}`.trim() || nameBase,
        jerseyNumber: jersey,
        confName,
        teamName,
        teamAbbr,
        logoUrl,
      };
    });
  }, [rows, identityByUid, confByTgid, teamNameByTgid, teamAbbrByTgid, logoByTgid, overrideByTgid]);

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
    baseRowsForPositionOptions.forEach((r) => {
      const label = positionCategory(r.position);
      if (label) uniq.add(label);
    });
    return POSITION_FILTER_ORDER.filter((label) => uniq.has(label));
  }, [baseRowsForPositionOptions]);

  const filteredRows = useMemo(() => {
    return mergedRows.filter((r) => {
      if (teamFilter !== "All" && r.tgid !== teamFilter) return false;
      if (confFilter !== "All" && r.confName !== confFilter) return false;
      if (posFilter !== "All" && positionCategory(r.position) !== posFilter) return false;
      return true;
    });
  }, [mergedRows, teamFilter, confFilter, posFilter]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;
    const arr = [...filteredRows];

    arr.sort((a, b) => {
      const av =
        key === "playerName"
          ? a.playerSortName
          : key === "jerseyNumber"
            ? a.jerseyNumber
            : key === "position"
              ? positionLabel(a.position)
              : key === "classYear"
                ? a.classYear
                : a[key];
      const bv =
        key === "playerName"
          ? b.playerSortName
          : key === "jerseyNumber"
            ? b.jerseyNumber
            : key === "position"
              ? positionLabel(b.position)
              : key === "classYear"
                ? b.classYear
                : b[key];

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

  const rankLabels = useMemo(() => {
    const labelForRow = (row) => {
      const v =
        sortKey === "playerName"
          ? row.playerSortName
          : sortKey === "jerseyNumber"
            ? row.jerseyNumber
            : sortKey === "position"
              ? positionLabel(row.position)
              : sortKey === "classYear"
                ? row.classYear
                : row[sortKey];
      const c = toComparable(v);
      return c == null ? "" : String(c);
    };

    const labels = new Array(sortedRows.length);
    let currentRank = 0;
    let previous = Symbol("rank");

    for (let index = 0; index < sortedRows.length; index += 1) {
      const key = labelForRow(sortedRows[index]);
      if (index === 0 || key !== previous) {
        currentRank += 1;
        previous = key;
      }
      labels[index] = String(currentRank);
    }

    return labels;
  }, [sortedRows, sortKey]);

  function clickSort(nextKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir(nextKey === "playerName" ? "asc" : "desc");
      return;
    }
    setSortDir((curDir) => (curDir === "asc" ? "desc" : "asc"));
  }

  function sortIndicator(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const headerScope = useMemo(() => {
    if (teamFilter !== "All") return teamNameByTgid.get(teamFilter) || `TGID ${teamFilter}`;
    if (confFilter !== "All") return confFilter;
    return "All Conferences";
  }, [teamFilter, confFilter, teamNameByTgid]);

  const hasAnyYears = availableYears.length > 0;
  const headerYear = seasonYear != null ? String(seasonYear) : "";
  const headerText = `${headerScope} Team Rosters${headerYear ? ` ${headerYear}` : ""}`;

  const selectedConfLogoUrl = useMemo(() => {
    if (teamFilter !== "All") return "";
    if (confFilter === "All") return "";
    return confLogoByKey.get(normalizeConfKey(confFilter)) || FALLBACK_CONF_LOGO;
  }, [teamFilter, confFilter, confLogoByKey]);

  const filterControls = (
    <>
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
          <option value="">No seasons imported</option>
        ) : (
          availableYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))
        )}
      </select>

      {teamFilter === "All" ? (
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
      ) : null}

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
    </>
  );

  const renderFilterMenu = (extraClassName = "") => {
    if (!isCompactFilters) return null;
    return (
      <div className={["filterMenuWrap", extraClassName].filter(Boolean).join(" ")} ref={filterMenuRef}>
        <button
          type="button"
          className="filterMenuBtn"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          aria-expanded={filtersOpen}
        >
          <span />
          <span />
          <span />
        </button>
        {filtersOpen ? (
          <div className="filterMenuPopover" role="dialog" aria-label="Filters">
            <div className="filterMenuHeader">Filters</div>
            <div className="playerStatsFilters filterMenuContent">{filterControls}</div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      {teamFilter !== "All" ? (
        selectedTeamHeader.loaded ? (
          <div className="hrow teamHeader">
            <div className="headerLogoWrap">
              <HeaderLogo
                src={selectedTeamHeader.logoUrl}
                fallbackSrc={FALLBACK_TEAM_LOGO}
                alt={selectedTeamHeader.name || "Team"}
              />
            </div>
            <h2>{selectedTeamHeader.name}</h2>
          </div>
        ) : null
      ) : confFilter !== "All" ? (
        <div className="hrow teamHeader bowlFilterHeader">
          <HeaderLogo
            src={selectedConfLogoUrl}
            fallbackSrc={FALLBACK_CONF_LOGO}
            alt={confFilter}
            className="bowlFilterLogo"
            size={180}
          />
          <h2>
            {confFilter} Players{headerYear ? ` ${headerYear}` : ""}
          </h2>
        </div>
      ) : (
        <div className="hrow">
          <h2>{headerText}</h2>
        </div>
      )}

      <div className="playerStatsControlRow flexRowWrap">
        {!isCompactFilters ? <div className="playerStatsFilters flexRowWrap">{filterControls}</div> : null}
        {isCompactFilters ? renderFilterMenu() : null}
      </div>

      {loading || !initLoaded || (dynastyId && seasonYear != null && !seasonLoaded) ? (
        <div className="muted">Loading...</div>
      ) : !hasAnyYears ? (
        <div className="muted">No roster data imported yet. Import a season with PLAY.csv.</div>
      ) : filteredRows.length === 0 ? (
        <div className="muted">No players found for {seasonYear}.</div>
      ) : (
        <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
          <div className="tableWrap statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
            <table className="table statsTable playerStatsTable teamRostersTable">
              <colgroup>
                <col className="playerStatsRankCol" />
                <col className="playerStatsJerseyCol" />
                <col className="playerStatsNameColWidth" />
                {showPosColumn ? <col className="playerStatsMetaCol" /> : null}
                <col className="playerStatsMetaCol" />
                {RATING_COLS.map((c) => (
                  <col key={c.key} className="playerStatsStatCol" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>RNK</th>
                  <th
                    onClick={() => clickSort("jerseyNumber")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: "left" }}
                    title="Sort"
                  >
                    #{sortIndicator("jerseyNumber")}
                  </th>
                  <th
                    onClick={() => clickSort("playerName")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                    className="playerStatsNameCol"
                  >
                    NAME{sortIndicator("playerName")}
                  </th>
                  {showPosColumn ? (
                    <th
                      onClick={() => clickSort("position")}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="Sort"
                      className="centerCol"
                    >
                      POS{sortIndicator("position")}
                    </th>
                  ) : null}
                  <th
                    onClick={() => clickSort("classYear")}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title="Sort"
                    className="centerCol dividerAfter"
                  >
                    YR{sortIndicator("classYear")}
                  </th>

                  {RATING_COLS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => clickSort(c.key)}
                      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="Sort"
                      className={`${c.divider ? "tableGroupDivider " : ""}statCol`}
                    >
                      {c.label}
                      {sortIndicator(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r, idx) => (
                  <tr key={`${r.playerUid || r.pgid || idx}`}>
                    <td data-label="RNK" className="centerCol">
                      {rankLabels[idx] || ""}
                    </td>
                    <td data-label="#" style={{ textAlign: "left" }}>
                      {r.jerseyNumber ?? ""}
                    </td>
                    <td data-label="NAME" className="playerStatsNameCol">
                      {r.playerUid ? (
                        <Link to={`/player/${r.playerUid}`} className="tableLink">
                          <span className="rosterNameCell">
                            {showTeamLogo && r.logoUrl ? (
                              <img
                                className="teamLogo"
                                src={r.logoUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : null}
                            {r.playerName}
                            {showTeamAbbr && r.teamAbbr ? (
                              <span className="playerInlineTeamAbbr">
                                {r.teamAbbr}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      ) : (
                        <span className="rosterNameCell">
                          {showTeamLogo && r.logoUrl ? (
                            <img
                              className="teamLogo"
                              src={r.logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                          {r.playerName}
                          {showTeamAbbr && r.teamAbbr ? (
                            <span className="playerInlineTeamAbbr">
                              {r.teamAbbr}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    {showPosColumn ? (
                      <td data-label="POS" className="centerCol">
                        {positionLabel(r.position)}
                      </td>
                    ) : null}
                    <td data-label="YR" className="centerCol dividerAfter">
                      {classLabel(r.classYear)}
                    </td>

                    {RATING_COLS.map((c) => {
                      const v = Number(r?.[c.key]);
                      return (
                        <td
                          key={c.key}
                          data-label={c.label}
                          className={`${c.divider ? "tableGroupDivider " : ""}statCol`}
                        >
                          {Number.isFinite(v) ? v : ""}
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
              <button className="toggleBtn" onClick={() => setVisibleCount((cur) => cur + 100)}>
                Load 100 more
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
