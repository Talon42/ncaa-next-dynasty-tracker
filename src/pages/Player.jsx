import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { formatHometownLabel, loadHometownLookup } from "../hometownService";
import { loadAwardLogoMap } from "../logoService";
import {
  ONE_DECIMAL_KEYS,
  STAT_DEFS,
  classLabel,
  derivedValue,
  formatStat,
  getPlayerCardStatDefs,
  getPlayerStatsPageDefs,
  getGpForTab,
  positionLabel,
  rowHasStatsForTab,
} from "../playerStatsUtils";

const LONG_KEYS = new Set(["fgLong", "puntLong", "krLong", "prLong"]);
const OFFENSE_TABS = ["Passing", "Rushing", "Receiving"];
const SPECIAL_TEAMS_KEYS = ["Returns", "Kicking", "Punting"];
const TAB_GROUPS = [...OFFENSE_TABS, "Defense", ...SPECIAL_TEAMS_KEYS];
const CATEGORY_TABS = ["Offense", "Defense", "Special Teams"];
const SPECIAL_TEAMS_TABS = [
  { key: "Returns", label: "Returning" },
  { key: "Kicking", label: "Kicking" },
  { key: "Punting", label: "Punting" },
];
const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";
const CAPTAIN_LOGO = `${import.meta.env.BASE_URL}logos/captain.png`;
const ALL_AMERICAN_LOGO =
  "https://github.com/Talon42/ncaa-next-26/blob/main/textures/SLUS-21214/replacements/general/dynasty-mode/d6ce085a9cf265a1-7d77d8b3187e07c4-00005553.png?raw=true";
const AWARD_LABEL_RE = /\s+(Award|Trophy)\s*$/i;

function sumOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maxOrNull(a, b) {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  return Math.max(a, b);
}

function awardShortLabel(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  const short = trimmed.replace(AWARD_LABEL_RE, "");
  return short || trimmed;
}

function defaultTabForPosition(value) {
  const pos = positionLabel(value);
  if (pos === "QB") return "Passing";
  if (pos === "HB" || pos === "FB") return "Rushing";
  if (pos === "WR" || pos === "TE") return "Receiving";
  if (pos === "K") return "Kicking";
  if (pos === "P") return "Punting";
  return "Defense";
}

function categoryForTab(value) {
  if (OFFENSE_TABS.includes(value)) return "Offense";
  if (value === "Defense") return "Defense";
  if (SPECIAL_TEAMS_KEYS.includes(value) || value === "Special Teams") return "Special Teams";
  return "Special Teams";
}

function firstAvailableTab(tabKeys) {
  return tabKeys[0] || null;
}

function defaultTabForCategory(category, currentTab, availableOffenseTabs, availableSpecialTeamsTabs) {
  if (category === "Defense") return "Defense";
  if (category === "Special Teams") {
    if (SPECIAL_TEAMS_KEYS.includes(currentTab)) return currentTab;
    return firstAvailableTab(availableSpecialTeamsTabs) || "Returns";
  }
  if (OFFENSE_TABS.includes(currentTab)) return currentTab;
  return firstAvailableTab(availableOffenseTabs) || "Passing";
}

function valueForStat(row, key, group) {
  const gp = getGpForTab(row, group);
  if (ONE_DECIMAL_KEYS.has(key)) return derivedValue(row, key, gp);
  return row[key];
}

function seasonGpFromRow(row) {
  const gpOff = Number(row.gpOff);
  const gpDef = Number(row.gpDef);
  const gpSpec = Number(row.gpSpec);
  const values = [gpOff, gpDef, gpSpec].filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  return Math.max(...values);
}

function formatHeight(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return "";
  const total = Math.round(inches);
  const feet = Math.floor(total / 12);
  const rem = total % 12;
  if (feet <= 0) return "";
  return `${feet}'${rem}"`;
}

function formatWeight(value) {
  const pounds = Number(value);
  if (!Number.isFinite(pounds) || pounds <= 0) return "";
  return `${Math.round(pounds)} lbs`;
}

