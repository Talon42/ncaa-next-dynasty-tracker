import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { readSeasonFilter, writeSeasonFilter } from "../seasonFilter";
import { loadPostseasonLogoMap } from "../logoService";
import {
  buildSeasonBowlNameMap,
  createPostseasonLogoResolver,
  getSeasonBowlName,
} from "../postseasonMeta";

const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

function normalizeTgid(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

async function fetchTeamGamesAllSeasons(dynastyId, teamTgid) {
  const tgidKey = normalizeTgid(teamTgid);
  const tgidNum = Number(tgidKey);
  const keys = [tgidKey];
  if (Number.isFinite(tgidNum)) keys.push(tgidNum);

  const uniq = new Map();
  const addAll = (rows) => {
    for (const g of rows) {
      const k = `${g.seasonYear}|${g.week}|${g.homeTgid}|${g.awayTgid}`;
      if (!uniq.has(k)) uniq.set(k, g);
    }
  };

  // Fast path: use indexes (works when homeTgid/awayTgid are consistently typed)
  try {
    for (const k of keys) {
      const [home, away] = await Promise.all([
        db.games.where("[dynastyId+homeTgid]").equals([dynastyId, k]).toArray(),
        db.games.where("[dynastyId+awayTgid]").equals([dynastyId, k]).toArray(),
      ]);
      addAll(home);
      addAll(away);
    }

    const fast = Array.from(uniq.values());
    if (fast.length > 0) return fast;
  } catch {
    // If indexes don't exist yet (or schema mismatch), fall back to a scan below.
  }

  // Safe fallback: scan dynasty games then filter in-memory (slower, but prevents blank schedules)
  const all = await db.games.where({ dynastyId }).toArray();
  const match = all.filter(
    (g) => normalizeTgid(g.homeTgid) === tgidKey || normalizeTgid(g.awayTgid) === tgidKey
  );
  return match;
}

function TeamCell({ name, logoUrl }) {
  const [src, setSrc] = useState(logoUrl || FALLBACK_LOGO);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK_LOGO);
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
          if (src !== FALLBACK_LOGO) setSrc(FALLBACK_LOGO);
        }}
      />
      <span>{name}</span>
    </div>
  );
}

function OutcomeBadge({ outcome }) {
  if (!outcome) return null;

  const color = outcome === "W" ? "green" : outcome === "L" ? "red" : "inherit";
  const title = outcome === "W" ? "Win" : outcome === "L" ? "Loss" : "Tie";

  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        minWidth: 16,
        fontWeight: 900,
        marginRight: 8,
        color,
      }}
    >
      {outcome}
    </span>
  );
}

/**
 * Prestige: show ONLY filled stars (no empties)
 * TMPR is expected 1..6
 */
function PrestigeStars({ value }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const clamped = Math.max(1, Math.min(6, Math.trunc(n)));
  if (clamped <= 0) return null;

  return (
    <div
      style={{
        textAlign: "center",
        marginTop: -6,
        marginBottom: 10,
        fontSize: 30,
        letterSpacing: 2,
        opacity: 0.95,
        userSelect: "none",
      }}
      title={`Prestige: ${clamped}/6`}
      aria-label={`Prestige ${clamped} out of 6`}
    >
      {"★".repeat(clamped)}
    </div>
  );
}

