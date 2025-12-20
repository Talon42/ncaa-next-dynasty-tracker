import { useEffect, useMemo, useState } from "react";
import { db, getActiveDynastyId, getDynasty } from "../db";

export default function Home() {
  const [dynastyId, setDynastyId] = useState(null);
  const [dynastyName, setDynastyName] = useState("");
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("");
  const [rows, setRows] = useState([]);

  // Load active dynasty on mount
  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
      const d = await getDynasty(id);
      setDynastyName(d?.name ?? "");
    })();
  }, []);

  // Load season list for active dynasty
  useEffect(() => {
    if (!dynastyId) return;
    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);
      setSeasonYear(years[0] ?? "");
    })();
  }, [dynastyId]);

  // Load schedule rows for selected season
  useEffect(() => {
    if (!dynastyId || seasonYear === "" || seasonYear == null) {
      setRows([]);
      return;
    }

    (async () => {
      const year = Number(seasonYear);

      const [games, teamSeasonRows] = await Promise.all([
        db.games.where({ dynastyId, seasonYear: year }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear: year }).toArray(),
      ]);

      const nameByTgid = new Map(teamSeasonRows.map((t) => [t.tgid, `${t.tdna} ${t.tmna}`.trim()]));

      const sorted = games
        .slice()
        .sort((a, b) => a.week - b.week)
        .map((g) => {
          const homeName = nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`;
          const awayName = nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`;
          const result =
            g.homeScore != null && g.awayScore != null ? `${g.homeScore} - ${g.awayScore}` : "—";

          return { week: g.week, homeName, result, awayName };
        });

      setRows(sorted);
    })();
  }, [dynastyId, seasonYear]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);

  return (
    <div>
      <div className="hrow">
        <div>
          <h2>Schedule / Results</h2>
          {dynastyName ? <p className="kicker">Dynasty: {dynastyName}</p> : null}
        </div>

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
                <td>{r.homeName}</td>
                <td>{r.result}</td>
                <td>{r.awayName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
