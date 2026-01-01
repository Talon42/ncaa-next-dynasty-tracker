import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { buildSeasonBowlNameMap, getSeasonBowlName } from "../postseasonMeta";

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

export default function CoachesPollRankings() {
  const [dynastyId, setDynastyId] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [rows, setRows] = useState([]);
  const [rankFilter, setRankFilter] = useState("Top 25");

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    if (!dynastyId) {
      setSeasonYear(null);
      setAvailableSeasons([]);
      setRows([]);
      return;
    }

    (async () => {
      const all = await db.teamSeasons.where({ dynastyId }).toArray();
      const years = Array.from(new Set(all.map((t) => Number(t.seasonYear)).filter(Number.isFinite))).sort(
        (a, b) => b - a
      );
      setAvailableSeasons(years);
      const latest = years[0] ?? null;
      setSeasonYear((cur) => (cur == null ? latest : cur));
    })();
  }, [dynastyId]);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) {
      setRows([]);
      return;
    }

    (async () => {
      const [teamSeasons, teamLogoRows, overrideRows, games, bowlRows] = await Promise.all([
        db.teamSeasons.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
        db.games.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
        db.bowlGames.where("[dynastyId+seasonYear]").equals([dynastyId, seasonYear]).toArray(),
      ]);

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));
      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      const recordByTgid = new Map();
      for (const g of games) {
        const hasScore = g.homeScore != null && g.awayScore != null;
        if (!hasScore) continue;
        const home = String(g.homeTgid);
        const away = String(g.awayTgid);
        const hs = Number(g.homeScore);
        const as = Number(g.awayScore);

        const bump = (tgid, win, loss, tie) => {
          const cur = recordByTgid.get(tgid) || { w: 0, l: 0, t: 0 };
          cur.w += win;
          cur.l += loss;
          cur.t += tie;
          recordByTgid.set(tgid, cur);
        };

        if (hs > as) {
          bump(home, 1, 0, 0);
          bump(away, 0, 1, 0);
        } else if (hs < as) {
          bump(home, 0, 1, 0);
          bump(away, 1, 0, 0);
        } else {
          bump(home, 0, 0, 1);
          bump(away, 0, 0, 1);
        }
      }

      const bowlByKey = buildSeasonBowlNameMap(bowlRows);
      const bowlByTgid = new Map();
      for (const g of games) {
        const bowlNameRaw = getSeasonBowlName(bowlByKey, Number(g.seasonYear), Number(g.week), g.sgnm);
        if (!bowlNameRaw) continue;
        const bowlName = /^nat championship$/i.test(bowlNameRaw)
          ? "CFP - National Championship"
          : bowlNameRaw;
        const hasScore = g.homeScore != null && g.awayScore != null;
        const hs = Number(g.homeScore);
        const as = Number(g.awayScore);
        const resultFor = (isHome) => {
          if (!hasScore) return "-";
          if (hs > as) return isHome ? "W" : "L";
          if (hs < as) return isHome ? "L" : "W";
          return "T";
        };

        const home = String(g.homeTgid);
        const away = String(g.awayTgid);
        const homeExisting = bowlByTgid.get(home);
        const awayExisting = bowlByTgid.get(away);
        const week = Number(g.week);

        if (!homeExisting || week >= homeExisting.week) {
          bowlByTgid.set(home, { bowlName, result: resultFor(true), week });
        }
        if (!awayExisting || week >= awayExisting.week) {
          bowlByTgid.set(away, { bowlName, result: resultFor(false), week });
        }
      }

      const mapped = teamSeasons.map((t) => {
        const rank = Number(t.tcrk);
        const record = recordByTgid.get(String(t.tgid)) || { w: 0, l: 0, t: 0 };
        const recordText = record.t > 0 ? `${record.w}-${record.l}-${record.t}` : `${record.w}-${record.l}`;
        const bowl = bowlByTgid.get(String(t.tgid)) || null;
        return {
          tgid: String(t.tgid),
          name: `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim() || `TGID ${t.tgid}`,
          rank: Number.isFinite(rank) && rank > 0 ? rank : null,
          logoUrl: logoFor(t.tgid),
          recordText,
          bowlName: bowl?.bowlName || "",
          bowlResult: bowl?.result || "",
        };
      });

      setRows(mapped);
    })();
  }, [dynastyId, seasonYear]);

  const sortedRows = useMemo(() => {
    const list = rows.filter((r) => {
      if (rankFilter === "Top 25") {
        return Number.isFinite(r.rank) && r.rank <= 25;
      }
      return true;
    });
    list.sort((a, b) => {
      const ar = Number.isFinite(a.rank) ? a.rank : Infinity;
      const br = Number.isFinite(b.rank) ? b.rank : Infinity;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [rows, rankFilter]);

  if (!dynastyId) {
    return (
      <div>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  if (!seasonYear) {
    return (
      <div>
        <p className="kicker">No seasons uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className="pollRankingsPage">
      <div className="hrow" style={{ alignItems: "baseline" }}>
        <h2>Coaches Poll Rankings</h2>
      </div>
      <div className="playerStatsControlRow">
        <div className="playerStatsFilters">
          <select
            value={seasonYear ?? ""}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            disabled={!availableSeasons.length}
            aria-label="Season"
          >
            {availableSeasons.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)} aria-label="Rank">
            <option value="All">All</option>
            <option value="Top 25">Top 25</option>
          </select>
        </div>
      </div>

      {!sortedRows.length ? (
        <p className="kicker">No teams found for this season.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Rank</th>
              <th>Team</th>
              <th style={{ width: 120 }}>Record</th>
              <th>Bowl</th>
              <th style={{ width: 110 }}>Bowl Result</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              return (
                <tr key={`${r.tgid}-${r.name}`}>
                  <td data-label="Rank">
                    {r.rank ?? "-"}
                  </td>
                  <td data-label="Team">
                    <Link to={`/team/${r.tgid}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <TeamCell name={r.name} logoUrl={r.logoUrl} />
                    </Link>
                  </td>
                  <td data-label="W/L">{r.recordText}</td>
                  <td data-label="Bowl">{r.bowlName || "-"}</td>
                  <td data-label="Bowl W/L">{r.bowlResult || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
