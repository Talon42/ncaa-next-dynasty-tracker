import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";

const FALLBACK_TEAM_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

/**
 * Team Stats (TSSE)
 * - Keys are the TSSE column names (lowercase). We also support older imports where TSSE headers
 *   were mixed-case (e.g., tsDi, tsPt, tsPy, tsTy) by building a lowercase lookup map per row.
 *
 * Notes from your real TSSE sample:
 * - "Sacks" is TSSE column "tssa" (not "tsaa")
 * - TSSE includes "tspd" (not present in the definitions reference); we show it as Passing TD.
 */
const STAT_DEFS = [
  // Offense (requested order)
  { key: "tsTy", label: "Tot Yds", fullLabel: "Total Yards", group: "Offense" },
  { key: "tsoy", label: "Tot Off", fullLabel: "Total Offense", group: "Offense" },
  { key: "tsop", label: "Pass Yds", fullLabel: "Passing Yards", group: "Offense" },
  { key: "tsor", label: "Rush Yds", fullLabel: "Rushing Yards", group: "Offense" },
  { key: "tspt", label: "Pass TD", fullLabel: "Passing TD", group: "Offense" },
  { key: "tsrt", label: "Rush TD", fullLabel: "Rushing TD", group: "Offense" },
  { key: "ts1d", label: "1D", fullLabel: "1st Downs", group: "Offense" },
  { key: "tssa", label: "SACK", fullLabel: "Sacks", group: "Offense" },
  { key: "tspi", label: "INT", fullLabel: "Interceptions", group: "Offense" },

  // Defense (requested order)
  // NOTE: TSSE uses the same "tsTy/tsPy/tsRy" style headers. We read case-insensitively via __lc.
  { key: "defTotYds", label: "Tot Yds", fullLabel: "Total Yards Allowed", group: "Defense" },
  { key: "tsdp", label: "Pass Yds", fullLabel: "Passing Yards", group: "Defense" },
  { key: "tsdy", label: "Rush Yds", fullLabel: "Rushing Yards", group: "Defense" },
  { key: "tssk", label: "SACK", fullLabel: "Sacks", group: "Defense" },
  { key: "tsdi", label: "INT", fullLabel: "Interceptions", group: "Defense" },

  // Efficiency (requested order)
  { key: "ts3c", label: "3DC", fullLabel: "3rd Down Conversions", group: "Efficiency" },
  { key: "ts3d", label: "3DA", fullLabel: "3rd Down Attempts", group: "Efficiency" },
  { key: "ts4c", label: "4DC", fullLabel: "4th Down Conversions", group: "Efficiency" },
  { key: "ts4d", label: "4DA", fullLabel: "4th Down Attempts", group: "Efficiency" },
  { key: "tsoz", label: "RZ Att", fullLabel: "Offensive RZ Attempts", group: "Efficiency" },
  { key: "tsot", label: "RZ TD", fullLabel: "Offensive RZ TD", group: "Efficiency" },
  { key: "tsof", label: "RZ FG", fullLabel: "Offensive RZ FG", group: "Efficiency" },
  { key: "tsdr", label: "RZ Att", fullLabel: "Defensive RZ Attempts", group: "Efficiency" },
  { key: "tsdt", label: "RZ TD", fullLabel: "Defensive RZ TD", group: "Efficiency" },
  { key: "tsdf", label: "RZ FG", fullLabel: "Defensive RZ FG", group: "Efficiency" },
  { key: "ts2c", label: "2PC", fullLabel: "2 Point Conversions", group: "Efficiency" },
  { key: "ts2a", label: "2PA", fullLabel: "2 Point Attempts", group: "Efficiency" },
  { key: "tspe", label: "PEN", fullLabel: "Penalties", group: "Efficiency" },
  { key: "tspy", label: "Pen Yds", fullLabel: "Penalty Yards", group: "Efficiency" },
];

const TAB_ORDER = ["Offense", "Defense", "Efficiency"];

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

function TeamCell({ name, logoUrl }) {
  const [src, setSrc] = useState(logoUrl || FALLBACK_TEAM_LOGO);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK_TEAM_LOGO);
  }, [logoUrl]);

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
      <span>{name}</span>
    </div>
  );
}

