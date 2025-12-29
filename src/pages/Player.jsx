import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import {
  ONE_DECIMAL_KEYS,
  STAT_DEFS,
  classLabel,
  derivedValue,
  formatStat,
  getGpForTab,
  positionLabel,
  rowHasStatsForTab,
} from "../playerStatsUtils";

const LONG_KEYS = new Set(["fgLong", "puntLong", "krLong", "prLong"]);
const TAB_GROUPS = ["Passing", "Rushing", "Receiving", "Defense"];
const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

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

function defaultTabForPosition(value) {
  const pos = positionLabel(value);
  if (pos === "QB") return "Passing";
  if (pos === "HB" || pos === "FB") return "Rushing";
  if (pos === "WR" || pos === "TE") return "Receiving";
  return "Defense";
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
  const [tab, setTab] = useState("Passing");
  const [tabInitialized, setTabInitialized] = useState(false);
  const [teamLogoUrl, setTeamLogoUrl] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamBySeasonTgid, setTeamBySeasonTgid] = useState(new Map());
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setPlayerRows([]);
        setIdentity(null);
        setLoading(false);
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
      setLoading(false);
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

  const availableTabs = TAB_GROUPS;

  useEffect(() => {
    if (!latestRow) return;
    const preferred = defaultTabForPosition(latestRow.position);
    if (!tabInitialized) {
      if (TAB_GROUPS.includes(preferred)) {
        setTab(preferred);
      } else {
        setTab(TAB_GROUPS[0] || "Passing");
      }
      setTabInitialized(true);
      return;
    }
    if (!TAB_GROUPS.includes(tab)) {
      setTab(TAB_GROUPS[0] || "Passing");
    }
  }, [latestRow, tab, tabInitialized]);

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

  const showGroup = () => true;

  const activeDefs = useMemo(() => {
    const defs = defsByGroup.get(tab) || [];
    if (tab === "Rushing") {
      const order = [
        "rushAtt",
        "rushYds",
        "rushYpc",
        "rushTd",
        "rushBtk",
        "rushFum",
        "rush20",
        "rushYac",
      ];
      const labelOverrides = {
        rushAtt: { label: "Rush Att" },
        rushYds: { label: "Rush Yds" },
        rushYpc: { label: "Avg" },
        rushBtk: { label: "Broken Tackle" },
        rushFum: { label: "Fumb" },
        rush20: { label: "20+ Yd Runs" },
        rushYac: { label: "YAC", fullLabel: "Yards After Contact" },
      };
      const map = new Map(defs.map((d) => [d.key, d]));
      return order
        .map((key) => {
          const def = map.get(key);
          if (!def) return null;
          const override = labelOverrides[key];
          return override ? { ...def, ...override } : def;
        })
        .filter(Boolean);
    }
    if (tab === "Passing") {
      const order = ["passQbr", "passComp", "passAtt", "passPct", "passYds", "passTd", "passInt", "passSacks"];
      const map = new Map(defs.map((d) => [d.key, d]));
      return order
        .map((key) => {
          const def = map.get(key);
          if (!def) return null;
          if (def.key === "passQbr") return { ...def, label: "QB Rating" };
          if (def.key === "passPct") return { ...def, label: "Comp %" };
          if (def.key === "passSacks") return { ...def, label: "Sacked" };
          return def;
        })
        .filter(Boolean);
    }
    if (tab === "Receiving") {
      const order = ["recvCat", "recvYds", "recvYpc", "recvTd", "recvYac", "recvDrops"];
      const labelOverrides = {
        recvCat: { label: "Rec" },
        recvYds: { label: "Rec Yds" },
        recvYpc: { label: "Avg" },
        recvTd: { label: "Rec TD" },
        recvYac: { label: "RAC" },
      };
      const map = new Map(defs.map((d) => [d.key, d]));
      return order
        .map((key) => {
          const def = map.get(key);
          if (!def) return null;
          const override = labelOverrides[key];
          return override ? { ...def, ...override } : def;
        })
        .filter(Boolean);
    }
    if (tab === "Defense") {
      const order = [
        "defTkl",
        "defTfl",
        "defSack",
        "defInt",
        "defFF",
        "defFR",
        "defDTD",
        "defPDef",
        "defFumYds",
        "defIntYds",
        "defIntLong",
        "defSafety",
        "defBlk",
      ];
      const labelOverrides = {
        defTkl: { label: "Tackle" },
        defSack: { label: "Sacks" },
        defFF: { label: "Forced Fumb" },
        defFR: { label: "Fumb Rec" },
        defDTD: { label: "Def TD" },
        defPDef: { label: "Pass Defl" },
        defFumYds: { label: "Fumb Yds" },
        defIntYds: { label: "Int Yds" },
        defIntLong: { label: "Int Long" },
      };
      const map = new Map(defs.map((d) => [d.key, d]));
      return order
        .map((key) => {
          const def = map.get(key);
          if (!def) return null;
          const override = labelOverrides[key];
          return override ? { ...def, ...override } : def;
        })
        .filter(Boolean);
    }
    return defs;
  }, [defsByGroup, tab]);
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

  if (loading) {
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

      <h2 style={{ marginTop: 6, marginBottom: 6, textAlign: "center" }}>{displayName}</h2>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="muted" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {latestRow?.jersey != null ? <span>#{latestRow.jersey}</span> : null}
          {latestRow?.position != null ? <span>{positionLabel(latestRow.position)}</span> : null}
          {latestRow?.classYear != null ? (
            <span>
              {classLabel(latestRow.classYear)}
              {Number(latestRow.redshirt) >= 1 ? " (RS)" : ""}
            </span>
          ) : null}
          {identity?.hometown ? <span>Hometown: {identity.hometown}</span> : null}
          {seasonsLabel ? <span>Seasons: {seasonsLabel}</span> : null}
        </div>
      </div>

      {availableTabs.length ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {TAB_GROUPS.map((group) => {
            if (!showGroup(group)) return null;
            return (
              <button
                key={group}
                type="button"
                className="toggleBtn"
                onClick={() => {
                  setTab(group);
                  setTabInitialized(true);
                }}
                style={{
                  fontWeight: tab === group ? 800 : 600,
                  opacity: 1,
                  color: tab === group ? "var(--text)" : "var(--muted)",
                  borderColor: tab === group ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
                  background: tab === group ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
                  boxShadow: tab === group ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
                }}
              >
                {group}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeDefs.length ? (
        <div className="statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Team</th>
                <th>Class</th>
                <th>GP</th>
                {activeDefs.map((c) => (
                  <th key={c.key} title={c.fullLabel}>
                    {c.label}
                  </th>
                ))}
              </tr>
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
                        <td>{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c) => (
                          <td key={c.key}>{formatStat(valueForStat(row, c.key, tab), c.key)}</td>
                        ))}
                      </>
                    ) : !hasAnyStats ? (
                      <td className="playerSeasonNoteCell" colSpan={activeDefs.length + 1}>
                        <div className="playerSeasonNote">
                          <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td>{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c) => (
                          <td key={c.key}>0</td>
                        ))}
                      </>
                    )}
                  </tr>
                );
              })}
              {teamTotals.length ? (
                <tr className="playerTotalsDivider">
                  <td colSpan={activeDefs.length + 4}></td>
                </tr>
              ) : null}
              {teamTotals.map((team) => {
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
                    <td>{Number.isFinite(teamGp) && teamGp > 0 ? teamGp : ""}</td>
                    {activeDefs.map((c) => {
                      const value = ONE_DECIMAL_KEYS.has(c.key)
                        ? derivedValue(team.totals, c.key, teamGp)
                        : team.totals[c.key];
                      return <td key={c.key}>{formatStat(value, c.key)}</td>;
                    })}
                  </tr>
                );
              })}
              <tr>
                <td>Career</td>
                <td></td>
                <td></td>
                <td>{Number.isFinite(careerGp) && careerGp > 0 ? careerGp : ""}</td>
                {activeDefs.map((c) => {
                  const value = ONE_DECIMAL_KEYS.has(c.key)
                    ? derivedValue(careerTotals, c.key, careerGp)
                    : careerTotals[c.key];
                  return <td key={c.key}>{formatStat(value, c.key)}</td>;
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
