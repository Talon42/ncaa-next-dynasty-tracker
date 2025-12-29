import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import {
  ONE_DECIMAL_KEYS,
  STAT_DEFS,
  TAB_ORDER,
  classLabel,
  derivedValue,
  formatStat,
  positionLabel,
} from "../playerStatsUtils";

const LONG_KEYS = new Set(["fgLong", "puntLong", "krLong", "prLong"]);

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

function gpForGroup(totals, group) {
  if (group === "Passing" || group === "Rushing" || group === "Receiving") return totals.gpOff;
  if (group === "Defense") return totals.gpDef;
  if (group === "Special Teams") return totals.gpSpec;
  return totals.gpOff;
}

export default function Player() {
  const { playerUid } = useParams();
  const [dynastyId, setDynastyId] = useState(null);
  const [playerRows, setPlayerRows] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const showGroup = (group) => {
    const gp = gpForGroup(careerTotals, group);
    if (Number.isFinite(gp) && gp > 0) return true;
    const defs = defsByGroup.get(group) || [];
    return defs.some((def) => {
      if (ONE_DECIMAL_KEYS.has(def.key)) return false;
      const value = careerTotals[def.key];
      return Number.isFinite(value) && value !== 0;
    });
  };

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
          {latestRow?.classYear != null ? <span>{classLabel(latestRow.classYear)}</span> : null}
          {identity?.hometown ? <span>Hometown: {identity.hometown}</span> : null}
          {seasonsLabel ? <span>Seasons: {seasonsLabel}</span> : null}
        </div>
      </div>

      {TAB_ORDER.map((group) => {
        if (!showGroup(group)) return null;
        const defs = defsByGroup.get(group) || [];
        const gp = gpForGroup(careerTotals, group);

        return (
          <div key={group} style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8 }}>{group} (Career)</h3>
            <div className="statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>GP</th>
                    {defs.map((c) => (
                      <th key={c.key} title={c.fullLabel}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{Number.isFinite(gp) ? gp : ""}</td>
                    {defs.map((c) => {
                      const value = ONE_DECIMAL_KEYS.has(c.key)
                        ? derivedValue(careerTotals, c.key, gp)
                        : careerTotals[c.key];
                      return <td key={c.key}>{formatStat(value, c.key)}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
