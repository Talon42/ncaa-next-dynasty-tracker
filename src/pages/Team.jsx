import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";

const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

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

export default function Team() {
  const { tgid } = useParams();
  const teamTgid = String(tgid ?? "");

  const [dynastyId, setDynastyId] = useState(null);

  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("All");

  const [teamName, setTeamName] = useState("");
  const [teamLogo, setTeamLogo] = useState(FALLBACK_LOGO);

  // When a specific season is selected
  const [rows, setRows] = useState([]);

  // When "All" seasons is selected
  const [seasonSections, setSeasonSections] = useState([]);

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  // Seasons where this team appears (based on games)
  useEffect(() => {
    if (!dynastyId || !teamTgid) {
      setAvailableSeasons([]);
      setSeasonYear("All");
      return;
    }

    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      const teamGames = allGames.filter(
        (g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid
      );

      const years = Array.from(new Set(teamGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);
      setSeasonYear("All"); // default to All
    })();
  }, [dynastyId, teamTgid]);

  // Load header + rows/sections (supports Season = All)
  useEffect(() => {
    if (!dynastyId || !teamTgid) {
      setRows([]);
      setSeasonSections([]);
      setTeamName("");
      setTeamLogo(FALLBACK_LOGO);
      return;
    }

    (async () => {
      // Pull all needed data once (local-first, small enough for now)
      const [gamesAll, teamSeasonsAll, teamLogoRows, overrideRows] = await Promise.all([
        db.games.where({ dynastyId }).toArray(),
        db.teamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));

      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      // Prefer the most recent season's name for the header (if available)
      const latestYear = availableSeasons[0];
      const latestNameMap = new Map(
        teamSeasonsAll
          .filter((t) => t.seasonYear === latestYear)
          .map((t) => [String(t.tgid), `${t.tdna} ${t.tmna}`.trim()])
      );

      setTeamName(latestNameMap.get(teamTgid) || `TGID ${teamTgid}`);
      setTeamLogo(logoFor(teamTgid));

      const makeRowsForSeason = (year) => {
        const nameByTgid = new Map(
          teamSeasonsAll
            .filter((t) => t.seasonYear === year)
            .map((t) => [String(t.tgid), `${t.tdna} ${t.tmna}`.trim()])
        );

        const teamGames = gamesAll
          .filter((g) => g.seasonYear === year)
          .filter((g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid);

        return teamGames
          .slice()
          .sort((a, b) => a.week - b.week)
          .map((g) => {
            const isHome = String(g.homeTgid) === teamTgid;
            const oppTgid = String(isHome ? g.awayTgid : g.homeTgid);

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
              outcome,
              result: hasScore ? `${g.homeScore} - ${g.awayScore}` : "—",
            };
          });
      };

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
        <Link to="/" className="kicker">
          ← Back to Schedule / Results
        </Link>
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
      <h2 style={{ marginTop: 0, marginBottom: 10, textAlign: "center" }}>{teamName}</h2>

      {/* Back link + Season filter row */}
      <div className="hrow" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/" className="kicker" style={{ display: "inline-block", marginBottom: 10 }}>
            ← Back to Schedule / Results
          </Link>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Season</span>
            <select
              value={seasonYear}
              onChange={(e) => setSeasonYear(e.target.value)}
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
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>{sec.seasonYear}</h3>

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
                      <td>{r.week}</td>
                      <td>
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
                      <td>
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
                <td>{r.week}</td>
                <td>
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
                <td>
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
