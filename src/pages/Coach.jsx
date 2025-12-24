import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrCreateCoachQuote } from "../coachQuotes";
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
  const [coachStats, setCoachStats] = useState({
    careerWins: null,
    careerLosses: null,
    top25Wins: null,
    top25Losses: null,
    winningSeasons: null,
    conferenceTitles: null,
    nationalTitles: null,
  });
  const [contractStats, setContractStats] = useState({
    contractYear: null,
    contractLength: null,
    yearsWithTeam: null,
  });
  const [coachQuote, setCoachQuote] = useState("");

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
      setCoachStats({
        careerWins: null,
        careerLosses: null,
        top25Wins: null,
        top25Losses: null,
        winningSeasons: null,
        conferenceTitles: null,
        nationalTitles: null,
      });
      setContractStats({
        contractYear: null,
        contractLength: null,
        yearsWithTeam: null,
      });
      setCoachQuote("");
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
        setCoachStats({
          careerWins: null,
          careerLosses: null,
          top25Wins: null,
          top25Losses: null,
          winningSeasons: null,
          conferenceTitles: null,
          nationalTitles: null,
        });
        setContractStats({
          contractYear: null,
          contractLength: null,
          yearsWithTeam: null,
        });
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

      const winningSeasons = sorted.reduce((count, r) => {
        const w = Number(r.seasonWins);
        const l = Number(r.seasonLosses);
        if (Number.isFinite(w) && Number.isFinite(l) && w > l) return count + 1;
        return count;
      }, 0);

      const conferenceTitleSeasons = new Set();
      const nationalTitleSeasons = new Set();
      for (const [year, list] of postseasonByYear.entries()) {
        for (const p of list) {
          if (p.outcome !== "W") continue;
          const name = String(p.bowlName ?? "");
          if (/national championship/i.test(name)) nationalTitleSeasons.add(year);
          if (/championship$/i.test(name) && !/national championship/i.test(name)) {
            conferenceTitleSeasons.add(year);
          }
        }
      }

      setCoachStats({
        careerWins: Number.isFinite(Number(latest.careerWins)) ? Number(latest.careerWins) : null,
        careerLosses: Number.isFinite(Number(latest.careerLosses)) ? Number(latest.careerLosses) : null,
        top25Wins: null,
        top25Losses: null,
        winningSeasons,
        conferenceTitles: conferenceTitleSeasons.size,
        nationalTitles: nationalTitleSeasons.size,
      });

      const yearsWithTeam = sorted.reduce((count, r) => {
        if (String(r.tgid ?? "") === latestTgid) return count + 1;
        return count;
      }, 0);

      setContractStats({
        contractYear: Number.isFinite(Number(latest.contractYear)) ? Number(latest.contractYear) : null,
        contractLength: Number.isFinite(Number(latest.contractLength)) ? Number(latest.contractLength) : null,
        yearsWithTeam,
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

  useEffect(() => {
    if (!dynastyId || !coachId) {
      setCoachQuote("");
      return;
    }

    let alive = true;
    (async () => {
      const quote = await getOrCreateCoachQuote({ dynastyId, ccid: coachId });
      if (!alive) return;
      setCoachQuote(quote);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, coachId]);

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

      <h2 style={{ marginTop: 6, marginBottom: 6, textAlign: "center" }}>
        {header.name || `Coach ${coachId}`}
      </h2>

      <PrestigeStars value={header.prestige} />
      {coachQuote ? (
        <p
          className="kicker"
          style={{
            textAlign: "center",
            marginTop: 0,
            marginBottom: 16,
            fontSize: 16,
            fontStyle: "italic",
            opacity: 0.75,
          }}
        >
          "{coachQuote}"
        </p>
      ) : null}

      <div className="card" style={{ marginBottom: 18, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="kicker" style={{ fontWeight: 700 }}>
            Contract
          </div>
        </div>
        <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div>
            <div className="kicker">Contract Year</div>
            <div style={{ fontWeight: 700 }}>{contractStats.contractYear ?? "-"}</div>
          </div>
          <div>
            <div className="kicker">Length</div>
            <div style={{ fontWeight: 700 }}>{contractStats.contractLength ?? "-"}</div>
          </div>
          <div>
            <div className="kicker">Years with Team</div>
            <div style={{ fontWeight: 700 }}>{contractStats.yearsWithTeam ?? "-"}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="kicker" style={{ fontWeight: 700 }}>
            Career Summary
          </div>
        </div>
        <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div>
            <div className="kicker">Career Wins</div>
            <div style={{ fontWeight: 700 }}>{coachStats.careerWins ?? "-"}</div>
          </div>
          <div>
            <div className="kicker">Career Losses</div>
            <div style={{ fontWeight: 700 }}>{coachStats.careerLosses ?? "-"}</div>
          </div>
          <div>
            <div className="kicker">Top-25 Record</div>
            <div style={{ fontWeight: 700 }}>
              {coachStats.top25Wins ?? "-"}-{coachStats.top25Losses ?? "-"}
            </div>
          </div>
          <div>
            <div className="kicker">Winning Seasons</div>
            <div style={{ fontWeight: 700 }}>{coachStats.winningSeasons ?? "-"}</div>
          </div>
          <div>
            <div className="kicker">Conf Titles</div>
            <div style={{ fontWeight: 700 }}>{coachStats.conferenceTitles ?? "-"}</div>
          </div>
          <div>
            <div className="kicker">Nat Titles</div>
            <div style={{ fontWeight: 700 }}>{coachStats.nationalTitles ?? "-"}</div>
          </div>
        </div>
      </div>

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
              <td data-label="Year">{r.seasonYear}</td>
              <td data-label="Team">
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
              <td data-label="Record">{r.record}</td>
              <td data-label="Postseason">
                {r.postseason.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.postseason.map((p, idx) => (
                      <div key={`${r.seasonYear}-${idx}`} className="postseasonMeta">
                        {p.bowlLogoUrl ? (
                          <img src={p.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : null}
                        <span>{p.bowlName}</span>
                        {p.outcome ? (
                          <span
                            style={{
                              fontWeight: 800,
                              marginLeft: 8,
                              color: p.outcome === "W" ? "#4caf50" : p.outcome === "L" ? "#d30000" : "inherit",
                            }}
                          >
                            {p.outcome}
                          </span>
                        ) : null}
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
