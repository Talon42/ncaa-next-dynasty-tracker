import { useEffect, useMemo, useState } from "react";
import { db, ensureDefaultDynasty } from "../db";

export default function Home() {
  const [dynastyId, setDynastyId] = useState("default");
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("");
  const [rows, setRows] = useState([]);

  // Load seasons list
  useEffect(() => {
    (async () => {
      const d = await ensureDefaultDynasty();
      setDynastyId(d.id);

      const allGames = await db.games.where({ dynastyId: d.id }).toArray();
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);

      setAvailableSeasons(years);
      setSeasonYear(years[0] ?? "");
    })();
  }, []);

  // Load schedule rows for selected season
  useEffect(() => {
    if (!seasonYear) {
      setRows([]);
      return;
    }

    (async () => {
      const year = Number(seasonYear);

      const [games, teamSeasonRows] = await Promise.all([
        db.games.where({ dynastyId, seasonYear: year }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear: year }).toArray(),
      ]);

      const nameByTgid = new Map(
        teamSeasonRows.map((t) => [t.tgid, `${t.tdna} ${t.tmna}`.trim()])
      );

      const sorted = games
        .slice()
        .sort((a, b) => a.week - b.week)
        .map((g) => {
          const homeName = nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`;
          const awayName = nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`;
          const result =
            g.homeScore != null && g.awayScore != null ? `${g.homeScore} - ${g.awayScore}` : "—";

          return {
            weekDisplay: (g.week ?? 0) + 1,
            homeName,
            awayName,
            result,
          };
        });

      setRows(sorted);
    })();
  }, [dynastyId, seasonYear]);

  const hasSeasons = availableSeasons.length > 0;

  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Schedule / Results</h2>

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
        <p>
          No seasons uploaded yet. Go to <b>Import Season</b> and upload TEAM + SCHD.
        </p>
      ) : (
        <table border="1" cellPadding="6" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Week</th>
              <th>Home</th>
              <th>Result</th>
              <th>Away</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.weekDisplay}-${idx}`}>
                <td>{r.weekDisplay}</td>
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
