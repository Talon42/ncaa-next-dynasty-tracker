import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import { getConferenceName } from "../conferences";

const FALLBACK_TEAM_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

/**
 * Team Stats (TSSE)
 * - Keys are the TSSE column names. We also support older imports where TSSE headers
 *   were mixed-case by building a lowercase lookup map per row.
 *
 * Notes:
 * - Offense Total Yards is TSSE column "tsTy" (case sensitive)
 * - Defensive Total Yards is NOT a TSSE column; it is derived as tsdp + tsdy
 * - Pts/Gm (Off/Def) are derived from SCHD -> db.games (scored/allowed per games with scores)
 */
const STAT_DEFS = [
  // Offense (requested order)
  { key: "tsoy", label: "TOT OFF", fullLabel: "Total Offense", group: "Offense" },
  { key: "totOffYpg", label: "YDS/G", fullLabel: "Total Offense Yards Per Game", group: "Offense" },
  { key: "tsop", label: "PASS YDS", fullLabel: "Passing Yards", group: "Offense" },
  { key: "passYpg", label: "YDS/G", fullLabel: "Passing Yards Per Game", group: "Offense" },
  { key: "tspt", label: "TD", fullLabel: "Passing TD", group: "Offense" },
  { key: "tsor", label: "RUSH YDS", fullLabel: "Rushing Yards", group: "Offense" },
  { key: "rushYpg", label: "YDS/G", fullLabel: "Rushing Yards Per Game", group: "Offense" },
  { key: "tsrt", label: "TD", fullLabel: "Rushing TD", group: "Offense" },
  { key: "offPtsTotal", label: "PTS", fullLabel: "Total Points Scored", group: "Offense" },
  { key: "offPtsPerGame", label: "PTS/GM", fullLabel: "Points Scored Per Game", group: "Offense" },

  // Defense (requested order + additions)
  { key: "defTotYds", label: "TOT YDS", fullLabel: "Total Yards Allowed", group: "Defense" },
  { key: "defTotYpg", label: "YDS/G", fullLabel: "Total Yards Allowed Per Game", group: "Defense" },
  { key: "tsdp", label: "PASS YDS", fullLabel: "Passing Yards Allowed", group: "Defense" },
  { key: "defPassYpg", label: "YDS/G", fullLabel: "Passing Yards Allowed Per Game", group: "Defense" },
  { key: "tssk", label: "SACK", fullLabel: "Sacks", group: "Defense" },
  { key: "tsdy", label: "RUSH YDS", fullLabel: "Rushing Yards Allowed", group: "Defense" },
  { key: "defRushYpg", label: "YDS/G", fullLabel: "Rushing Yards Allowed Per Game", group: "Defense" },
  { key: "defPtsPerGame", label: "PTS/G", fullLabel: "Points Allowed Per Game", group: "Defense" },
  { key: "tsdi", label: "INT", fullLabel: "Interceptions", group: "Defense" },
  { key: "tsff", label: "FF", fullLabel: "Forced Fumbles", group: "Defense" },
  { key: "tsfr", label: "FR", fullLabel: "Fumble Recoveries", group: "Defense" },

  // Efficiency (requested order)
  { key: "ts3c", label: "3DC", fullLabel: "3rd Down Conversions", group: "Efficiency" },
  { key: "ts3d", label: "3DA", fullLabel: "3rd Down Attempts", group: "Efficiency" },
  { key: "ts4c", label: "4DC", fullLabel: "4th Down Conversions", group: "Efficiency" },
  { key: "ts4d", label: "4DA", fullLabel: "4th Down Attempts", group: "Efficiency" },
  { key: "ts2c", label: "2PC", fullLabel: "2 Point Conversions", group: "Efficiency" },
  { key: "ts2a", label: "2PA", fullLabel: "2 Point Attempts", group: "Efficiency" },
  { key: "tsoz", label: "ATT", fullLabel: "Offensive RZ Attempts", group: "Efficiency" },
  { key: "tsot", label: "TD", fullLabel: "Offensive RZ TD", group: "Efficiency" },
  { key: "tsof", label: "FG", fullLabel: "Offensive RZ FG", group: "Efficiency" },
  { key: "tsdr", label: "ATT", fullLabel: "Defensive RZ Attempts", group: "Efficiency" },
  { key: "tsdt", label: "TD", fullLabel: "Defensive RZ TD", group: "Efficiency" },
  { key: "tsdf", label: "FG", fullLabel: "Defensive RZ FG", group: "Efficiency" },
  { key: "tspe", label: "PEN", fullLabel: "Penalties", group: "Efficiency" },
  { key: "penPerGame", label: "PEN/G", fullLabel: "Penalties Per Game", group: "Efficiency" },
  { key: "tspy", label: "PEN YDS", fullLabel: "Penalty Yards", group: "Efficiency" },
];

