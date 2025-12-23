import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);

  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("");

  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [weekFilter, setWeekFilter] = useState("All");

  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
    const week = params.get("week");
    if (season != null) setSeasonYear(season);
    if (week != null) setWeekFilter(week);
  }, [location.search]);

  useEffect(() => {
    if (!dynastyId) return;
    const params = new URLSearchParams(location.search);
    if (seasonYear !== "") params.set("season", seasonYear);
    if (weekFilter) params.set("week", weekFilter);
    navigate({ pathname: "/", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, weekFilter, navigate, location.search]);

  useEffect(() => {
    if (!dynastyId) {
      setAvailableSeasons([]);
      setSeasonYear("");
      return;
    }

    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);

      const params = new URLSearchParams(location.search);
      const paramSeason = params.get("season");
      const paramYearNum = paramSeason ? Number(paramSeason) : null;
      const hasParamYear = paramYearNum != null && Number.isFinite(paramYearNum);
      const shouldDefault = hasParamYear
        ? !years.includes(paramYearNum)
        : seasonYear === "" || !years.includes(Number(seasonYear));
      if (shouldDefault) {
        setSeasonYear(years[0] ?? "");
      }
    })();
  }, [dynastyId, location.search, seasonYear]);

  useEffect(() => {
    if (!dynastyId || seasonYear === "") {
      setAvailableWeeks([]);
      setWeekFilter("All");
      return;
    }

    (async () => {
      const year = Number(seasonYear);
      const games = await db.games.where({ dynastyId, seasonYear: year }).toArray();
      const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);
      setAvailableWeeks(weeks);

      if (weekFilter !== "All" && !weeks.includes(Number(weekFilter))) {
        setWeekFilter("All");
      }
    })();
  }, [dynastyId, seasonYear, location.search]);

  useEffect(() => {
    if (!dynastyId || seasonYear === "") {
      setRows([]);
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

      const nameByTgid = new Map(teamSeasonRows.map((t) => [t.tgid, `${t.tdna} ${t.tmna}`.trim()]));
      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [r.tgid, r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [r.tgid, r.url]));

      const logoFor = (tgid) =>
        overrideByTgid.get(tgid) || baseLogoByTgid.get(tgid) || FALLBACK_LOGO;

      let games = gamesRaw;
      if (weekFilter !== "All") {
        const wf = Number(weekFilter);
        games = gamesRaw.filter((g) => g.week === wf);
      }

      const sorted = games
        .slice()
        .sort((a, b) => a.week - b.week)
        .map((g) => ({
          week: g.week,
          homeTgid: g.homeTgid,
          awayTgid: g.awayTgid,
          homeName: nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`,
          awayName: nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`,
          result:
            g.homeScore != null && g.awayScore != null ? `${g.homeScore} - ${g.awayScore}` : "—",
          homeLogo: logoFor(g.homeTgid),
          awayLogo: logoFor(g.awayTgid),
        }));

      setRows(sorted);
    })();
  }, [dynastyId, seasonYear, weekFilter, location.search]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);
  const weekOptions = useMemo(() => ["All", ...availableWeeks.map(String)], [availableWeeks]);

  if (!dynastyId) {
    return (
      <div>
        <h2>Schedule / Results</h2>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="hrow">
        <h2>Schedule / Results</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Season</span>
            <select value={seasonYear} onChange={(e) => setSeasonYear(e.target.value)} disabled={!hasSeasons}>
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
          No seasons uploaded yet for this dynasty. Use <b>Upload New Season</b> in the sidebar.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Week</th>
              <th>Home</th>
              <th style={{ width: 140 }}>Result</th>
              <th>Away</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.week}-${idx}`}>
                <td>{r.week}</td>
                <td>
                  <Link
                    to={`/team/${r.homeTgid}`}
                    style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                    title="View team page"
                  >
                    <TeamCell name={r.homeName} logoUrl={r.homeLogo} />
                  </Link>
                </td>
                <td>{r.result}</td>
                <td>
                  <Link
                    to={`/team/${r.awayTgid}`}
                    style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                    title="View team page"
                  >
                    <TeamCell name={r.awayName} logoUrl={r.awayLogo} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
