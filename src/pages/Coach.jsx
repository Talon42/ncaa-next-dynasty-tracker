import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { loadPostseasonLogoMap } from "../logoService";
import {
  buildSeasonBowlNameMap,
  createPostseasonLogoResolver,
  getSeasonBowlName,
} from "../postseasonMeta";

const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

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

export default function Coach() {
  const { ccid } = useParams();
  const coachId = String(ccid ?? "");

  const [dynastyId, setDynastyId] = useState(null);
  const [postseasonLogoMap, setPostseasonLogoMap] = useState(new Map());
  const [header, setHeader] = useState({
    name: "",
    teamName: "",
    teamLogo: FALLBACK_LOGO,
    prestige: null,
  });
  const [seasonRows, setSeasonRows] = useState([]);

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

  useEffect(() => {
    if (!dynastyId || !coachId) {
      setHeader({ name: "", teamName: "", teamLogo: FALLBACK_LOGO, prestige: null });
      setSeasonRows([]);
      return;
    }

    (async () => {
      const coachRows = await db.coaches.where("ccid").equals(coachId).and((r) => r.dynastyId === dynastyId).toArray();
      const sorted = coachRows
        .slice()
        .sort((a, b) => Number(b.seasonYear) - Number(a.seasonYear));

      if (!sorted.length) {
        setHeader({ name: "", teamName: "", teamLogo: FALLBACK_LOGO, prestige: null });
        setSeasonRows([]);
        return;
      }

      const [teamSeasons, teamLogoRows, overrideRows, bowlRows, games] = await Promise.all([
        db.teamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
        db.bowlGames.where({ dynastyId }).toArray(),
        db.games.where({ dynastyId }).toArray(),
      ]);

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));
      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      const teamNameBySeasonTgid = new Map(
        teamSeasons.map((t) => {
          const name = `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
          return [`${t.seasonYear}|${t.tgid}`, name || `TGID ${t.tgid}`];
        })
      );

      const bowlByKey = buildSeasonBowlNameMap(bowlRows);
      const bowlNameFor = (seasonYearValue, sewnValue, sgnmValue) =>
        getSeasonBowlName(bowlByKey, seasonYearValue, sewnValue, sgnmValue);
      const postseasonLogoFor = createPostseasonLogoResolver(postseasonLogoMap);

      const seasonTgidByYear = new Map(
        sorted.map((r) => [Number(r.seasonYear), String(r.tgid)])
      );

      const postseasonByYear = new Map();
      for (const g of games) {
        const seasonYear = Number(g.seasonYear);
        const coachTgid = seasonTgidByYear.get(seasonYear);
        if (!coachTgid) continue;

        const isHome = String(g.homeTgid);
        const isAway = String(g.awayTgid);
        if (coachTgid !== isHome && coachTgid !== isAway) continue;

        const bowlNameRaw = bowlNameFor(seasonYear, Number(g.week), g.sgnm);
        if (!bowlNameRaw) continue;
        const bowlName = /^nat championship$/i.test(bowlNameRaw)
          ? "CFP - National Championship"
          : bowlNameRaw;
        const bowlLogoUrl = bowlName ? postseasonLogoFor(bowlName) : "";

        const hasScore = g.homeScore != null && g.awayScore != null;
        let outcome = "";
        if (hasScore) {
          const teamScore = coachTgid === isHome ? g.homeScore : g.awayScore;
          const oppScore = coachTgid === isHome ? g.awayScore : g.homeScore;
          if (teamScore > oppScore) outcome = "W";
          else if (teamScore < oppScore) outcome = "L";
        }

        const list = postseasonByYear.get(seasonYear) || [];
        list.push({ bowlName, bowlLogoUrl, outcome, week: Number(g.week) });
        postseasonByYear.set(seasonYear, list);
      }

      const latest = sorted[0];
      const latestTgid = String(latest.tgid ?? "");
      const latestTeamName =
        teamNameBySeasonTgid.get(`${latest.seasonYear}|${latest.tgid}`) || `TGID ${latestTgid}`;

      setHeader({
        name: `${String(latest.firstName ?? "").trim()} ${String(latest.lastName ?? "").trim()}`.trim(),
        teamName: latestTeamName,
        teamLogo: logoFor(latestTgid),
        prestige: latest.hcPrestige,
      });

      const rows = sorted.map((r) => {
        const tgid = String(r.tgid ?? "");
        const seasonKey = `${r.seasonYear}|${tgid}`;
        const teamName = teamNameBySeasonTgid.get(seasonKey) || `TGID ${tgid}`;
        const recordParts = [
          Number.isFinite(Number(r.seasonWins)) ? Number(r.seasonWins) : "-",
          Number.isFinite(Number(r.seasonLosses)) ? Number(r.seasonLosses) : "-",
        ];
        const postseason =
          postseasonByYear.get(Number(r.seasonYear))?.slice().sort((a, b) => a.week - b.week) || [];

        return {
          seasonYear: r.seasonYear,
          tgid,
          teamName,
          teamLogo: logoFor(tgid),
          record: `(${recordParts[0]}-${recordParts[1]})`,
          postseason: postseason.map(({ bowlName, bowlLogoUrl, outcome }) => ({
            bowlName,
            bowlLogoUrl,
            outcome,
          })),
        };
      });

      setSeasonRows(rows);
    })();
  }, [dynastyId, coachId, postseasonLogoMap]);

  if (!dynastyId) {
    return (
      <div>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  if (!seasonRows.length) {
    return (
      <div>
        <p className="kicker">No coach data found for this dynasty.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <img
          src={header.teamLogo}
          alt={header.teamName}
          style={{ width: 180, height: 180, objectFit: "contain" }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = FALLBACK_LOGO;
          }}
        />
      </div>

      <h2 style={{ marginTop: 0, marginBottom: 6, textAlign: "center" }}>
        {header.name || `Coach ${coachId}`}
      </h2>

      <PrestigeStars value={header.prestige} />

      <div className="hrow" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/coaches" className="kicker" style={{ display: "inline-block", marginBottom: 10 }}>
            Back to Coaches
          </Link>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 100 }}>Year</th>
            <th>Team</th>
            <th style={{ width: 120 }}>Record</th>
            <th>Postseason</th>
          </tr>
        </thead>
        <tbody>
          {seasonRows.map((r) => (
            <tr key={`${r.seasonYear}-${r.teamName}`}>
              <td>{r.seasonYear}</td>
              <td>
                <Link
                  to={`/team/${r.tgid}?season=${encodeURIComponent(String(r.seasonYear))}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div className="teamCell">
                    <img
                      className="teamLogo"
                      src={r.teamLogo}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        if (e.currentTarget.src !== FALLBACK_LOGO) e.currentTarget.src = FALLBACK_LOGO;
                      }}
                    />
                    <span>{r.teamName}</span>
                  </div>
                </Link>
              </td>
              <td>{r.record}</td>
              <td>
                {r.postseason.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.postseason.map((p, idx) => (
                      <div key={`${r.seasonYear}-${idx}`} className="postseasonMeta">
                        {p.bowlLogoUrl ? (
                          <img src={p.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : null}
                        <span>{p.bowlName}</span>
                        {p.outcome ? <span style={{ fontWeight: 800, marginLeft: 8 }}>{p.outcome}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="kicker">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