export default function TeamStats() {
  const [dynastyId, setDynastyId] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [tab, setTab] = useState("Offense");

  const [rows, setRows] = useState([]); // { tgid, teamName, logoUrl, __lc, ...stats }
  const [loading, setLoading] = useState(true);

  const [sortKey, setSortKey] = useState("teamName");
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

  const teamLogoFor = (id) =>
    overrideByTgid.get(String(id)) || logoByTgid.get(String(id)) || FALLBACK_TEAM_LOGO;

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
        return;
      }

      const statsRows = await db.teamStats.where({ dynastyId: id }).toArray();
      if (!alive) return;

      // newest -> oldest
      const years = Array.from(
        new Set(statsRows.map((r) => Number(r.seasonYear)).filter((n) => Number.isFinite(n)))
      ).sort((a, b) => b - a);

      setAvailableYears(years);

      // Default to latest season if none selected (latest is first because of DESC sort)
      if (years.length) {
        const latest = years[0];
        setSeasonYear((cur) => (cur == null ? latest : cur));
      } else {
        setSeasonYear(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Load team logos for this dynasty (same tables used elsewhere)
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

  // Load team names + stats for the selected season
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !seasonYear) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const [teamSeasons, teamStats] = await Promise.all([
        db.teamSeasons.where({ dynastyId, seasonYear }).toArray(),
        db.teamStats.where({ dynastyId, seasonYear }).toArray(),
      ]);

      if (!alive) return;

      const nameByTgid = new Map(
        teamSeasons.map((t) => {
          const tdna = String(t.tdna ?? "").trim();
          const tmna = String(t.tmna ?? "").trim();
          const teamName = `${tdna}${tdna && tmna ? " " : ""}${tmna}`.trim() || t.tgid;
          return [String(t.tgid), teamName];
        })
      );

      // Build a lowercase lookup map so we can read older imports with mixed-case TSSE keys
      const merged = teamStats.map((s) => {
        const lc = {};
        for (const [k, v] of Object.entries(s)) {
          lc[String(k).toLowerCase()] = v;
        }

        const tgid = String(s.tgid);

        // Defensive Total Yards Allowed is not a TSSE column; derive it as Pass Yds Allowed + Rush Yds Allowed
        const defPass = Number(s.tsdp ?? lc["tsdp"] ?? 0);
        const defRush = Number(s.tsdy ?? lc["tsdy"] ?? 0);
        const defTotYds = Number.isFinite(defPass) && Number.isFinite(defRush) ? defPass + defRush : null;

        return {
          ...s,
          __lc: lc,
          teamName: nameByTgid.get(tgid) ?? tgid,
          logoUrl: teamLogoFor(tgid),
          defTotYds,
        };
      });

      setRows(merged);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear, logoByTgid, overrideByTgid]);

  const colsForTab = useMemo(() => STAT_DEFS.filter((d) => d.group === tab), [tab]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;

    const arr = [...rows];

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
  }, [rows, sortKey, sortDir]);

  // deterministic toggle: click same header toggles asc/desc
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
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div>
      <div className="hrow">
        <h2>Team Stats</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Season
            </span>
            <select
              value={seasonYear ?? ""}
              onChange={(e) => setSeasonYear(Number(e.target.value))}
              disabled={!availableYears.length}
            >
              {availableYears.length === 0 ? (
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

          <div style={{ display: "flex", gap: 6 }}>
            {TAB_ORDER.map((t) => (
              <button
                key={t}
                className="toggleBtn"
                onClick={() => {
                  setTab(t);
                  // Keep sorting stable: if current sortKey isn't on this tab, fall back to Team
                  const allowedKeys = new Set([
                    "teamName",
                    ...STAT_DEFS.filter((d) => d.group === t).map((d) => d.key),
                  ]);
                  setSortKey((cur) => (allowedKeys.has(cur) ? cur : "teamName"));
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
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : availableYears.length === 0 ? (
        <div className="muted">
          No Team Stats imported yet. Import a season with TEAM.csv, SCHD.csv, and TSSE.csv.
        </div>
      ) : rows.length === 0 ? (
        <div className="muted">No stats rows found for {seasonYear}.</div>
      ) : (
        <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
          <h3 className="statsGroupTitle">{tab}</h3>

          <div
            className="statsTableWrap"
            style={{
              width: "100%",
              maxWidth: "100%",
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
              paddingBottom: 6,
            }}
          >
            <table className="table" style={{ width: "max-content", minWidth: "100%", overflow: "visible" }}>
              <thead>
                <tr>
                  <th
                    onClick={() => clickSort("teamName")}
                    style={{ width: 190, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", paddingRight: 10 }}
                    title="Sort"
                  >
                    Team{sortIndicator("teamName")}
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
                {sortedRows.map((r) => (
                  <tr key={r.tgid}>
                    <td style={{ paddingRight: 10 }}>
                      <Link
                        to={`/team/${r.tgid}`}
                        style={{ color: "inherit", textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" }}
                        title="View team page"
                      >
                        <TeamCell name={r.teamName} logoUrl={r.logoUrl} />
                      </Link>
                    </td>

                    {colsForTab.map((c) => (
                      <td key={c.key} style={{ whiteSpace: "nowrap" }}>{getVal(r, c.key) ?? ""}</td>
                    ))}
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
