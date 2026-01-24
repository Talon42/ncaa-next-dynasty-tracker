import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import { loadAwardLogoMap } from "../logoService";
import { positionLabel, classLabel } from "../playerStatsUtils";
import { readViewFromSearch, readViewPreference, writeViewPreference } from "../viewPreference";
import { awardStatsForPlayerRow } from "../awardWinnerStats";

const PAGE_KEY = "playerAwards";

function normalizeSeasonValue(value) {
  if (value == null) return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function typeLabelForAllAmerican(value) {
  const t = Number(value);
  if (t === 0) return "1st Team";
  if (t === 1) return "2nd Team";
  if (t === 2) return "Freshman";
  return "All-American";
}

function allAmericanTypeRank(typeLabel) {
  if (typeLabel === "1st Team") return 0;
  if (typeLabel === "2nd Team") return 1;
  if (typeLabel === "Freshman") return 2;
  return 3;
}

function isNationalAllAmerican(row) {
  return String(row?.cgid ?? "").trim() === "15";
}

function awardShortLabel(name) {
  const s = String(name ?? "").trim();
  if (!s) return "";
  return s.replace(/(award|trophy)$/i, "").trim() || s;
}

function isHeismanAwardName(name) {
  return String(name ?? "").toLowerCase().includes("heisman");
}

function awardSortRank(name) {
  return isHeismanAwardName(name) ? 0 : 1;
}

function allAmericanPosSortKey(posLabel) {
  const p = String(posLabel ?? "").trim().toUpperCase();
  if (!p) return 999;

  const order = new Map([
    ["QB", 0],
    ["HB", 1],
    ["FB", 2],
    ["WR", 3],
    ["TE", 4],
    ["RT", 5],
    ["LT", 6],
    ["LG", 7],
    ["RG", 8],
    ["C", 9],
    ["LE", 10],
    ["RE", 11],
    ["DT", 12],
    ["MLB", 13],
    ["LOLB", 14],
    ["ROLB", 15],
    ["CB", 16],
    ["FS", 17],
    ["SS", 18],
    ["K", 19],
    ["P", 20],
  ]);

  if (order.has(p)) return order.get(p);
  return 998;
}

export default function PlayerAwards() {
  const location = useLocation();
  const navigate = useNavigate();

  // `undefined` while loading, `null` if loaded and none selected.
  const [dynastyId, setDynastyId] = useState(undefined);
  const [dynastyCurrentYear, setDynastyCurrentYear] = useState(null);

  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState(null);
  const [seasonLoaded, setSeasonLoaded] = useState(false);

  const [tab, setTab] = useState("awards"); // awards | allAmericans
  const [view, setView] = useState("cards"); // for awards
  const [viewReady, setViewReady] = useState(false);

  const [awardLogoMap, setAwardLogoMap] = useState(new Map());

  const [teamByTgid, setTeamByTgid] = useState(new Map());
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

  const [identityByUid, setIdentityByUid] = useState(new Map());
  const [seasonPlayerRows, setSeasonPlayerRows] = useState([]);
  const [seasonPlayerByPgid, setSeasonPlayerByPgid] = useState(new Map());

  const [awardRows, setAwardRows] = useState([]);
  const [allAmericanRows, setAllAmericanRows] = useState([]);

  const [awardFilter, setAwardFilter] = useState("All");
  const [aaScopeFilter, setAaScopeFilter] = useState("National"); // "National" | cgid

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [isCompactFilters, setIsCompactFilters] = useState(false);
  const filterMenuRef = useRef(null);

  const currentSeasonYear = useMemo(() => {
    const current = dynastyCurrentYear != null ? dynastyCurrentYear - 1 : null;
    return Number.isFinite(Number(current)) ? Number(current) : null;
  }, [dynastyCurrentYear]);

  const defaultSeasonYear = useMemo(() => {
    if (currentSeasonYear != null) return currentSeasonYear;
    return availableSeasons.length ? Number(availableSeasons[0]) : null;
  }, [availableSeasons, currentSeasonYear]);

  function setSearchSeason(nextSeasonYear) {
    const params = new URLSearchParams(location.search);
    if (nextSeasonYear == null) {
      params.delete("season");
    } else {
      params.set("season", String(nextSeasonYear));
    }
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  }

  function handleAwardFilterChange(next) {
    setAwardFilter(next);
    if (next && next !== "All") {
      setView("table");
      setSeasonYear(null);
      setSearchSeason(null);
      return;
    }
    if (seasonYear == null) {
      const fallback = defaultSeasonYear;
      if (fallback != null) {
        setSeasonYear(fallback);
        writeSeasonFilter(String(fallback));
        setSearchSeason(fallback);
      }
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const id = await getActiveDynastyId();
        setDynastyId(id ?? null);
      } catch {
        setDynastyId(null);
      }
    })();
  }, []);

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
    if (!dynastyId) return;
    let alive = true;
    (async () => {
      try {
        const map = await loadAwardLogoMap();
        if (alive) setAwardLogoMap(map);
      } catch {
        if (alive) setAwardLogoMap(new Map());
      }
    })();
    return () => {
      alive = false;
    };
  }, [dynastyId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!dynastyId) {
        setAvailableSeasons([]);
        setDynastyCurrentYear(null);
        setSeasonLoaded(true);
        return;
      }

      const [dRow, teamSeasons] = await Promise.all([
        db.dynasties.get(dynastyId),
        db.teamSeasons.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      const years = Array.from(
        new Set(
          (teamSeasons || [])
            .map((r) => normalizeSeasonValue(r?.seasonYear))
            .filter((v) => v != null)
        )
      ).sort((a, b) => b - a);

      setDynastyCurrentYear(normalizeSeasonValue(dRow?.currentYear));
      setAvailableSeasons(years);
      setSeasonLoaded(true);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId]);

  useEffect(() => {
    if (!seasonLoaded) return;
    if (!availableSeasons.length) {
      setSeasonYear(null);
      return;
    }

    if (tab === "awards" && awardFilter !== "All") {
      // When a specific award is selected, default to all seasons.
      // Allow manual season selection via the season dropdown.
      return;
    }

    const params = new URLSearchParams(location.search);
    const fromSearch = getSeasonFromParamOrSaved(params.get("season"));
    const fromSearchNum = normalizeSeasonValue(fromSearch);

    const fallback = defaultSeasonYear != null ? defaultSeasonYear : availableSeasons[0] ?? null;
    const picked = pickSeasonFromList({
      currentSeason: fromSearchNum ?? seasonYear,
      availableSeasons: availableSeasons.map(String),
      fallbackSeason: String(fallback ?? ""),
    });
    const pickedNum = normalizeSeasonValue(picked);
    if (pickedNum != null) setSeasonYear(pickedNum);
  }, [availableSeasons, awardFilter, defaultSeasonYear, location.search, seasonLoaded, tab]); // intentionally omit seasonYear to avoid loops

  useEffect(() => {
    if (tab !== "awards") return;
    if (awardFilter === "All") return;
    if (seasonYear != null) {
      setSeasonYear(null);
      setSearchSeason(null);
    }
    if (view !== "table") setView("table");
  }, [awardFilter, seasonYear, tab, view]);

  useEffect(() => {
    if (viewReady) return;
    if (!dynastyId) return;
    let alive = true;
    (async () => {
      const fromSearch = readViewFromSearch(location.search);
      if (fromSearch) {
        if (!alive) return;
        setView(fromSearch);
        await writeViewPreference({ page: PAGE_KEY, dynastyId, view: fromSearch });
        if (alive) setViewReady(true);
        return;
      }

      const stored = await readViewPreference({ page: PAGE_KEY, dynastyId });
      if (!alive) return;
      setView(stored || "cards");
      setViewReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [dynastyId, location.search, viewReady]);

  useEffect(() => {
    if (tab !== "allAmericans") return;
    if (seasonYear != null) return;
    const fallback = defaultSeasonYear;
    if (fallback == null) return;
    setSeasonYear(fallback);
    writeSeasonFilter(String(fallback));
    setSearchSeason(fallback);
  }, [defaultSeasonYear, seasonYear, tab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!dynastyId) {
        setAwardRows([]);
        setAllAmericanRows([]);
        setSeasonPlayerRows([]);
        setSeasonPlayerByPgid(new Map());
        setTeamByTgid(new Map());
        setIdentityByUid(new Map());
        return;
      }

      const selectedYear = seasonYear != null ? Number(seasonYear) : null;
      const wantsAllAmericans = tab === "allAmericans" && selectedYear != null;

      const [awardsAll, allAmericansAll, logos, overrides] = await Promise.all([
        db.playerAwards.where("dynastyId").equals(dynastyId).toArray(),
        wantsAllAmericans
          ? (db.playerAllAmericans2 ?? db.playerAllAmericans).where("dynastyId").equals(dynastyId).toArray()
          : Promise.resolve([]),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      const awardsAllSafe = awardsAll || [];
      setAwardRows(awardsAllSafe);

      const allAmericans = wantsAllAmericans
        ? (allAmericansAll || []).filter((r) => Number(r?.seasonYear) === selectedYear)
        : [];
      allAmericans.sort((a, b) => {
        const an = isNationalAllAmerican(a) ? "" : getConferenceName(String(a.cgid ?? "").trim());
        const bn = isNationalAllAmerican(b) ? "" : getConferenceName(String(b.cgid ?? "").trim());
        if (an !== bn) return an.localeCompare(bn);
        return Number(a.ttyp ?? 0) - Number(b.ttyp ?? 0);
      });
      setAllAmericanRows(allAmericans);

      setLogoByTgid(new Map((logos || []).map((r) => [String(r.tgid), r.url])));
      setOverrideByTgid(new Map((overrides || []).map((r) => [String(r.tgid), r.url])));

      let awardsForContext = awardsAllSafe;
      if (awardFilter && awardFilter !== "All") {
        awardsForContext = awardsForContext.filter((r) => String(r?.awardName ?? "").trim() === awardFilter);
      }
      if (selectedYear != null) {
        awardsForContext = awardsForContext.filter((r) => Number(r?.seasonYear) === selectedYear);
      }

      const keys = [];
      for (const r of awardsForContext) {
        const y = Number(r?.seasonYear);
        const pgid = String(r?.pgid ?? "").trim();
        if (!Number.isFinite(y) || !pgid) continue;
        keys.push([dynastyId, y, pgid]);
      }
      for (const r of allAmericans) {
        const y = Number(r?.seasonYear);
        const pgid = String(r?.pgid ?? "").trim();
        if (!Number.isFinite(y) || !pgid) continue;
        keys.push([dynastyId, y, pgid]);
      }

      const seenKey = new Set();
      const uniqKeys = keys.filter((k) => {
        const key = `${k[0]}|${k[1]}|${k[2]}`;
        if (seenKey.has(key)) return false;
        seenKey.add(key);
        return true;
      });

      const chunk = (arr, size) => {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const playerRows = [];
      for (const group of chunk(uniqKeys, 500)) {
        const rows = await db.playerSeasonStats.where("[dynastyId+seasonYear+pgid]").anyOf(group).toArray();
        playerRows.push(...(rows || []));
      }
      if (!alive) return;

      const bySeasonPgid = new Map();
      for (const r of playerRows || []) {
        const y = Number(r?.seasonYear);
        const pgid = String(r?.pgid ?? "").trim();
        if (!Number.isFinite(y) || !pgid) continue;
        const k = `${y}|${pgid}`;
        if (!bySeasonPgid.has(k)) bySeasonPgid.set(k, r);
      }
      setSeasonPlayerRows(playerRows || []);
      setSeasonPlayerByPgid(bySeasonPgid);

      const seasonYears = Array.from(new Set(Array.from(bySeasonPgid.keys()).map((k) => Number(k.split("|")[0]))))
        .filter((v) => Number.isFinite(v));
      const teamRows = (await Promise.all(
        seasonYears.map((y) => db.teamSeasons.where("[dynastyId+seasonYear]").equals([dynastyId, y]).toArray())
      )).flat();
      if (!alive) return;

      const teamMap = new Map();
      for (const t of teamRows || []) {
        const y = Number(t?.seasonYear);
        const tgid = String(t?.tgid ?? "").trim();
        if (!Number.isFinite(y) || !tgid) continue;
        const name = `${String(t?.tdna ?? "").trim()} ${String(t?.tmna ?? "").trim()}`.trim();
        teamMap.set(`${y}|${tgid}`, name || `TGID ${tgid}`);
      }
      setTeamByTgid(teamMap);

      const uids = new Set();
      for (const r of awardsForContext) uids.add(String(r?.playerUid ?? "").trim());
      for (const r of allAmericans) uids.add(String(r?.playerUid ?? "").trim());
      const uidList = Array.from(uids).filter(Boolean);

      if (!uidList.length) {
        setIdentityByUid(new Map());
        return;
      }

      const identities = await db.playerIdentities.bulkGet(uidList.map((uid) => [dynastyId, uid]));
      if (!alive) return;
      const idMap = new Map();
      for (const row of identities || []) {
        const uid = String(row?.playerUid ?? "").trim();
        if (!uid) continue;
        idMap.set(uid, row);
      }
      setIdentityByUid(idMap);
    })();

    return () => {
      alive = false;
    };
  }, [awardFilter, dynastyId, seasonYear, tab]);

  const seasonLabel = useMemo(() => {
    if (seasonYear == null) return "All Seasons";
    return String(seasonYear);
  }, [seasonYear]);

  const awardOptions = useMemo(() => {
    const names = Array.from(new Set(awardRows.map((r) => String(r?.awardName ?? "").trim()).filter(Boolean)));
    names.sort((a, b) => {
      const ar = awardSortRank(a);
      const br = awardSortRank(b);
      if (ar !== br) return ar - br;
      return a.localeCompare(b);
    });
    return names;
  }, [awardRows]);

  const filteredAwards = useMemo(() => {
    const awardSelected = String(awardFilter || "All");

    const out = (awardRows || [])
      .map((r) => {
        const rowSeasonYear = normalizeSeasonValue(r?.seasonYear);
        const uid = String(r?.playerUid ?? "").trim();
        const identity = uid ? identityByUid.get(uid) : null;
        const pgid = String(r?.pgid ?? "").trim();
        const seasonKey = `${rowSeasonYear ?? ""}|${pgid}`;
        const statsRow = seasonPlayerByPgid.get(seasonKey);
        const teamId = String(statsRow?.tgid ?? "").trim();
        const teamNameKey = `${rowSeasonYear ?? ""}|${teamId}`;
        const teamName = teamId ? teamByTgid.get(teamNameKey) || `TGID ${teamId}` : "";
        const playerName = identity
          ? `${String(identity.firstName ?? "").trim()} ${String(identity.lastName ?? "").trim()}`.trim()
          : `${String(r?.firstName ?? "").trim()} ${String(r?.lastName ?? "").trim()}`.trim();
        const pos = positionLabel(statsRow?.position);

        return {
          row: r,
          rowSeasonYear,
          uid,
          playerName,
          pgid,
          teamId,
          teamName,
          pos,
          cls: classLabel(statsRow?.classYear),
          statsRow,
        };
      })
      .filter((x) => {
        if (awardSelected !== "All" && String(x.row?.awardName ?? "").trim() !== awardSelected) return false;
        if (seasonYear != null && Number(x.rowSeasonYear) !== Number(seasonYear)) return false;
        return true;
      });

    out.sort((a, b) => {
      const ay = Number(a.rowSeasonYear) || 0;
      const by = Number(b.rowSeasonYear) || 0;
      if (awardSelected !== "All") {
        if (ay !== by) return by - ay;
      } else if (seasonYear == null) {
        if (ay !== by) return by - ay;
      }
      const an = String(a.row?.awardName ?? "");
      const bn = String(b.row?.awardName ?? "");
      const ar = awardSortRank(an);
      const br = awardSortRank(bn);
      if (ar !== br) return ar - br;
      return an.localeCompare(bn);
    });

    return out;
  }, [awardFilter, awardRows, identityByUid, seasonPlayerByPgid, seasonYear, teamByTgid]);

  const aaConferenceOptions = useMemo(() => {
    const seen = new Map();
    for (const r of allAmericanRows || []) {
      if (isNationalAllAmerican(r)) continue;
      const id = String(r?.cgid ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.set(id, getConferenceName(id) || id);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAmericanRows]);

  const filteredAllAmericans = useMemo(() => {
    const out = (allAmericanRows || [])
      .map((r) => {
        const uid = String(r?.playerUid ?? "").trim();
        const identity = uid ? identityByUid.get(uid) : null;
        const rowSeasonYear = normalizeSeasonValue(r?.seasonYear);
        const pgid = String(r?.pgid ?? "").trim();
        const seasonKey = `${rowSeasonYear ?? ""}|${pgid}`;
        const statsRow = seasonPlayerByPgid.get(seasonKey);
        const teamId = String(statsRow?.tgid ?? "").trim();
        const teamLogoUrl = teamId ? overrideByTgid.get(teamId) || logoByTgid.get(teamId) || "" : "";
        const teamNameKey = `${rowSeasonYear ?? ""}|${teamId}`;
        const teamName = teamId ? teamByTgid.get(teamNameKey) || `TGID ${teamId}` : "";
        const playerName = identity
          ? `${String(identity.firstName ?? "").trim()} ${String(identity.lastName ?? "").trim()}`.trim()
          : "";
        const pos = positionLabel(statsRow?.position);
        const confId = String(r?.cgid ?? "").trim();
        const national = isNationalAllAmerican(r);
        const confName = !national && confId ? getConferenceName(confId) : "";
        const typeLabel = typeLabelForAllAmerican(r?.ttyp);
        const scope = national ? "National" : "Conference";

        return {
          row: r,
          uid,
          playerName: playerName || `Player ${uid || r?.pgid || ""}`.trim(),
          teamId,
          teamLogoUrl,
          teamName,
          pos,
          cls: classLabel(statsRow?.classYear),
          scope,
          confId,
          confName,
          typeLabel,
        };
      })
      .filter((x) => {
        if (aaScopeFilter === "National") return x.scope === "National";
        return x.scope === "Conference" && x.confId === aaScopeFilter;
      });

    out.sort((a, b) => {
      const ap = allAmericanPosSortKey(a.pos);
      const bp = allAmericanPosSortKey(b.pos);
      if (ap !== bp) return ap - bp;

      const at = allAmericanTypeRank(a.typeLabel);
      const bt = allAmericanTypeRank(b.typeLabel);
      if (at !== bt) return at - bt;

      return String(a.playerName || "").localeCompare(String(b.playerName || ""));
    });

    return out;
  }, [
    aaScopeFilter,
    allAmericanRows,
    identityByUid,
    logoByTgid,
    overrideByTgid,
    seasonPlayerByPgid,
    teamByTgid,
  ]);

  const viewButtonStyle = (active) => ({
    fontWeight: "var(--app-control-font-weight)",
    opacity: 1,
    color: active ? "var(--text)" : "var(--muted)",
    borderColor: active ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
    background: active ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
    boxShadow: active ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
  });

  const filtersSummary = useMemo(() => {
    const parts = [];
    if (tab === "awards") {
      if (awardFilter !== "All") parts.push(awardShortLabel(awardFilter));
    } else if (aaScopeFilter === "National") {
      parts.push("National");
    } else {
      const label =
        aaConferenceOptions.find((c) => c.id === aaScopeFilter)?.name ||
        getConferenceName(aaScopeFilter) ||
        aaScopeFilter;
      parts.push(label);
    }
    return parts.length ? parts.join(" • ") : "No filters";
  }, [aaConferenceOptions, aaScopeFilter, awardFilter, tab]);

  const selectedAllAmericanConferenceName = useMemo(() => {
    if (aaScopeFilter === "National") return "";
    return (
      aaConferenceOptions.find((c) => c.id === aaScopeFilter)?.name ||
      getConferenceName(aaScopeFilter) ||
      aaScopeFilter
    );
  }, [aaConferenceOptions, aaScopeFilter]);

  const allAmericanTypeTables = useMemo(() => {
    const isNational = aaScopeFilter === "National";
    const types = isNational ? ["1st Team", "2nd Team", "Freshman"] : ["1st Team", "2nd Team"];

    const byType = new Map(types.map((t) => [t, []]));
    for (const x of filteredAllAmericans) {
      if (!byType.has(x.typeLabel)) continue;
      byType.get(x.typeLabel).push(x);
    }

    return types.map((typeLabel) => ({ typeLabel, rows: byType.get(typeLabel) || [] }));
  }, [aaScopeFilter, filteredAllAmericans]);

  const renderFilterMenu = (extraClassName) => (
    <div className={["filterMenuWrap", extraClassName].filter(Boolean).join(" ")} ref={filterMenuRef}>
      <button
        className="filterMenuBtn"
        title="Filters"
        aria-label="Filters"
        onClick={() => setFiltersOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
      {filtersOpen ? (
        <div className="filterMenuPopover" role="dialog" aria-label="Filters">
          <div className="filterMenuHeader">Filters</div>
          <div className="filterMenuContent playerStatsFilters" style={{ display: "flex" }}>
            {tab === "awards" ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span className="kicker" style={{ margin: 0 }}>Award</span>
                <select value={awardFilter} onChange={(e) => handleAwardFilterChange(e.target.value)}>
                  <option value="All">All</option>
                  {awardOptions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <span className="kicker" style={{ margin: 0 }}>Year</span>
                  <select
                    value={String(seasonYear)}
                    onChange={(e) => {
                      const next = normalizeSeasonValue(e.target.value);
                      if (next == null) return;
                      setSeasonYear(next);
                      writeSeasonFilter(String(next));
                      setSearchSeason(next);
                    }}
                  >
                    {availableSeasons.map((y) => (
                      <option key={y} value={String(y)}>{String(y)}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span className="kicker" style={{ margin: 0 }}>National</span>
                  <select value={aaScopeFilter} onChange={(e) => setAaScopeFilter(e.target.value)}>
                    <option value="National">National</option>
                    {aaConferenceOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="kicker" style={{ marginTop: 10, marginBottom: 0 }}>{filtersSummary}</div>
        </div>
      ) : null}
    </div>
  );

  if (dynastyId === undefined || !seasonLoaded || (tab === "allAmericans" && seasonYear == null)) {
    return <p className="kicker">Loading...</p>;
  }

  if (dynastyId == null) {
    return <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>;
  }

  if (!availableSeasons.length) {
    return <p className="kicker">No seasons uploaded yet.</p>;
  }

  const isSingleAwardMode = tab === "awards" && awardFilter !== "All";
  const hideSeasonLabel = tab === "awards" && isSingleAwardMode;
  const effectiveAwardsView = isSingleAwardMode ? "table" : view;
  const suppressHeismanHighlight = isSingleAwardMode && isHeismanAwardName(awardFilter);

  return (
    <div className="playerAwardsPage">
      <div className="hrow">
        <h2>Player Awards</h2>
      </div>

      <div className="playerStatsCategoryRow" style={{ justifyContent: "space-between" }}>
        <div className="playerStatsSubTabsRow" style={{ flexWrap: "wrap" }}>
          <div className="playerStatsSubTabs">
            <button
              className={`toggleBtn playerStatsSubTabBtn${tab === "awards" ? " active" : ""}`}
              onClick={() => setTab("awards")}
            >
              Awards
            </button>
            <button
              className={`toggleBtn playerStatsSubTabBtn${tab === "allAmericans" ? " active" : ""}`}
              onClick={() => {
                setTab("allAmericans");
                setAaScopeFilter("National");
              }}
            >
              All-Americans
            </button>
          </div>

          <div className="playerStatsFilters" style={{ gap: 8 }}>
            {tab === "awards" && !isSingleAwardMode ? (
              <select
                value={tab === "awards" ? (seasonYear == null ? "All" : String(seasonYear)) : String(seasonYear)}
                onChange={(e) => {
                  const raw = String(e.target.value);
                  if (raw === "All") {
                    setSeasonYear(null);
                    setSearchSeason(null);
                    return;
                  }
                  const next = normalizeSeasonValue(raw);
                  if (next == null) return;
                  setSeasonYear(next);
                  writeSeasonFilter(String(next));
                  setSearchSeason(next);
                }}
                aria-label="Season"
              >
                {tab === "awards" ? <option value="All">All Seasons</option> : null}
                {availableSeasons.map((y) => {
                  const label = String(y);
                  return (
                    <option key={y} value={String(y)}>{label}</option>
                  );
                })}
              </select>
            ) : null}

            {tab === "awards" && !isSingleAwardMode ? (
              <div className="playerStatsViewToggle">
                <button
                  className="toggleBtn"
                  style={viewButtonStyle(view === "cards")}
                  onClick={async () => {
                    setView("cards");
                    await writeViewPreference({ page: PAGE_KEY, dynastyId, view: "cards" });
                  }}
                >
                  Showcase
                </button>
                <button
                  className="toggleBtn"
                  style={viewButtonStyle(view === "table")}
                  onClick={async () => {
                    setView("table");
                    await writeViewPreference({ page: PAGE_KEY, dynastyId, view: "table" });
                  }}
                >
                  Table
                </button>
              </div>
            ) : null}

            {isCompactFilters ? renderFilterMenu("filterMenuWrapSolo") : null}
          </div>
        </div>
      </div>

      {!isCompactFilters ? (
        <div className="playerStatsControlRow" style={{ justifyContent: "space-between" }}>
          <div className="playerStatsFilters" style={{ gap: 8, flexWrap: "wrap" }}>
            {tab === "awards" ? (
              <select value={awardFilter} onChange={(e) => handleAwardFilterChange(e.target.value)} aria-label="Award filter">
                <option value="All">All awards</option>
                {awardOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <>
                <select
                  value={String(seasonYear)}
                  onChange={(e) => {
                    const next = normalizeSeasonValue(e.target.value);
                    if (next == null) return;
                    setSeasonYear(next);
                    writeSeasonFilter(String(next));
                    setSearchSeason(next);
                  }}
                  aria-label="Year"
                >
                  {availableSeasons.map((y) => (
                    <option key={y} value={String(y)}>{String(y)}</option>
                  ))}
                </select>
                <select value={aaScopeFilter} onChange={(e) => setAaScopeFilter(e.target.value)} aria-label="National">
                  <option value="National">National</option>
                  {aaConferenceOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          {!hideSeasonLabel ? <div className="kicker" style={{ margin: 0 }}>{seasonLabel}</div> : null}
        </div>
      ) : (
        !hideSeasonLabel ? <div className="kicker" style={{ marginTop: -6, marginBottom: 12 }}>{seasonLabel}</div> : null
      )}

      {tab === "awards" ? (
        effectiveAwardsView === "table" ? (
          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  {isSingleAwardMode ? <th style={{ width: 90 }}>YEAR</th> : null}
                  <th style={{ width: 240 }}>AWARD</th>
                  <th style={{ width: 320 }}>NAME</th>
                  <th style={{ width: 80 }}>YR</th>
                  <th style={{ width: 80 }}>POS</th>
                  <th>Season Stats</th>
                </tr>
              </thead>
              <tbody>
                {filteredAwards.length ? (
                  filteredAwards.map((x) => {
                    const isHeisman = isHeismanAwardName(String(x.row?.awardName ?? ""));
                    const rowClassName = isHeisman && !suppressHeismanHighlight ? "heismanRow" : "";
                    const stats = x.statsRow ? awardStatsForPlayerRow(x.statsRow) : { stats: [] };
                    const summary = (stats.stats || [])
                      .filter((s) => s.key !== "gp")
                      .slice(0, 6)
                      .map((s) => ({ label: s.label, value: s.value }));
                    const awardName = String(x.row?.awardName ?? "").trim();
                    const awardLogoUrl = awardName ? awardLogoMap.get(awardName.toLowerCase()) || null : null;
                    const teamLogoUrl =
                      x.teamId ? overrideByTgid.get(x.teamId) || logoByTgid.get(x.teamId) || null : null;
                    return (
                      <tr key={`${x.row.awardKey}|${x.uid || x.pgid}`} className={rowClassName}>
                        {isSingleAwardMode ? <td>{x.rowSeasonYear ?? "-"}</td> : null}
                        <td>
                          <span className="tableLogoLabel">
                            {awardLogoUrl ? (
                              <img
                                src={awardLogoUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                style={{ width: 18, height: 18, objectFit: "contain" }}
                              />
                            ) : null}
                            {seasonYear == null && !isSingleAwardMode ? <span className="badge">{x.rowSeasonYear ?? "-"}</span> : null}
                            {awardName ? (
                              <Link className="tableLink selectableText" to={`/award/${encodeURIComponent(awardName)}`}>
                                {awardName}
                              </Link>
                            ) : (
                              <span className="selectableText">{awardName}</span>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="tableLogoLabel">
                            {teamLogoUrl ? (
                              <img
                                src={teamLogoUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                style={{ width: 18, height: 18, objectFit: "contain" }}
                              />
                            ) : null}
                            {x.uid ? (
                              <Link
                                className="tableLink"
                                to={`/player/${x.uid}`}
                                state={{ seasonYear: seasonYear ?? x.rowSeasonYear }}
                              >
                                {x.playerName || "Unknown"}
                              </Link>
                            ) : (
                              <span>{x.playerName || "Unknown"}</span>
                            )}
                          </span>
                        </td>
                        <td>{x.cls || ""}</td>
                        <td>{x.pos || ""}</td>
                        <td>
                          {summary.length ? (
                            summary.map((s, idx) => (
                              <span key={`${s.label}-${idx}`}>
                                <span className="tableStatLabel">{s.label}</span>{" "}
                                <span>{s.value}</span>
                                {idx < summary.length - 1 ? <span>{" • "}</span> : null}
                              </span>
                            ))
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isSingleAwardMode ? 6 : 5}><span className="kicker">No awards match those filters.</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="awardShowcaseGrid" style={{ marginTop: 12 }}>
            {filteredAwards.length ? (
              (() => {
                const heisman = filteredAwards.find((x) => isHeismanAwardName(String(x.row?.awardName ?? ""))) || null;
                const rest = filteredAwards.filter((x) => !isHeismanAwardName(String(x.row?.awardName ?? "")));

                const renderCard = (x, extraClassName) => {
                  const awardName = String(x.row?.awardName ?? "").trim();
                  const awardUrl = awardLogoMap.get(awardName.toLowerCase()) || null;
                  const isHeisman = isHeismanAwardName(awardName);
                  const logoUrl =
                    x.teamId ? overrideByTgid.get(x.teamId) || logoByTgid.get(x.teamId) || null : null;

                  const { stats } = x.statsRow ? awardStatsForPlayerRow(x.statsRow) : { stats: [] };
                  const statPills = (stats || []).filter(Boolean).slice(0, 10);

                  return (
                    <div
                      key={`${x.row.awardKey}|${x.uid || x.pgid}`}
                      className={[
                        "awardShowcaseCard",
                        isHeisman ? "isHeisman" : "",
                        extraClassName || "",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className="awardShowcaseLeft">
                        {awardUrl ? (
                          <img
                            className="awardShowcaseImage"
                            src={awardUrl}
                            alt={awardName}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="awardShowcaseImageFallback">{awardShortLabel(awardName) || "Award"}</div>
                        )}
                      </div>
                      <div className="awardShowcaseRight">
                        <div className="awardShowcaseTitleRow">
                          <Link
                            className="tableLink awardShowcaseTitle selectableText"
                            to={`/award/${encodeURIComponent(awardName)}`}
                          >
                            {awardName}
                          </Link>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className="badge">{seasonYear == null ? (x.rowSeasonYear ?? "-") : seasonYear}</div>
                          </div>
                        </div>

                        <div className="awardShowcasePlayerRow">
                          <div className="awardShowcasePlayer">
                            {x.uid ? (
                              <Link to={`/player/${x.uid}`} state={{ seasonYear: seasonYear ?? x.rowSeasonYear }}>
                                {x.playerName || "Unknown"}
                              </Link>
                            ) : (
                              <span>{x.playerName || "Unknown"}</span>
                            )}
                            {x.pos ? <span className="badge" style={{ marginLeft: 10 }}>{x.pos}</span> : null}
                            {x.cls ? <span className="badge" style={{ marginLeft: 6 }}>{x.cls}</span> : null}
                          </div>
                        </div>

                        <div className="awardShowcaseTeamRow">
                          {logoUrl ? (
                            <img
                              className="awardShowcaseTeamLogo"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                          <div className="kicker" style={{ margin: 0 }}>{x.teamName || ""}</div>
                        </div>

                        <div className="awardShowcaseStats">
                          {statPills.length ? (
                            statPills.map((s) => (
                              <span key={s.key} className="awardStatPill">
                                <span className="awardStatLabel">{s.label}</span>
                                <span className="awardStatValue">{s.value}</span>
                              </span>
                            ))
                          ) : (
                            <span className="kicker">No season stats found for this player.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {heisman ? renderCard(heisman, "heismanHero") : null}
                    {rest.map((x) => renderCard(x, ""))}
                  </>
                );
              })()
            ) : (
              <p className="kicker">No awards match those filters.</p>
            )}
          </div>
        )
      ) : (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
              alignItems: "start",
            }}
          >
            {allAmericanTypeTables.map(({ typeLabel, rows }) => {
              const typePrefix = typeLabel.startsWith("1st") ? "1st" : typeLabel.startsWith("2nd") ? "2nd" : "Freshman";
              const isNational = aaScopeFilter === "National";
              const header = !isNational ? `${typePrefix} All-${selectedAllAmericanConferenceName || "Conference"}` : typeLabel;
              const headerText = String(header || "").toUpperCase();

              const headerBg =
                typeLabel.startsWith("1st") ? "rgba(212, 175, 55, 0.26)" :
                  typeLabel.startsWith("2nd") ? "rgba(192, 192, 192, 0.22)" :
                    "rgba(205, 127, 50, 0.22)";
              const headerBorder =
                typeLabel.startsWith("1st") ? "rgba(212, 175, 55, 0.42)" :
                  typeLabel.startsWith("2nd") ? "rgba(192, 192, 192, 0.38)" :
                    "rgba(205, 127, 50, 0.38)";

              return (
                <div key={typeLabel} className="tableWrap" style={{ marginTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr style={{ background: headerBg }}>
                        <th
                          colSpan={3}
                          style={{
                            textAlign: "center",
                            textTransform: "uppercase",
                            letterSpacing: 0.6,
                            fontWeight: 800,
                            borderBottomColor: headerBorder,
                          }}
                        >
                          {headerText}
                        </th>
                      </tr>
                      <tr>
                        <th>PLAYER</th>
                        <th style={{ width: 70 }}>POS</th>
                        <th style={{ width: 70 }}>YR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length ? (
                        rows.map((x) => (
                          <tr key={`${typeLabel}|${x.row.pgid}|${x.row.cgid}|${x.row.ttyp}|${x.uid || "na"}`}>
                            <td>
                              {x.uid ? (
                                <Link className="tableLink" to={`/player/${x.uid}`} state={{ seasonYear }}>
                                  <span className="tableLogoLabel">
                                    {x.teamLogoUrl ? (
                                      <img
                                        src={x.teamLogoUrl}
                                        alt=""
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        style={{ width: 18, height: 18, objectFit: "contain" }}
                                      />
                                    ) : null}
                                    <span>{x.playerName || "Unknown"}</span>
                                  </span>
                                </Link>
                              ) : (
                                <span className="tableLogoLabel">
                                  {x.teamLogoUrl ? (
                                    <img
                                      src={x.teamLogoUrl}
                                      alt=""
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      style={{ width: 18, height: 18, objectFit: "contain" }}
                                    />
                                  ) : null}
                                  <span>{x.playerName || "Unknown"}</span>
                                </span>
                              )}
                            </td>
                            <td>{x.pos || ""}</td>
                            <td>{x.cls || ""}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3}><span className="kicker">No All-Americans match those filters.</span></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