export default function Team() {
  const { tgid } = useParams();
  const location = useLocation();
  const teamTgid = String(tgid ?? "");

  const [dynastyId, setDynastyId] = useState(null);

  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [teamGamesAll, setTeamGamesAll] = useState([]);
  const [seasonYear, setSeasonYear] = useState("All");

  const [teamName, setTeamName] = useState("");
  const [teamLogo, setTeamLogo] = useState(FALLBACK_LOGO);
  const [postseasonLogoMap, setPostseasonLogoMap] = useState(new Map());

  // ✅ NEW: latest-season prestige (TMPR)
  const [teamPrestige, setTeamPrestige] = useState(null);

  // When a specific season is selected
  const [rows, setRows] = useState([]);

  // When "All" seasons is selected
  const [seasonSections, setSeasonSections] = useState([]);

  // Season records (wins/losses/ties) for display in headers
  const [seasonRecordByYear, setSeasonRecordByYear] = useState(new Map());

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const map = await loadPostseasonLogoMap();
      if (!alive) return;
      setPostseasonLogoMap(map);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Seasons where this team appears (based on games) — optimized: query just this team via indexes
useEffect(() => {
  if (!dynastyId || !teamTgid) {
    setAvailableSeasons([]);
    setSeasonYear("All");
    setTeamGamesAll([]);
    setSeasonRecordByYear(new Map());
    return;
  }

  let alive = true;

  (async () => {
    const games = await fetchTeamGamesAllSeasons(dynastyId, teamTgid);
    if (!alive) return;

    // Sort once for deterministic behavior (season desc, week asc)
    games.sort((a, b) => {
      const sy = Number(b.seasonYear) - Number(a.seasonYear);
      if (sy) return sy;
      return Number(a.week ?? 0) - Number(b.week ?? 0);
    });

    setTeamGamesAll(games);

    const years = Array.from(
      new Set(games.map((g) => Number(g.seasonYear)).filter((n) => Number.isFinite(n)))
    ).sort((a, b) => b - a);

    setAvailableSeasons(years);
    const params = new URLSearchParams(location.search);
    const paramSeasonRaw = params.get("season");
    const paramSeason = paramSeasonRaw ? Number(paramSeasonRaw) : null;
    if (paramSeason != null && Number.isFinite(paramSeason) && years.includes(paramSeason)) {
      setSeasonYear(String(paramSeason));
      writeSeasonFilter(String(paramSeason));
    } else {
      const saved = readSeasonFilter();
      if (saved && years.includes(Number(saved))) {
        setSeasonYear(String(saved));
      } else {
        setSeasonYear("All"); // default to All
      }
    }

    // Precompute season records for headers
    const rec = new Map();
    for (const g of games) {
      const y = Number(g.seasonYear);
      if (!Number.isFinite(y)) continue;

      const hs = g.homeScore;
      const as = g.awayScore;
      if (hs == null || as == null) continue;

      const isHome = String(g.homeTgid) === String(teamTgid);
      const ptsFor = isHome ? Number(hs) : Number(as);
      const ptsAgainst = isHome ? Number(as) : Number(hs);

      const cur = rec.get(y) || { w: 0, l: 0, t: 0 };
      if (ptsFor > ptsAgainst) cur.w += 1;
      else if (ptsFor < ptsAgainst) cur.l += 1;
      else cur.t += 1;
      rec.set(y, cur);
    }
    setSeasonRecordByYear(rec);
  })();

  return () => {
    alive = false;
  };
  }, [dynastyId, teamTgid, location.search]);

  useEffect(() => {
    writeSeasonFilter(seasonYear);
  }, [seasonYear]);

  // Load header + rows/sections (supports Season = All)
  useEffect(() => {
    if (!dynastyId || !teamTgid) {
      setRows([]);
      setSeasonSections([]);
      setTeamName("");
      setTeamLogo(FALLBACK_LOGO);
      setTeamPrestige(null);
      setSeasonRecordByYear(new Map());
      return;
    }

    (async () => {
      // Pull all needed data once (local-first, small enough for now)
      const [teamSeasonsAll, teamLogoRows, overrideRows, bowlRows] = await Promise.all([
        db.teamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
        db.bowlGames.where({ dynastyId }).toArray(),
      ]);

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));

      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      const bowlByKey = buildSeasonBowlNameMap(bowlRows);
      const bowlNameFor = (seasonYearValue, sewnValue, sgnmValue) =>
        getSeasonBowlName(bowlByKey, seasonYearValue, sewnValue, sgnmValue);
      const postseasonLogoFor = createPostseasonLogoResolver(postseasonLogoMap);

      // Prefer the most recent season's name for the header (if available)
      const latestYear = availableSeasons[0];

      const latestRows = teamSeasonsAll.filter((t) => t.seasonYear === latestYear);
      const latestTeamRow = latestRows.find((t) => String(t.tgid) === teamTgid);

      const latestNameMap = new Map(
        latestRows.map((t) => [String(t.tgid), `${t.tdna} ${t.tmna}`.trim()])
      );

      setTeamName(latestNameMap.get(teamTgid) || `TGID ${teamTgid}`);
      setTeamLogo(logoFor(teamTgid));

      // ✅ NEW: set prestige from latest season team row (TMPR)
      // Stored as `tmpr` on teamSeasons rows (recommended). If missing, prestige won't show.
      setTeamPrestige(latestTeamRow?.tmpr ?? null);

      const computeRecordForSeason = (year) => {
        const teamGames = teamGamesAll
          .filter((g) => g.seasonYear === year)
          .filter((g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid);

        let w = 0,
          l = 0,
          t = 0;
        for (const g of teamGames) {
          const hasScore = g.homeScore != null && g.awayScore != null;
          if (!hasScore) continue;

          const isHome = String(g.homeTgid) === teamTgid;
          const teamScore = isHome ? g.homeScore : g.awayScore;
          const oppScore = isHome ? g.awayScore : g.homeScore;

          if (teamScore > oppScore) w += 1;
          else if (teamScore < oppScore) l += 1;
          else t += 1;
        }

        return { w, l, t };
      };

      const makeRowsForSeason = (year) => {
        const nameByTgid = new Map(
          teamSeasonsAll
            .filter((t) => t.seasonYear === year)
            .map((t) => [String(t.tgid), `${t.tdna} ${t.tmna}`.trim()])
        );

        const teamGames = teamGamesAll
          .filter((g) => g.seasonYear === year)
          .filter((g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid);

        return teamGames
          .slice()
          .sort((a, b) => a.week - b.week)
          .map((g) => {
            const isHome = String(g.homeTgid) === teamTgid;
            const oppTgid = String(isHome ? g.awayTgid : g.homeTgid);
            const bowlNameRaw = bowlNameFor(year, Number(g.week), g.sgnm);
            const bowlName = /^nat championship$/i.test(bowlNameRaw)
              ? "National Championship"
              : bowlNameRaw;
            const bowlLogoUrl = bowlName ? postseasonLogoFor(bowlName) : "";

            const hasScore = g.homeScore != null && g.awayScore != null;
            const teamScore = hasScore ? (isHome ? g.homeScore : g.awayScore) : null;
            const oppScore = hasScore ? (isHome ? g.awayScore : g.homeScore) : null;

            let outcome = "";
            if (hasScore && teamScore != null && oppScore != null) {
              if (teamScore > oppScore) outcome = "W";
              else if (teamScore < oppScore) outcome = "L";
              else outcome = "T";
            }

            return {
              week: g.week,
              isHome,
              oppTgid,
              oppName: nameByTgid.get(oppTgid) || `TGID ${oppTgid}`,
              oppLogo: logoFor(oppTgid),
              bowlName,
              bowlLogoUrl,
              outcome,
              result: hasScore ? `${g.homeScore} - ${g.awayScore}` : "—",
            };
          });
      };

      // Build record map for all available seasons (for headers)
      const recMap = new Map();
      for (const y of availableSeasons) {
        recMap.set(y, computeRecordForSeason(y));
      }
      setSeasonRecordByYear(recMap);

      if (seasonYear === "All") {
        setRows([]);
        setSeasonSections(
          availableSeasons.map((y) => ({
            seasonYear: y,
            rows: makeRowsForSeason(y),
          }))
        );
      } else {
        const year = Number(seasonYear);
        setSeasonSections([]);
        setRows(makeRowsForSeason(year));
      }
    })();
  }, [dynastyId, teamTgid, seasonYear, availableSeasons]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);

  const recordTextForYear = (year) => {
    const rec = seasonRecordByYear.get(year);
    if (!rec) return "";
    const base = `${rec.w}-${rec.l}`;
    return rec.t > 0 ? `${base}-${rec.t}` : base;
  };

  const lastPostseasonWinFor = (rows) => {
    const wins = rows
      .filter((r) => r.bowlName && r.outcome === "W")
      .slice()
      .sort((a, b) => Number(a.week) - Number(b.week));
    return wins[wins.length - 1] || null;
  };

  if (!dynastyId) {
    return (
      <div>
        <h2>Team</h2>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  if (!teamTgid) {
    return (
      <div>
        <h2>Team</h2>
        <p className="kicker">Invalid team TGID.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Centered logo */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 0,
          marginBottom: 6,
        }}
      >
        <img
          src={teamLogo}
          alt={teamName}
          style={{
            width: 180,
            height: 180,
            objectFit: "contain",
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = FALLBACK_LOGO;
          }}
        />
      </div>

      {/* Centered team name */}
      <h2 style={{ marginTop: 0, marginBottom: 6, textAlign: "center" }}>{teamName}</h2>

      {/* ✅ NEW: prestige under team name (latest season only) */}
      <PrestigeStars value={teamPrestige} />

      {/* Season filter row */}
      <div className="hrow" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Season</span>
            <select
              value={seasonYear}
              onChange={(e) => {
                const next = e.target.value;
                setSeasonYear(next);
                writeSeasonFilter(next);
              }}
              disabled={!hasSeasons}
            >
              {!hasSeasons ? (
                <option value="">No seasons uploaded</option>
              ) : (
                <>
                  <option value="All">All</option>
                  {seasonOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
        </div>
      </div>

      {!hasSeasons ? (
        <p className="kicker">
          This team has no games yet. Import a season via <b>Upload New Season</b>.
        </p>
      ) : seasonYear === "All" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {seasonSections.map((sec) => (
            <div key={sec.seasonYear} className="card" style={{ padding: 14 }}>
              {(() => {
                const champ = lastPostseasonWinFor(sec.rows);
                return (
                  <h3 style={{ marginTop: 0, marginBottom: 10 }}>
                    {sec.seasonYear} ({recordTextForYear(sec.seasonYear)})
                    {champ ? (
                      <span className="champBadge">
                        {champ.bowlLogoUrl ? (
                          <img src={champ.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : null}
                        {champ.bowlName}
                      </span>
                    ) : null}
                  </h3>
                );
              })()}

              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Week</th>
                    <th>Opponent</th>
                    <th style={{ width: 180 }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, idx) => (
                    <tr key={`${sec.seasonYear}-${r.week}-${idx}`}>
                      <td data-label="Week">{r.week}</td>
                      <td data-label="Opponent">
                        {r.bowlName ? (
                          <div className="postseasonMeta">
                            {r.bowlLogoUrl ? (
                              <img src={r.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                            ) : null}
                            <span>{r.bowlName}</span>
                          </div>
                        ) : null}
                        {/* FIX: enforce horizontal layout so vs/@ never stacks above logo */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 22,
                              textAlign: "center",
                              fontWeight: 800,
                              opacity: 0.9,
                            }}
                            title={r.isHome ? "Home game" : "Away game"}
                          >
                            {r.isHome ? "vs" : "@"}
                          </span>

                          <Link
                            to={`/team/${r.oppTgid}`}
                            style={{
                              color: "inherit",
                              textDecoration: "none",
                              display: "inline-block",
                            }}
                            title="View opponent team page"
                          >
                            <TeamCell name={r.oppName} logoUrl={r.oppLogo} />
                          </Link>
                        </div>
                      </td>
                      <td data-label="Result">
                        <OutcomeBadge outcome={r.outcome} />
                        {r.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Week</th>
              <th>Opponent</th>
              <th style={{ width: 180 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.week}-${idx}`}>
                <td data-label="Week">{r.week}</td>
                <td data-label="Opponent">
                  {r.bowlName ? (
                    <div className="postseasonMeta">
                      {r.bowlLogoUrl ? (
                        <img src={r.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : null}
                      <span>{r.bowlName}</span>
                    </div>
                  ) : null}
                  {/* FIX: enforce horizontal layout so vs/@ never stacks above logo */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 22,
                        textAlign: "center",
                        fontWeight: 800,
                        opacity: 0.9,
                      }}
                      title={r.isHome ? "Home game" : "Away game"}
                    >
                      {r.isHome ? "vs" : "@"}
                    </span>

                    <Link
                      to={`/team/${r.oppTgid}`}
                      style={{
                        color: "inherit",
                        textDecoration: "none",
                        display: "inline-block",
                      }}
                      title="View opponent team page"
                    >
                      <TeamCell name={r.oppName} logoUrl={r.oppLogo} />
                    </Link>
                  </div>
                </td>
                <td data-label="Result">
                  <OutcomeBadge outcome={r.outcome} />
                  {r.result}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