const EFFICIENCY_COMPACT_DEFS = [
  { key: "eff3dPct", label: "3D%", fullLabel: "3rd Down Conversion %", group: "Efficiency" },
  { key: "eff4dPct", label: "4D%", fullLabel: "4th Down Conversion %", group: "Efficiency" },
  { key: "eff2pPct", label: "2P%", fullLabel: "2 Point Conversion %", group: "Efficiency" },
  { key: "rzOffPct", label: "RZ-OFF%", fullLabel: "Red Zone Offense % (TD+FG / ATT)", group: "Efficiency" },
  { key: "rzDefPct", label: "RZ-DEF%", fullLabel: "Red Zone Defense % (TD+FG / ATT)", group: "Efficiency" },
  { key: "tspe", label: "PEN", fullLabel: "Penalties", group: "Efficiency" },
];

const TAB_ORDER = ["Offense", "Defense", "Efficiency"];
// TEAMSTAT P0/P1 buckets removed; columns are not categorized by priority anymore.

function toComparable(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const n = Number(String(v).trim());
  if (Number.isFinite(n)) return n;

  const s = String(v).trim();
  return s ? s.toLowerCase() : null;
}

function getVal(row, key) {
  if (!row) return null;

  // If the stat key includes uppercase, treat it as case-sensitive and do NOT fallback.
  if (/[A-Z]/.test(String(key))) {
    const v = row[key];
    return v !== undefined && v !== null ? v : null;
  }

  const direct = row[key];
  if (direct !== undefined && direct !== null) return direct;

  const lk = String(key).toLowerCase();
  const v = row.__lc?.[lk];
  return v !== undefined && v !== null ? v : null;
}

function TeamCell({ name, logoUrl, rank }) {
  const [src, setSrc] = useState(logoUrl || FALLBACK_TEAM_LOGO);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK_TEAM_LOGO);
  }, [logoUrl]);

  const rankValue = Number(rank);
  const showRank = Number.isFinite(rankValue) && rankValue > 0 && rankValue <= 25;

  return (
    <div className="teamCell">
      <img
        className="teamLogo"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (src !== FALLBACK_TEAM_LOGO) setSrc(FALLBACK_TEAM_LOGO);
        }}
      />
      <span className="teamCellName">
        <span className="teamNameText">{name}</span>
        {showRank ? (
          <span className="teamRankBadge" title="Coach's Poll Rank">
            #{rankValue}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function round1(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

// P0/P1/P2 column states removed — priority class helper deleted.

function useMaxWidth(maxWidthPx) {
  const getMatch = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
  };

  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const onChange = () => setMatches(mql.matches);

    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);

    onChange();
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [maxWidthPx]);

  return matches;
}

function moveKeyAfter(cols, moveKey, afterKey) {
  const fromIdx = cols.findIndex((c) => c.key === moveKey);
  const afterIdx = cols.findIndex((c) => c.key === afterKey);
  if (fromIdx === -1 || afterIdx === -1) return cols;
  if (fromIdx === afterIdx + 1) return cols;

  const next = cols.slice();
  const [moved] = next.splice(fromIdx, 1);
  const insertAt = next.findIndex((c) => c.key === afterKey) + 1;
  next.splice(insertAt, 0, moved);
  return next;
}