function computeTotals(rows) {
  const totals = {
    gpOff: 0,
    gpDef: 0,
    gpSpec: 0,
    fgLong: null,
    puntLong: null,
    krLong: null,
    prLong: null,
  };

  for (const row of rows) {
    totals.gpOff += sumOrZero(row.gpOff);
    totals.gpDef += sumOrZero(row.gpDef);
    totals.gpSpec += sumOrZero(row.gpSpec);

    for (const def of STAT_DEFS) {
      const key = def.key;
      if (ONE_DECIMAL_KEYS.has(key)) continue;
      if (LONG_KEYS.has(key)) {
        totals[key] = maxOrNull(totals[key], Number(row[key]));
      } else {
        totals[key] = sumOrZero(totals[key]) + sumOrZero(row[key]);
      }
    }
  }

  return totals;
}

export default function Player() {
  const { playerUid } = useParams();
  const [dynastyId, setDynastyId] = useState(null);
  const [playerRows, setPlayerRows] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [tab, setTab] = useState("Passing");
  const [tabInitialized, setTabInitialized] = useState(false);
  const [teamLogoUrl, setTeamLogoUrl] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamBySeasonTgid, setTeamBySeasonTgid] = useState(new Map());
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());
  const [hometownLookup, setHometownLookup] = useState(null);
  const [awardLogoMap, setAwardLogoMap] = useState(new Map());
  const [allAmericanRows, setAllAmericanRows] = useState([]);
  const [awardRows, setAwardRows] = useState([]);
  const [leadersBySeason, setLeadersBySeason] = useState(new Map());

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const lookup = await loadHometownLookup();
      if (!alive) return;
      setHometownLookup(lookup);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const map = await loadAwardLogoMap();
      if (!alive) return;
      setAwardLogoMap(map);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setPlayerRows([]);
        setIdentity(null);
        setLoading(true);
        setHasLoaded(false);
        return;
      }

      setLoading(true);
      const [statsRows, identityRow] = await Promise.all([
        db.playerSeasonStats.where({ dynastyId, playerUid }).toArray(),
        db.playerIdentities.get({ dynastyId, playerUid }),
      ]);

      if (!alive) return;

      statsRows.sort((a, b) => Number(a.seasonYear) - Number(b.seasonYear));
      setPlayerRows(statsRows);
      setIdentity(identityRow ?? null);
      setHasLoaded(true);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, playerUid]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setAllAmericanRows([]);
        return;
      }

      const rows = await db.playerAllAmericans.where({ dynastyId, playerUid }).toArray();
      if (!alive) return;
      rows.sort((a, b) => Number(a.seasonYear) - Number(b.seasonYear));
      setAllAmericanRows(rows);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, playerUid]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setAwardRows([]);
        return;
      }

      const rows = await db.playerAwards.where({ dynastyId, playerUid }).toArray();
      if (!alive) return;
      rows.sort((a, b) => Number(a.seasonYear) - Number(b.seasonYear));
      setAwardRows(rows);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, playerUid]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId) {
        setTeamBySeasonTgid(new Map());
        setLogoByTgid(new Map());
        setOverrideByTgid(new Map());
        return;
      }

      const [teams, logos, overrides] = await Promise.all([
        db.teamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      const teamMap = new Map();
      for (const t of teams) {
        const tgid = String(t.tgid ?? "");
        if (!tgid) continue;
        teamMap.set(`${t.seasonYear}|${tgid}`, t);
      }
      setTeamBySeasonTgid(teamMap);
      setLogoByTgid(new Map(logos.map((r) => [String(r.tgid), r.url])));
      setOverrideByTgid(new Map(overrides.map((r) => [String(r.tgid), r.url])));
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId]);

  const careerTotals = useMemo(() => computeTotals(playerRows), [playerRows]);

  const defsByGroup = useMemo(() => {
    const map = new Map();
    for (const def of STAT_DEFS) {
      const list = map.get(def.group) || [];
      list.push(def);
      map.set(def.group, list);
    }
    return map;
  }, []);

  const latestRow = useMemo(() => {
    if (!playerRows.length) return null;
    return playerRows.reduce((acc, row) => {
      if (!acc) return row;
      return Number(row.seasonYear) > Number(acc.seasonYear) ? row : acc;
    }, null);
  }, [playerRows]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !latestRow?.tgid) {
        setTeamLogoUrl(null);
        setTeamName("");
        return;
      }

      const tgid = String(latestRow.tgid).trim();
      if (!tgid) {
        setTeamLogoUrl(null);
        setTeamName("");
        return;
      }

      const [logoRow, overrideRow, teamRows] = await Promise.all([
        db.teamLogos.get([dynastyId, tgid]),
        db.logoOverrides.get([dynastyId, tgid]),
        db.teamSeasons.where({ dynastyId, tgid }).toArray(),
      ]);

      if (!alive) return;

      const latestTeam = teamRows.reduce((acc, row) => {
        if (!acc) return row;
        return Number(row.seasonYear) > Number(acc.seasonYear) ? row : acc;
      }, null);
      const name = latestTeam
        ? `${String(latestTeam.tdna ?? "").trim()} ${String(latestTeam.tmna ?? "").trim()}`.trim()
        : `TGID ${tgid}`;

      setTeamLogoUrl(overrideRow?.url || logoRow?.url || null);
      setTeamName(name);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, latestRow]);

  const tabAvailability = useMemo(() => {
    const result = new Map(TAB_GROUPS.map((key) => [key, false]));
    if (!playerRows.length) return result;
    for (const tabKey of TAB_GROUPS) {
      const defs = getPlayerStatsPageDefs(tabKey);
      if (!defs.length) continue;
      for (const row of playerRows) {
        if (rowHasStatsForTab(row, defs, tabKey)) {
          result.set(tabKey, true);
          break;
        }
      }
    }
    return result;
  }, [playerRows]);

  const availableTabs = useMemo(
    () => TAB_GROUPS.filter((key) => tabAvailability.get(key)),
    [tabAvailability],
  );
  const availableOffenseTabs = useMemo(
    () => OFFENSE_TABS.filter((key) => tabAvailability.get(key)),
    [tabAvailability],
  );
  const availableSpecialTeamsTabs = useMemo(
    () => SPECIAL_TEAMS_KEYS.filter((key) => tabAvailability.get(key)),
    [tabAvailability],
  );
  const availableCategories = useMemo(() => {
    const hasDefense = tabAvailability.get("Defense");
    return CATEGORY_TABS.filter((key) => {
      if (key === "Offense") return availableOffenseTabs.length > 0;
      if (key === "Defense") return hasDefense;
      if (key === "Special Teams") return availableSpecialTeamsTabs.length > 0;
      return false;
    });
  }, [availableOffenseTabs, availableSpecialTeamsTabs, tabAvailability]);
  const category = useMemo(() => categoryForTab(tab), [tab]);

  useEffect(() => {
    if (!latestRow) return;
    const preferred = defaultTabForPosition(latestRow.position);
    if (!tabInitialized) {
      if (availableTabs.includes(preferred)) {
        setTab(preferred);
      } else if (availableTabs.length) {
        setTab(availableTabs[0]);
      }
      setTabInitialized(true);
      return;
    }
    if (!availableTabs.includes(tab) && availableTabs.length) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, latestRow, tab, tabInitialized]);

  const seasonsLabel = useMemo(() => {
    if (!playerRows.length) return "";
    const years = playerRows
      .map((r) => Number(r.seasonYear))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!years.length) return "";
    if (years.length === 1) return String(years[0]);
    return `${years[0]}-${years[years.length - 1]}`;
  }, [playerRows]);

  const displayName = useMemo(() => {
    const first = String(identity?.firstName ?? latestRow?.firstName ?? "").trim();
    const last = String(identity?.lastName ?? latestRow?.lastName ?? "").trim();
    const full = `${first} ${last}`.trim();
    return full || "Player";
  }, [identity, latestRow]);

  const hometownLabel = useMemo(
    () => formatHometownLabel(identity?.hometown, hometownLookup),
    [identity, hometownLookup],
  );
  const heightLabel = useMemo(() => {
    const value = identity?.height ?? latestRow?.height;
    return formatHeight(value);
  }, [identity, latestRow]);
  const weightLabel = useMemo(() => {
    const value = identity?.weight ?? latestRow?.weight;
    return formatWeight(value);
  }, [identity, latestRow]);
  const captainBadges = useMemo(() => {
    if (!playerRows.length || !teamBySeasonTgid.size) return [];
    const out = [];
    const seen = new Set();

    for (const row of playerRows) {
      const tgid = row?.tgid != null ? String(row.tgid) : "";
      const pgid = Number(row?.pgid);
      const seasonYear = row?.seasonYear;
      if (!tgid || !Number.isFinite(pgid) || seasonYear == null) continue;
      const teamRow = teamBySeasonTgid.get(`${seasonYear}|${tgid}`) || null;
      if (!teamRow) continue;
      const tgidNum = Number(tgid);
      if (!Number.isFinite(tgidNum)) continue;
      const offset = pgid - tgidNum * 70;
      if (!Number.isFinite(offset)) continue;

      const isOcap =
        Number.isFinite(teamRow?.ocap) && offset === Number(teamRow.ocap);
      const isDcap =
        Number.isFinite(teamRow?.dcap) && offset === Number(teamRow.dcap);
      if (!isOcap && !isDcap) continue;

      const type = isOcap && isDcap ? "Captain" : isOcap ? "Offensive Captain" : "Defensive Captain";
      const teamLabel = `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim();
      const title = `${seasonYear}${teamLabel ? ` - ${teamLabel}` : ""} - ${type}`;
      const key = `${seasonYear}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, title, seasonYear: Number(seasonYear) || 0, logoUrl: CAPTAIN_LOGO });
    }

    out.sort((a, b) => Number(String(a.key).split("|")[0]) - Number(String(b.key).split("|")[0]));
    return out;
  }, [playerRows, teamBySeasonTgid]);
  const allAmericanBadges = useMemo(() => {
    if (!allAmericanRows.length) return [];
    const seen = new Set();
    const labelForType = (value) => {
      const t = Number(value);
      if (t === 0) return "1st Team All-American";
      if (t === 1) return "2nd Team All-American";
      if (t === 2) return "Freshman All-American";
      return "All-American";
    };

    return allAmericanRows
      .map((row) => {
        const seasonYear = Number(row.seasonYear) || 0;
        const typeLabel = labelForType(row.ttyp);
        const key = `${seasonYear}|${row.ttyp ?? "na"}|${row.seyr ?? "na"}|${row.pgid ?? "na"}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          title: `${seasonYear} - ${typeLabel}`,
          seasonYear,
          logoUrl: ALL_AMERICAN_LOGO,
        };
      })
      .filter(Boolean);
  }, [allAmericanRows]);
  const awardBadges = useMemo(() => {
    if (!awardRows.length) return [];
    const seen = new Set();

    return awardRows
      .map((row) => {
        const seasonYear = Number(row.seasonYear) || 0;
        const awardName = String(row.awardName ?? "").trim();
        if (!awardName) return null;
        const logoUrl = awardLogoMap.get(awardName.toLowerCase()) || null;
        const key = `${seasonYear}|award|${row.awardKey ?? "na"}|${row.pgid ?? "na"}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          title: `${seasonYear} - ${awardName}`,
          seasonYear,
          logoUrl,
          label: awardShortLabel(awardName),
          isHeisman: awardName.toLowerCase().includes("heisman"),
        };
      })
      .filter(Boolean);
  }, [awardLogoMap, awardRows]);
  const trophyBadges = useMemo(() => {
    const all = [...captainBadges, ...allAmericanBadges, ...awardBadges];
    all.sort((a, b) => (a.seasonYear || 0) - (b.seasonYear || 0));
    return all;
  }, [allAmericanBadges, awardBadges, captainBadges]);

  const activeDefs = useMemo(() => {
    return getPlayerStatsPageDefs(tab);
  }, [tab]);
  const isDefenseTab = tab === "Defense";
  const isKickingTab = tab === "Kicking";
  const defenseDividerClass = (idx) => {
    if (!isDefenseTab) return "";
    if (idx === 0 || idx === 3 || idx === 7 || idx === 10) return " tableGroupDivider";
    return "";
  };
  const kickingDividerClass = (idx) => {
    if (!isKickingTab) return "";
    if (idx === 0 || idx === 4) return " tableGroupDivider";
    return "";
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerRows.length || !activeDefs.length) {
        if (alive) setLeadersBySeason(new Map());
        return;
      }

      const seasons = Array.from(
        new Set(
          playerRows
            .map((row) => Number(row.seasonYear))
            .filter((year) => Number.isFinite(year))
        )
      );
      if (!seasons.length) {
        if (alive) setLeadersBySeason(new Map());
        return;
      }

      const next = new Map();
      await Promise.all(
        seasons.map(async (year) => {
          const rows = await db.playerSeasonStats.where({ dynastyId, seasonYear: year }).toArray();
          const maxByKey = new Map(activeDefs.map((def) => [def.key, null]));
          for (const row of rows) {
            for (const def of activeDefs) {
              const value = valueForStat(row, def.key, tab);
              if (!Number.isFinite(value)) continue;
              const current = maxByKey.get(def.key);
              maxByKey.set(def.key, current == null ? value : Math.max(current, value));
            }
          }
          next.set(String(year), maxByKey);
        })
      );

      if (alive) setLeadersBySeason(next);
    })();

    return () => {
      alive = false;
    };
  }, [activeDefs, dynastyId, playerRows, tab]);
  const seasonRowsForTab = useMemo(() => {
    if (!activeDefs.length) return [];
    const groups = Array.from(defsByGroup.keys());
    return playerRows.map((row) => {
      const hasAnyStats = groups.some((group) => {
        const defs = defsByGroup.get(group) || [];
        return defs.length ? rowHasStatsForTab(row, defs, group) : false;
      });
      return {
        row,
        hasStats: rowHasStatsForTab(row, activeDefs, tab),
        hasAnyStats,
        seasonGp: hasAnyStats ? seasonGpFromRow(row) : 0,
      };
    });
  }, [activeDefs, defsByGroup, playerRows, tab]);

  const careerGp = useMemo(() => {
    const groups = Array.from(defsByGroup.keys());
    let total = 0;
    for (const row of playerRows) {
      const hasAnyStats = groups.some((group) => {
        const defs = defsByGroup.get(group) || [];
        return defs.length ? rowHasStatsForTab(row, defs, group) : false;
      });
      if (hasAnyStats) total += seasonGpFromRow(row);
    }
    return total;
  }, [defsByGroup, playerRows]);

  const teamTotals = useMemo(() => {
    const groups = Array.from(defsByGroup.keys());
    const totalsByTeam = new Map();
    const seasonMeta = new Map();

    for (const row of playerRows) {
      const tgid = row.tgid != null ? String(row.tgid) : "";
      if (!tgid) continue;
      const entry = totalsByTeam.get(tgid) || { rows: [] };
      entry.rows.push(row);
      totalsByTeam.set(tgid, entry);

      const meta = seasonMeta.get(tgid) || { firstSeason: Number(row.seasonYear) || 0, lastSeason: 0 };
      const seasonValue = Number(row.seasonYear) || 0;
      meta.firstSeason = meta.firstSeason ? Math.min(meta.firstSeason, seasonValue) : seasonValue;
      meta.lastSeason = Math.max(meta.lastSeason, seasonValue);
      seasonMeta.set(tgid, meta);
    }

    const result = [];
    for (const [tgid, entry] of totalsByTeam.entries()) {
      const totals = computeTotals(entry.rows);
      let gpTotal = 0;
      for (const row of entry.rows) {
        const hasAnyStats = groups.some((group) => {
          const defs = defsByGroup.get(group) || [];
          return defs.length ? rowHasStatsForTab(row, defs, group) : false;
        });
        if (hasAnyStats) gpTotal += seasonGpFromRow(row);
      }
      const meta = seasonMeta.get(tgid) || { firstSeason: 0, lastSeason: 0 };
      result.push({ tgid, totals, gpTotal, firstSeason: meta.firstSeason, lastSeason: meta.lastSeason });
    }

    result.sort((a, b) => a.firstSeason - b.firstSeason);
    return result;
  }, [defsByGroup, playerRows]);

  const teamTotalsForTab = useMemo(() => {
    if (!activeDefs.length) return [];
    return teamTotals.filter((team) => {
      const gpTotal = team.gpTotal;
      return activeDefs.some((def) => {
        const value = ONE_DECIMAL_KEYS.has(def.key)
          ? derivedValue(team.totals, def.key, gpTotal)
          : team.totals[def.key];
        return Number.isFinite(value) && value !== 0;
      });
    });
  }, [activeDefs, teamTotals]);

  if (loading || !dynastyId || !playerUid || !hasLoaded) {
    return <div className="muted">Loading...</div>;
  }

  if (!playerRows.length) {
    return <div className="muted">No player stats found.</div>;
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <img
          src={teamLogoUrl || FALLBACK_LOGO}
          alt={teamName || "Team"}
          style={{ width: 180, height: 180, objectFit: "contain" }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = FALLBACK_LOGO;
          }}
        />
      </div>

      <h2
        style={{
          marginTop: 6,
          marginBottom: 18,
          display: "flex",
          justifyContent: "center",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        {latestRow?.jersey != null ? <span>#{latestRow.jersey}</span> : null}
        <span>{displayName}</span>
      </h2>

      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "stretch",
          marginBottom: 16,
        }}
      >
        <div className="card" style={{ marginBottom: 0, flex: "1 1 320px", maxWidth: 560 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="kicker infoCardTitle">
              Player Summary
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
          <div className="muted" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {latestRow?.position != null ? <span>{positionLabel(latestRow.position)}</span> : null}
            {latestRow?.classYear != null ? (
              <span>
                {classLabel(latestRow.classYear)}
                {Number(latestRow.redshirt) >= 1 ? " (RS)" : ""}
              </span>
            ) : null}
            {heightLabel ? <span>Height: {heightLabel}</span> : null}
            {weightLabel ? <span>Weight: {weightLabel}</span> : null}
            {hometownLabel ? <span>Hometown: {hometownLabel}</span> : null}
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0, flex: "1 1 320px", maxWidth: 560 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="kicker infoCardTitle">
              Trophy Room
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
          {!trophyBadges.length ? (
            <p className="kicker" style={{ margin: 0 }}>
              No trophies yet.
            </p>
          ) : (
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: 2, paddingRight: 2 }}>
                {(() => {
                  const size = 42;
                  const renderBadge = ({ key, title, logoUrl, label, isHeisman }) => {
                    const champBorder = "rgba(216,180,90,0.95)";
                    return (
                      <div
                        key={key}
                        title={title}
                        style={{
                          width: size,
                          height: size,
                          borderRadius: 999,
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                          background: isHeisman
                            ? "linear-gradient(135deg, rgba(216,180,90,0.24), rgba(255,255,255,0.06))"
                            : "rgba(255,255,255,0.06)",
                          border: isHeisman ? `1px solid ${champBorder}` : "1px solid var(--border)",
                          boxShadow: isHeisman
                            ? "0 0 0 1px rgba(216,180,90,0.55), 0 2px 10px rgba(216,180,90,0.25), 0 2px 8px rgba(0,0,0,0.25)"
                            : "0 2px 8px rgba(0,0,0,0.25)",
                          flex: "0 0 auto",
                        }}
                      >
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            lineHeight: 1.1,
                            textAlign: "center",
                            padding: 6,
                            fontWeight: 600,
                            color: "var(--text)",
                          }}
                        >
                          {label || "Award"}
                        </span>
                      )}
                      </div>
                    );
                  };

                  return trophyBadges.map((badge) =>
                    renderBadge({
                      key: badge.key,
                      title: badge.title,
                      logoUrl: badge.logoUrl,
                      label: badge.label,
                      isHeisman: badge.isHeisman,
                    }),
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {availableCategories.length ? (
        <div className="playerStatsCategoryRow">
          {availableCategories.map((group) => (
            <button
              key={group}
              type="button"
              className={`playerStatsCategoryBtn${category === group ? " active" : ""}`}
              onClick={() => {
                const nextTab = defaultTabForCategory(
                  group,
                  tab,
                  availableOffenseTabs,
                  availableSpecialTeamsTabs,
                );
                setTab(nextTab);
                setTabInitialized(true);
              }}
            >
              {group}
            </button>
          ))}
        </div>
      ) : null}

      {category === "Offense" ? (
        <div className="playerStatsControlRow">
          <div className="playerStatsSubTabs">
            {availableOffenseTabs.map((group) => (
              <button
                key={group}
                type="button"
                className={`toggleBtn playerStatsSubTabBtn${tab === group ? " active" : ""}`}
                onClick={() => {
                  setTab(group);
                  setTabInitialized(true);
                }}
              >
                {group}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {category === "Special Teams" ? (
        <div className="playerStatsControlRow">
          <div className="playerStatsSubTabs">
            {SPECIAL_TEAMS_TABS.filter((group) => availableSpecialTeamsTabs.includes(group.key)).map((group) => (
              <button
                key={group.key}
                type="button"
                className={`toggleBtn playerStatsSubTabBtn${tab === group.key ? " active" : ""}`}
                onClick={() => {
                  setTab(group.key);
                  setTabInitialized(true);
                }}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeDefs.length ? (
        <div className="statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
          <table className="table">
            <thead>
              {isDefenseTab ? (
                <>
                  <tr>
                    <th colSpan={4}></th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">TACKLES</th>
                    <th colSpan={4} className="tableGroupHeader tableGroupDivider">INTERCEPTIONS</th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">FUMBLES</th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">SCORING</th>
                  </tr>
                  <tr>
                    <th>Season</th>
                    <th>Team</th>
                    <th>Class</th>
                    <th className="centerCol">G</th>
                    {activeDefs.map((c, idx) => {
                      const isTackleStart = idx === 0;
                      const isIntStart = idx === 3;
                      const isFumbleStart = idx === 7;
                      const isScoreStart = idx === 10;
                      return (
                        <th
                          key={c.key}
                          title={c.fullLabel}
                          className={`${
                            isTackleStart || isIntStart || isFumbleStart || isScoreStart
                              ? "tableGroupDivider "
                              : ""
                          }statCol`}
                        >
                          {c.label}
                        </th>
                      );
                    })}
                  </tr>
                </>
              ) : isKickingTab ? (
                <>
                  <tr>
                    <th colSpan={4}></th>
                    <th colSpan={4} className="tableGroupHeader tableGroupDivider">FIELD GOALS</th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">EXTRA POINTS</th>
                  </tr>
                  <tr>
                    <th>Season</th>
                    <th>Team</th>
                    <th>Class</th>
                    <th className="centerCol">G</th>
                    {activeDefs.map((c, idx) => {
                      const isFgStart = idx === 0;
                      const isXpStart = idx === 4;
                      return (
                        <th
                          key={c.key}
                          title={c.fullLabel}
                          className={`${isFgStart || isXpStart ? "tableGroupDivider " : ""}statCol`}
                        >
                          {c.label}
                        </th>
                      );
                    })}
                  </tr>
                </>
              ) : (
                <tr>
                  <th>Season</th>
                  <th>Team</th>
                  <th>Class</th>
                  <th className="centerCol">G</th>
                  {activeDefs.map((c) => (
                    <th key={c.key} title={c.fullLabel} className="statCol">
                      {c.label}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {seasonRowsForTab.map(({ row, hasStats, hasAnyStats, seasonGp }) => {
                const gp = hasAnyStats ? seasonGp : 0;
                const redshirtYear = Number(row.redshirt) === 1;
                const yearLabel = row.classYear != null ? classLabel(row.classYear) : "";
                const yearText = yearLabel
                  ? `${yearLabel}${Number(row.redshirt) >= 2 ? " (RS)" : ""}`
                  : "";
                const tgid = row.tgid != null ? String(row.tgid) : "";
                const teamRow = tgid ? teamBySeasonTgid.get(`${row.seasonYear}|${tgid}`) || null : null;
                const teamLabel = teamRow
                  ? `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim()
                  : tgid
                    ? `TGID ${tgid}`
                    : "Unknown";
                const logoUrl = overrideByTgid.get(tgid) || logoByTgid.get(tgid) || null;
                return (
                  <tr key={row.seasonYear}>
                    <td>{row.seasonYear}</td>
                    <td>
                      {tgid ? (
                        <Link
                          to={`/team/${tgid}?season=${row.seasonYear}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          <div className="teamCell">
                            {logoUrl ? (
                              <img
                                className="teamLogo"
                                src={logoUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <span>{teamLabel}</span>
                          </div>
                        </Link>
                      ) : (
                        <div className="teamCell">
                          {logoUrl ? (
                            <img
                              className="teamLogo"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                          <span>{teamLabel}</span>
                        </div>
                      )}
                    </td>
                    <td>{yearText}</td>
                    {hasStats ? (
                      <>
                        <td className="centerCol">{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c, idx) => (
                          <td
                            key={c.key}
                            className={`statCol${
                              (() => {
                                const value = valueForStat(row, c.key, tab);
                                const leaders = leadersBySeason.get(String(row.seasonYear));
                                const leaderValue = leaders?.get(c.key);
                                const isLeader =
                                  Number.isFinite(value) &&
                                  Number.isFinite(leaderValue) &&
                                  leaderValue > 0 &&
                                  value === leaderValue;
                                return `${isLeader ? " playerStatLeader" : ""}${defenseDividerClass(idx)}${kickingDividerClass(idx)}`;
                              })()
                            }`}
                          >
                            {formatStat(valueForStat(row, c.key, tab), c.key)}
                          </td>
                        ))}
                      </>
                    ) : !hasAnyStats ? (
                      isDefenseTab ? (
                        <>
                          <td className="centerCol"></td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={4}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                        </>
                      ) : isKickingTab ? (
                        <>
                          <td className="centerCol"></td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={4}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                        </>
                      ) : (
                        <td className="playerSeasonNoteCell" colSpan={activeDefs.length + 1}>
                          <div className="playerSeasonNote">
                            <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                          </div>
                        </td>
                      )
                    ) : (
                      <>
                        <td className="centerCol">{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c, idx) => (
                          <td
                            key={c.key}
                            className={`statCol${defenseDividerClass(idx)}${kickingDividerClass(idx)}`}
                          >
                            0
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                );
              })}
              {teamTotalsForTab.length ? (
                <tr className="playerTotalsDivider">
                  <td colSpan={activeDefs.length + 4}></td>
                </tr>
              ) : null}
              {teamTotalsForTab.map((team) => {
                const teamRow =
                  teamBySeasonTgid.get(`${team.lastSeason}|${team.tgid}`) ||
                  teamBySeasonTgid.get(`${team.firstSeason}|${team.tgid}`) ||
                  null;
                const teamLabel = teamRow
                  ? `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim()
                  : `TGID ${team.tgid}`;
                const logoUrl = overrideByTgid.get(team.tgid) || logoByTgid.get(team.tgid) || null;
                const teamGp = team.gpTotal;
                return (
                  <tr key={`team-${team.tgid}`}>
                    <td>Team Total</td>
                    <td>
                      <Link
                        to={`/team/${team.tgid}?season=${team.lastSeason || team.firstSeason}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        <div className="teamCell">
                          {logoUrl ? (
                            <img
                              className="teamLogo"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                          <span>{teamLabel}</span>
                        </div>
                      </Link>
                    </td>
                    <td></td>
                    <td className="centerCol">{Number.isFinite(teamGp) && teamGp > 0 ? teamGp : ""}</td>
                    {activeDefs.map((c, idx) => {
                      const value = ONE_DECIMAL_KEYS.has(c.key)
                        ? derivedValue(team.totals, c.key, teamGp)
                        : team.totals[c.key];
                      return (
                        <td
                          key={c.key}
                          className={`statCol${defenseDividerClass(idx)}${kickingDividerClass(idx)}`}
                        >
                          {formatStat(value, c.key)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td>Career</td>
                <td></td>
                <td></td>
                <td className="centerCol">{Number.isFinite(careerGp) && careerGp > 0 ? careerGp : ""}</td>
                {activeDefs.map((c, idx) => {
                  const value = ONE_DECIMAL_KEYS.has(c.key)
                    ? derivedValue(careerTotals, c.key, careerGp)
                    : careerTotals[c.key];
                  return (
                    <td
                      key={c.key}
                      className={`statCol${defenseDividerClass(idx)}${kickingDividerClass(idx)}`}
                    >
                      {formatStat(value, c.key)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">No stats found for this category.</div>
      )}
    </div>
  );
}
