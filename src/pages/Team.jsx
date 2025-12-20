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

export default function Team() {
  const { tgid } = useParams();
  const teamTgid = String(tgid ?? "");

  const [dynastyId, setDynastyId] = useState(null);

  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("");

  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [weekFilter, setWeekFilter] = useState("All");

  const [teamName, setTeamName] = useState("");
  const [teamLogo, setTeamLogo] = useState(FALLBACK_LOGO);

  const [rows, setRows] = useState([]);

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
      setSeasonYear("");
      return;
    }

    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      const teamGames = allGames.filter(
        (g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid
      );

      const years = Array.from(new Set(teamGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);
      setSeasonYear(years[0] ?? "");
    })();
  }, [dynastyId, teamTgid]);

  // Weeks available for the selected season (team only)
  useEffect(() => {
    if (!dynastyId || seasonYear === "" || !teamTgid) {
      setAvailableWeeks([]);
      setWeekFilter("All");
      return;
    }

    (async () => {
      const year = Number(seasonYear);
      const games = await db.games.where({ dynastyId, seasonYear: year }).toArray();
      const teamGames = games.filter(
        (g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid
      );

      const weeks = Array.from(new Set(teamGames.map((g) => g.week))).sort((a, b) => a - b);
      setAvailableWeeks(weeks);

      if (weekFilter !== "All" && !weeks.includes(Number(weekFilter))) {
        setWeekFilter("All");
      }
    })();
  }, [dynastyId, seasonYear, teamTgid]);

  // Load header (team name/logo) + table rows
  useEffect(() => {
    if (!dynastyId || seasonYear === "" || !teamTgid) {
      setRows([]);
      setTeamName("");
      setTeamLogo(FALLBACK_LOGO);
      return;
    }

    (async () => {
      const year = Number(seasonYear);

      const [gamesRaw, teamSeasonRows, teamLogoRows, overrideRows] = await Promise.all([
        db.games.where({ dynastyId, seasonYear: year }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear: year }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      const nameByTgid = new Map(
        teamSeasonRows.map((t) => [String(t.tgid), `${t.tdna} ${t.tmna}`.trim()])
      );
      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));

      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      setTeamName(nameByTgid.get(teamTgid) || `TGID ${teamTgid}`);
      setTeamLogo(logoFor(teamTgid));

      let games = gamesRaw.filter(
        (g) => String(g.homeTgid) === teamTgid || String(g.awayTgid) === teamTgid
      );
      if (weekFilter !== "All") {
        const wf = Number(weekFilter);
        games = games.filter((g) => g.week === wf);
      }

      const sorted = games
        .slice()
        .sort((a, b) => a.week - b.week)
        .map((g) => {
          const isHome = String(g.homeTgid) === teamTgid;
          const oppTgid = String(isHome ? g.awayTgid : g.homeTgid);

          return {
            week: g.week,
            isHome,
            oppTgid,
            oppName: nameByTgid.get(oppTgid) || `TGID ${oppTgid}`,
            oppLogo: logoFor(oppTgid),
            result:
              g.homeScore != null && g.awayScore != null ? `${g.homeScore} - ${g.awayScore}` : "—",
          };
        });

      setRows(sorted);
    })();
  }, [dynastyId, seasonYear, weekFilter, teamTgid]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);
  const weekOptions = useMemo(() => ["All", ...availableWeeks.map(String)], [availableWeeks]);

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
        <Link to="/" className="kicker">← Back to Schedule / Results</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="hrow" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/" className="kicker" style={{ display: "inline-block", marginBottom: 10 }}>
            ← Back to Schedule / Results
          </Link>
          <h2 style={{ marginTop: 0 }}>{teamName}</h2>
          <div style={{ marginTop: 6 }}>
            <TeamCell name="" logoUrl={teamLogo} />
          </div>
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
                seasonOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Week</span>
            <select
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              disabled={!hasSeasons || availableWeeks.length === 0}
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!hasSeasons ? (
        <p className="kicker">
          This team has no games yet. Import a season via <b>Upload New Season</b>.
        </p>
      ) : (
        <table className="table">
        <thead>
        <tr>
            <th style={{ width: 80 }}>Week</th>
            <th>Opponent</th>
            <th style={{ width: 140 }}>Result</th>
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
                    fontWeight: 700,
                    opacity: 0.9,
                    }}
                    title={r.isHome ? "Home game" : "Away game"}
                >
                    {r.isHome ? "vs" : "@"}
                </span>

                <Link
                    to={`/team/${r.oppTgid}`}
                    style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                    title="View opponent team page"
                >
                    <TeamCell name={r.oppName} logoUrl={r.oppLogo} />
                </Link>
                </div>
            </td>
            <td>{r.result}</td>
            </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