function orderKeysFirst(cols, orderedKeys) {
  if (!Array.isArray(cols) || !cols.length) return cols;
  const rank = new Map(orderedKeys.map((k, i) => [k, i]));
  return cols.slice().sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key) : Number.POSITIVE_INFINITY;
    const rb = rank.has(b.key) ? rank.get(b.key) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return cols.indexOf(a) - cols.indexOf(b);
  });
}

export default function TeamStats() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);

  const [availableYears, setAvailableYears] = useState([]);
  const [seasonYear, setSeasonYear] = useState(null);

  const [tab, setTab] = useState("Offense");
  const [confFilter, setConfFilter] = useState("All");

  const [loading, setLoading] = useState(true);

  // Raw DB rows for the current season (kept separate so logo map updates do NOT force DB re-reads)
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [games, setGames] = useState([]);
  const [playerSeasonStats, setPlayerSeasonStats] = useState([]);

  // Logos
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

  // Sorting
  const [sortKey, setSortKey] = useState("teamName");
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
    const tabParam = params.get("tab");
    const sort = params.get("sort");
    const dir = params.get("dir");
    const conf = params.get("conf");

    const resolved = getSeasonFromParamOrSaved(season);
    if (resolved != null) {
      const n = Number(resolved);
      if (Number.isFinite(n)) setSeasonYear(n);
    }
    if (tabParam && TAB_ORDER.includes(tabParam)) setTab(tabParam);
    if (sort) setSortKey(sort);
    if (dir === "asc" || dir === "desc") setSortDir(dir);
    if (conf) setConfFilter(conf);
  }, [location.search]);

  useEffect(() => {
    if (tab === "Offense") {
      setSortKey("totOffYpg");
      setSortDir("desc");
    } else if (tab === "Defense") {
      setSortKey("teamName");
      setSortDir("asc");
    } else if (tab === "Efficiency") {
      setSortKey("teamName");
      setSortDir("asc");
    }
  }, [tab]);

  const teamLogoFor = useMemo(() => {
    return (id) =>
      overrideByTgid.get(String(id)) || logoByTgid.get(String(id)) || FALLBACK_TEAM_LOGO;
  }, [overrideByTgid, logoByTgid]);

  // Load active dynasty + available seasons (from teamStats)
  useEffect(() => {
    let alive = true;

    (async () => {
      const id = await getActiveDynastyId();
      if (!alive) return;
      setDynastyId(id);

      if (!id) {
        setAvailableYears([]);
        setSeasonYear(null);
        setLoading(false);
        return;
      }

      // This is a one-time scan per load; we only need distinct season years.
      const statsRows = await db.teamStats.where({ dynastyId: id }).toArray();
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
    params.set("tab", tab);
    params.set("sort", sortKey);
    params.set("dir", sortDir);
    params.set("conf", confFilter);
    writeSeasonFilter(seasonYear);
    navigate({ pathname: "/team-stats", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, tab, sortKey, sortDir, confFilter, navigate, location.search]);

  // Load team logos for this dynasty
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

  // Load season rows (ONLY when dynastyId/seasonYear changes)
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !seasonYear) {
        setTeamSeasons([]);
        setTeamStats([]);
        setGames([]);
        setPlayerSeasonStats([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const [ts, st, gm, ps] = await Promise.all([
        db.teamSeasons.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
        db.teamStats.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
        db.games.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
        db.playerSeasonStats.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
      ]);

      if (!alive) return;

      setTeamSeasons(ts);
      setTeamStats(st);
      setGames(gm);
      setPlayerSeasonStats(ps);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear]);

  const isAtOrBelow1024 = useMaxWidth(1440);
  const isAtOrBelow768 = useMaxWidth(1440);
  const colsForTab = useMemo(() => {
    if (tab === "Efficiency" && isAtOrBelow1024) return EFFICIENCY_COMPACT_DEFS;

    const cols = STAT_DEFS.filter((d) => d.group === tab);
    if (tab !== "Defense") return cols;

    if (isAtOrBelow768) {
      // At <=768, keep the most important defense stats in a compact scan order.
      return orderKeysFirst(cols, ["defTotYds", "tsdp", "tsdy", "tssk", "tsdi", "defPtsPerGame"]);
    }

    if (isAtOrBelow1024) {
      // At <=1024, place INT next to SACK for easier scanning.
      return moveKeyAfter(cols, "tsdi", "tssk");
    }

    return cols;
  }, [tab, isAtOrBelow1024, isAtOrBelow768]);
  const isOffenseTab = tab === "Offense";
  const isDefenseTab = tab === "Defense";
  const isEfficiencyTab = tab === "Efficiency";

  const confByTgid = useMemo(() => {
    const map = new Map();
    for (const t of teamSeasons) {
      map.set(String(t.tgid), String(t.cgid ?? ""));
    }
    return map;
  }, [teamSeasons]);

  const confOptions = useMemo(() => {
    const confIds = Array.from(
      new Set(teamSeasons.map((t) => String(t.cgid ?? "")).filter(Boolean))
    );
    const names = confIds
      .map((id) => getConferenceName(id))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return names;
  }, [teamSeasons]);

  const nameByTgid = useMemo(() => {
    const map = new Map();
    for (const t of teamSeasons) {
      const tdna = String(t.tdna ?? "").trim();
      const tmna = String(t.tmna ?? "").trim();
      const teamName = `${tdna}${tdna && tmna ? " " : ""}${tmna}`.trim() || String(t.tgid);
      map.set(String(t.tgid), teamName);
    }
    return map;
  }, [teamSeasons]);

  const rankByTgid = useMemo(() => {
    const map = new Map();
    for (const t of teamSeasons) {
      const raw = Number(t.tcrk);
      const rank = Number.isFinite(raw) && raw > 0 ? raw : null;
      map.set(String(t.tgid), rank);
    }
    return map;
  }, [teamSeasons]);

  const ptsMaps = useMemo(() => {
    const ptsAllowedByTgid = new Map();
    const ptsScoredByTgid = new Map();
    const gamesPlayedByTgid = new Map();

    for (const g of games) {
      const ht = String(g.homeTgid ?? "");
      const at = String(g.awayTgid ?? "");
      const hs = g.homeScore;
      const as = g.awayScore;

      if (hs == null || as == null) continue;

      ptsScoredByTgid.set(ht, (ptsScoredByTgid.get(ht) ?? 0) + Number(hs));
      ptsAllowedByTgid.set(ht, (ptsAllowedByTgid.get(ht) ?? 0) + Number(as));
      gamesPlayedByTgid.set(ht, (gamesPlayedByTgid.get(ht) ?? 0) + 1);

      ptsScoredByTgid.set(at, (ptsScoredByTgid.get(at) ?? 0) + Number(as));
      ptsAllowedByTgid.set(at, (ptsAllowedByTgid.get(at) ?? 0) + Number(hs));
      gamesPlayedByTgid.set(at, (gamesPlayedByTgid.get(at) ?? 0) + 1);
    }

    return { ptsAllowedByTgid, ptsScoredByTgid, gamesPlayedByTgid };
  }, [games]);

  const ffByTgid = useMemo(() => {
    const map = new Map();
    for (const row of playerSeasonStats) {
      const tgid = row.tgid != null ? String(row.tgid) : "";
      if (!tgid) continue;
      const ff = Number(row.defFF ?? 0);
      if (!Number.isFinite(ff) || ff === 0) continue;
      map.set(tgid, (map.get(tgid) ?? 0) + ff);
    }
    return map;
  }, [playerSeasonStats]);

  const mergedRows = useMemo(() => {
    const { ptsAllowedByTgid, ptsScoredByTgid, gamesPlayedByTgid } = ptsMaps;

    return teamStats.map((s) => {
      // Build a lowercase lookup map so we can read older imports with mixed-case TSSE keys
      const lc = {};
      for (const [k, v] of Object.entries(s)) {
        lc[String(k).toLowerCase()] = v;
      }

      const tgid = String(s.tgid);

      const defPass = Number(s.tsdp ?? lc["tsdp"] ?? 0);
      const defRush = Number(s.tsdy ?? lc["tsdy"] ?? 0);
      const defTotYds = Number.isFinite(defPass) && Number.isFinite(defRush) ? defPass + defRush : null;
      const offPass = Number(s.tsop ?? lc["tsop"] ?? 0);
      const offRush = Number(s.tsor ?? lc["tsor"] ?? 0);

      const gp = gamesPlayedByTgid.get(tgid) ?? 0;
      const pa = ptsAllowedByTgid.get(tgid) ?? 0;
      const ps = ptsScoredByTgid.get(tgid) ?? 0;

      const defPtsPerGame = gp ? round1(pa / gp) : null;
      const offPtsPerGame = gp ? round1(ps / gp) : null;
      const passYpg = gp ? round1(offPass / gp) : null;
      const rushYpg = gp ? round1(offRush / gp) : null;
      const totOffYpg = gp ? round1(Number(s.tsoy ?? lc["tsoy"] ?? 0) / gp) : null;
      const defTotYpg = gp ? round1(defTotYds / gp) : null;
      const defPassYpg = gp ? round1(defPass / gp) : null;
      const defRushYpg = gp ? round1(defRush / gp) : null;
      const penPerGame = gp ? round1(Number(s.tspe ?? lc["tspe"] ?? 0) / gp) : null;

      const pct = (made, att) => {
        const m = Number(made ?? 0);
        const a = Number(att ?? 0);
        if (!Number.isFinite(m) || !Number.isFinite(a) || a <= 0) return null;
        return round1((m / a) * 100);
      };

      const eff3dPct = pct(s.ts3c ?? lc["ts3c"], s.ts3d ?? lc["ts3d"]);
      const eff4dPct = pct(s.ts4c ?? lc["ts4c"], s.ts4d ?? lc["ts4d"]);
      const eff2pPct = pct(s.ts2c ?? lc["ts2c"], s.ts2a ?? lc["ts2a"]);

      const rzOffPct = (() => {
        const att = Number(s.tsoz ?? lc["tsoz"] ?? 0);
        const td = Number(s.tsot ?? lc["tsot"] ?? 0);
        const fg = Number(s.tsof ?? lc["tsof"] ?? 0);
        if (!Number.isFinite(att) || att <= 0) return null;
        if (!Number.isFinite(td) || !Number.isFinite(fg)) return null;
        return round1(((td + fg) / att) * 100);
      })();

      const rzDefPct = (() => {
        const att = Number(s.tsdr ?? lc["tsdr"] ?? 0);
        const td = Number(s.tsdt ?? lc["tsdt"] ?? 0);
        const fg = Number(s.tsdf ?? lc["tsdf"] ?? 0);
        if (!Number.isFinite(att) || att <= 0) return null;
        if (!Number.isFinite(td) || !Number.isFinite(fg)) return null;
        return round1(((td + fg) / att) * 100);
      })();

      return {
        ...s,
        __lc: lc,
        teamName: nameByTgid.get(tgid) ?? tgid,
        logoUrl: teamLogoFor(tgid),
        teamRank: rankByTgid.get(tgid) ?? null,
        confName: getConferenceName(confByTgid.get(tgid)),
        defTotYds,
        defPtsPerGame,
        defTotYpg,
        defPassYpg,
        defRushYpg,
        penPerGame,
        eff3dPct,
        eff4dPct,
        eff2pPct,
        rzOffPct,
        rzDefPct,
        offPtsPerGame,
        passYpg,
        rushYpg,
        totOffYpg,
        offPtsTotal: ps,
        tsff: ffByTgid.get(tgid) ?? null,
      };
    });
  }, [teamStats, nameByTgid, rankByTgid, teamLogoFor, ptsMaps, ffByTgid, confByTgid]);

  const filteredRows = useMemo(() => {
    if (confFilter === "All") return mergedRows;
    return mergedRows.filter((r) => r.confName === confFilter);
  }, [mergedRows, confFilter]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;

    const arr = [...filteredRows];

    arr.sort((a, b) => {
      const av = key === "teamName" ? a.teamName : getVal(a, key);
      const bv = key === "teamName" ? b.teamName : getVal(b, key);

      const ca = toComparable(av);
      const cb = toComparable(bv);

      // nulls to bottom
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

  // deterministic toggle: click same header toggles asc/desc
  function clickSort(nextKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir("desc"); // first click DESC
      return;
    }
    setSortDir((curDir) => (curDir === "asc" ? "desc" : "asc"));
  }

  function sortIndicator(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const hasAnyYears = availableYears.length > 0;

	  return (
	    <div>
      <div className="hrow">
        <h2>Team Stats - {tab}</h2>
      </div>

      <div className="playerStatsCategoryRow">
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            className={`toggleBtn playerStatsCategoryBtn${tab === t ? " active" : ""}`}
            onClick={() => {
              setTab(t);

              // If current sortKey isn't on this tab, fall back to Team
              const allowedKeys = new Set([
                "teamName",
                ...STAT_DEFS.filter((d) => d.group === t).map((d) => d.key),
              ]);
              setSortKey((cur) => (allowedKeys.has(cur) ? cur : "teamName"));
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="playerStatsControlRow flexRowWrap">
        <div className="playerStatsFilters flexRowWrap">
          <select
            value={seasonYear ?? ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSeasonYear(next);
              writeSeasonFilter(next);
            }}
            disabled={!hasAnyYears}
            aria-label="Season"
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
            onChange={(e) => setConfFilter(e.target.value)}
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
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : !hasAnyYears ? (
        <div className="muted">
          No Team Stats imported yet. Import a season with TEAM.csv, SCHD.csv, TSSE.csv, and BOWL.csv.
        </div>
	      ) : mergedRows.length === 0 ? (
	        <div className="muted">No stats rows found for {seasonYear}.</div>
	      ) : (
	        <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
	          <div className="tableWrap statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
            <table className="table statsTable teamStatsTable firstColFixed280">
              <colgroup>
                <col className="teamColWidth" />
                {colsForTab.map((c) => (
                  <col key={`col-${c.key}`} className="statColWidth" />
                ))}
              </colgroup>
              <thead>
	                {isOffenseTab ? (
	                  <tr className="teamStatsGroupRow teamStatsGroupRowFull">
	                    <th></th>
	                    <th colSpan={2} className="tableGroupHeader tableGroupDivider">TOTAL</th>
	                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">PASSING</th>
	                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">RUSHING</th>
	                    <th colSpan={2} className="tableGroupHeader tableGroupDivider">POINTS</th>
	                  </tr>
	                ) : isDefenseTab ? (
	                  <>
	                    <tr className="teamStatsGroupRow teamStatsGroupRowFull">
	                      <th></th>
	                      <th colSpan={2} className="tableGroupHeader tableGroupDivider">TOTAL</th>
	                      <th colSpan={3} className="tableGroupHeader tableGroupDivider">PASSING</th>
	                      <th colSpan={2} className="tableGroupHeader tableGroupDivider">RUSHING</th>
	                      <th className="tableGroupHeader tableGroupDivider">POINTS</th>
	                      <th colSpan={3} className="tableGroupHeader tableGroupDivider">TURNOVERS</th>
	                    </tr>
	                  </>
	                ) : isEfficiencyTab ? (
	                  <tr className="teamStatsGroupRow teamStatsGroupRowFull">
	                    <th></th>
	                    <th colSpan={6} className="tableGroupHeader tableGroupDivider">CONVERSIONS</th>
	                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">RED ZONE OFFENSE</th>
	                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">RED ZONE DEFENSE</th>
	                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">PENALTIES</th>
	                  </tr>
	                ) : null}
                <tr>
                  <th
                    className="teamCol"
                    onClick={() => clickSort("teamName")}
                    style={{
                      width: 190,
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      paddingRight: 10,
                    }}
                    title="Sort"
                  >
                    TEAM{sortIndicator("teamName")}
                  </th>

                  {colsForTab.map((c, idx) => {
                    const isTotalStart = idx === 0;
                    const isPassingStart = isOffenseTab ? idx === 2 : idx === 2;
                    const isRushingStart = isOffenseTab ? idx === 5 : idx === 5;
                    const isPointsStart = isOffenseTab ? idx === 8 : idx === 7;
                    const isTurnoversStart = isDefenseTab ? idx === 8 : false;
                    const isConversionsStart = isEfficiencyTab ? idx === 0 : false;
                    const isRedZoneOffStart = isEfficiencyTab ? idx === 6 : false;
                    const isRedZoneDefStart = isEfficiencyTab ? idx === 9 : false;
                    const isPenaltiesStart = isEfficiencyTab ? idx === 12 : false;
                    const isGroupStart =
                      isOffenseTab
                        ? isTotalStart || isPassingStart || isRushingStart || isPointsStart
                        : isDefenseTab
                          ? isTotalStart ||
                            isPassingStart ||
                            isRushingStart ||
                            isPointsStart ||
                            isTurnoversStart
                          : isEfficiencyTab
                            ? isConversionsStart ||
                              isRedZoneOffStart ||
                              isRedZoneDefStart ||
                              isPenaltiesStart
                          : false;
                    return (
                      <th
                        key={c.key}
                        className={`${idx === 0 ? "teamDivider " : ""}${isGroupStart ? "tableGroupDivider " : ""}statCol`}
                        onClick={() => clickSort(c.key)}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title={c.fullLabel}
                      >
                        {c.label}
                        {sortIndicator(c.key)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.tgid}>
                    <td className="teamCol" data-label="Team">
                      <Link
                        to={`/team/${r.tgid}`}
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                          display: "inline-block",
                        }}
                        title="View team page"
                      >
                        <TeamCell name={r.teamName} logoUrl={r.logoUrl} rank={r.teamRank} />
                      </Link>
                    </td>

                  {colsForTab.map((c, idx) => {
                      const isTotalStart = idx === 0;
                      const isPassingStart = isOffenseTab ? idx === 2 : idx === 2;
                      const isRushingStart = isOffenseTab ? idx === 5 : idx === 5;
                      const isPointsStart = isOffenseTab ? idx === 8 : idx === 7;
                      const isTurnoversStart = isDefenseTab ? idx === 8 : false;
                      const isConversionsStart = isEfficiencyTab ? idx === 0 : false;
                      const isRedZoneOffStart = isEfficiencyTab ? idx === 6 : false;
                      const isRedZoneDefStart = isEfficiencyTab ? idx === 9 : false;
                      const isPenaltiesStart = isEfficiencyTab ? idx === 12 : false;
                      const isGroupStart =
                        isOffenseTab
                          ? isTotalStart || isPassingStart || isRushingStart || isPointsStart
                          : isDefenseTab
                            ? isTotalStart ||
                              isPassingStart ||
                              isRushingStart ||
                              isPointsStart ||
                              isTurnoversStart
                            : isEfficiencyTab
                              ? isConversionsStart ||
                                isRedZoneOffStart ||
                                isRedZoneDefStart ||
                                isPenaltiesStart
                              : false;
                    return (
                        <td
                        key={c.key}
                        className={`${idx === 0 ? "teamDivider " : ""}${isGroupStart ? "tableGroupDivider " : ""}statCol`}
                        data-label={c.fullLabel || c.label}
                      >
                        {getVal(r, c.key) ?? ""}
                      </td>
                    );
                  })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

