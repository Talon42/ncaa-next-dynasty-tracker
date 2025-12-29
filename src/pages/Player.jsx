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

export default function Player() {
  const { playerUid } = useParams();
  const [dynastyId, setDynastyId] = useState(null);
  const [playerRows, setPlayerRows] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Passing");
  const [tabInitialized, setTabInitialized] = useState(false);

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

  const careerTotals = useMemo(() => {
    const totals = {
      gpOff: 0,
      gpDef: 0,
      gpSpec: 0,
      fgLong: null,
      puntLong: null,
      krLong: null,
      prLong: null,
    };

    for (const row of playerRows) {
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
  }, [playerRows]);

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

  const activeDefs = useMemo(() => defsByGroup.get(tab) || [], [defsByGroup, tab]);
  const careerGp = getGpForTab(careerTotals, tab);
  const seasonRowsForTab = useMemo(() => {
    if (!activeDefs.length) return [];
    return playerRows.map((row) => ({
      row,
      hasStats: rowHasStatsForTab(row, activeDefs, tab),
    }));
  }, [activeDefs, playerRows, tab]);

  if (loading) {
    return <div className="muted">Loading...</div>;
  }

  if (!playerRows.length) {
    return <div className="muted">No player stats found.</div>;
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{displayName}</h2>
        <Link to="/player-stats" className="muted" style={{ textDecoration: "none" }}>
          Back to Player Stats
        </Link>
      </div>

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
                <th>GP</th>
                {activeDefs.map((c) => (
                  <th key={c.key} title={c.fullLabel}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasonRowsForTab.map(({ row, hasStats }) => {
                const gp = getGpForTab(row, tab);
                const redshirtYear = Number(row.redshirt) === 1;
                return (
                  <tr key={row.seasonYear}>
                    <td>{row.seasonYear}</td>
                    {hasStats ? (
                      <>
                        <td>{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c) => (
                          <td key={c.key}>{formatStat(valueForStat(row, c.key, tab), c.key)}</td>
                        ))}
                      </>
                    ) : (
                      <td className="playerSeasonNoteCell" colSpan={activeDefs.length + 1}>
                        <div className="playerSeasonNote">
                          <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr>
                <td>Career</td>
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
