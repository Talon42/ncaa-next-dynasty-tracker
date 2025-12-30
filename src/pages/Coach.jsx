import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrCreateCoachQuote } from "../coachQuotes";
import { db, getActiveDynastyId } from "../db";
import { loadPostseasonLogoMap } from "../logoService";
import { buildTeamSeasonWinLossMap, computeCoachCareerRecord } from "../coachRecords";
import {
  buildSeasonBowlNameMap,
  createPostseasonLogoResolver,
  getSeasonBowlName,
} from "../postseasonMeta";

const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

const PLAYBOOK_LABELS = {
  136: "Ace",
  137: "Air Raid",
  138: "Balanced Pass",
  139: "Balanced Run",
  140: "Classic Option",
  141: "Flexbone",
  142: "Flexible Shoot",
  143: "I Option",
  144: "Multi Option",
  145: "Multiple",
  146: "One Back",
  147: "Pass Heavy",
  148: "Pro",
  149: "Pro Dawg",
  150: "Run 'N' Gun",
  151: "Run 'N' Shoot",
  152: "Spread",
  153: "Spread Ace",
  154: "Spread I",
  155: "Spread Option",
  156: "Spread Pro",
  157: "Veer 'N' Shoot",
  158: "West Coast",
  159: "Pistol",
  160: "Pistol Option",
  161: "GoGo Offense",
  162: "SpreadBone",
};

const BASE_DEFENSE_LABELS = {
  0: "3-4",
  1: "3-3-5 Stack",
  2: "4-2-5",
  3: "4-3",
  4: "4-4",
};

const OFFENSE_TYPE_LABELS = {
  0: "Option Run",
  1: "Spread",
  2: "Balanced",
  3: "Flexbone",
  4: "West Coast",
};

const COACH_AGE_OFFSET = 23;

function resolveCoachLabel(map, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return map[n] || `Unknown (${n})`;
}

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
        fontSize: "2rem",
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

function approvalLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { text: "-", color: "inherit" };
  if (n <= 5) return { text: "Danger", color: "#c53b3b" };
  if (n <= 25) return { text: "Hot Seat", color: "#d77b2f" };
  if (n <= 49) return { text: "Warm", color: "#d8a118" };
  return { text: "Secure", color: "#2f9b4f" };
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
  const [trophyWins, setTrophyWins] = useState([]);
  const [tendencyScale, setTendencyScale] = useState({ offMax: 80, defMax: 80 });
  const [coachStats, setCoachStats] = useState({
    coachAge: null,
    careerWins: null,
    careerLosses: null,
    postseasonWins: null,
    postseasonLosses: null,
    runPassTendency: null,
    defenseRunPassTendency: null,
    playbookId: null,
    baseDefenseId: null,
    offenseTypeId: null,
    top25Wins: null,
    top25Losses: null,
    winningSeasons: null,
    conferenceTitles: null,
    nationalTitles: null,
  });
  const [coachApproval, setCoachApproval] = useState(null);
  const [teamStats, setTeamStats] = useState({
    yearsWithTeam: null,
    teamWins: null,
    teamLosses: null,
    postseasonWins: null,
    postseasonLosses: null,
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
      setTrophyWins([]);
      setTendencyScale({ offMax: 80, defMax: 80 });
      setCoachStats({
        coachAge: null,
        careerWins: null,
        careerLosses: null,
        postseasonWins: null,
        postseasonLosses: null,
        runPassTendency: null,
        defenseRunPassTendency: null,
        top25Wins: null,
        top25Losses: null,
        winningSeasons: null,
        conferenceTitles: null,
        nationalTitles: null,
      });
      setCoachApproval(null);
      setTeamStats({
        yearsWithTeam: null,
        teamWins: null,
        teamLosses: null,
        postseasonWins: null,
        postseasonLosses: null,
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
        setTrophyWins([]);
        setTendencyScale({ offMax: 80, defMax: 80 });
        setCoachStats({
          coachAge: null,
          careerWins: null,
          careerLosses: null,
          postseasonWins: null,
          postseasonLosses: null,
          runPassTendency: null,
          defenseRunPassTendency: null,
          top25Wins: null,
          top25Losses: null,
          winningSeasons: null,
          conferenceTitles: null,
        nationalTitles: null,
      });
      setCoachApproval(null);
      setTeamStats({
        yearsWithTeam: null,
        teamWins: null,
        teamLosses: null,
          postseasonWins: null,
          postseasonLosses: null,
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

      const teamSeasonWinLossByKey = buildTeamSeasonWinLossMap(games);
      const baseRow = await db.coachCareerBases.get([dynastyId, coachId]);
      const fallbackBaseSeasonYear = await (async () => {
        const anyBase = await db.coachCareerBases.where({ dynastyId }).first();
        const yrFromBase = Number(anyBase?.baseSeasonYear);
        if (Number.isFinite(yrFromBase)) return yrFromBase;

        const all = await db.coaches.where({ dynastyId }).toArray();
        const years = all.map((r) => Number(r.seasonYear)).filter((n) => Number.isFinite(n));
        return years.length
          ? Math.min(...years)
          : Number(sorted[sorted.length - 1]?.seasonYear ?? seasonYear);
      })();

      const dynastyLatestYear = (() => {
        const years = teamSeasons.map((r) => Number(r.seasonYear)).filter((n) => Number.isFinite(n));
        return years.length ? Math.max(...years) : null;
      })();
      if (dynastyLatestYear != null) {
        const latestSeasonCoachRows = await db.coaches
          .where("[dynastyId+seasonYear]")
          .equals([dynastyId, dynastyLatestYear])
          .toArray();

        const eligible = latestSeasonCoachRows.filter((r) => String(r.tgid ?? "") !== "511");

        const clamp2080 = (n) => Math.min(80, Math.max(20, n));
        const offMaxRaw = Math.max(
          20,
          ...eligible
            .map((r) => Number(r.runPassTendency))
            .filter((n) => Number.isFinite(n))
            .map(clamp2080)
        );
        const defMaxRaw = Math.max(
          20,
          ...eligible
            .map((r) => Number(r.defenseRunPassTendency))
            .filter((n) => Number.isFinite(n))
            .map(clamp2080)
        );

        setTendencyScale({
          offMax: Number.isFinite(offMaxRaw) ? offMaxRaw : 80,
          defMax: Number.isFinite(defMaxRaw) ? defMaxRaw : 80,
        });
      } else {
        setTendencyScale({ offMax: 80, defMax: 80 });
      }

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
      const teamRankBySeasonTgid = new Map(
        teamSeasons.map((t) => [`${t.seasonYear}|${t.tgid}`, Number(t.tcrk)])
      );
      const confBySeasonTgid = new Map(
        teamSeasons.map((t) => [`${t.seasonYear}|${t.tgid}`, String(t.cgid ?? "")])
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
        const isNationalChampionship = /national championship/i.test(bowlName);
        const bowlLogoUrl = bowlName
          ? postseasonLogoFor(/national championship/i.test(bowlName) ? "Nat Trophy" : bowlName)
          : "";

        const hasScore = g.homeScore != null && g.awayScore != null;
        let outcome = "";
        if (hasScore) {
          const teamScore = coachTgid === isHome ? g.homeScore : g.awayScore;
          const oppScore = coachTgid === isHome ? g.awayScore : g.homeScore;
          if (teamScore > oppScore) outcome = "W";
          else if (teamScore < oppScore) outcome = "L";
        }

        const list = postseasonByYear.get(seasonYear) || [];
        list.push({ bowlName, bowlLogoUrl, outcome, week: Number(g.week), isNationalChampionship });
        postseasonByYear.set(seasonYear, list);
      }

      const wins = [];
      for (const [seasonYear, list] of postseasonByYear.entries()) {
        for (const p of list) {
          if (p.outcome !== "W") continue;
          wins.push({
            seasonYear,
            week: Number(p.week),
            bowlName: p.bowlName,
            bowlLogoUrl: p.bowlLogoUrl,
            isNationalChampionship: Boolean(p.isNationalChampionship),
          });
        }
      }
      wins.sort((a, b) => {
        const yd = Number(a.seasonYear) - Number(b.seasonYear);
        if (yd !== 0) return yd;
        return Number(a.week) - Number(b.week);
      });
      setTrophyWins(wins);

      const confRecordByKey = new Map();
      for (const g of games) {
        const seasonYear = Number(g.seasonYear);
        const homeKey = `${seasonYear}|${g.homeTgid}`;
        const awayKey = `${seasonYear}|${g.awayTgid}`;
        const homeConf = confBySeasonTgid.get(homeKey) || "";
        const awayConf = confBySeasonTgid.get(awayKey) || "";
        if (!homeConf || homeConf !== awayConf) continue;

        const hs = g.homeScore;
        const as = g.awayScore;
        if (hs == null || as == null) continue;

        const homeRec = confRecordByKey.get(homeKey) || { w: 0, l: 0, t: 0 };
        const awayRec = confRecordByKey.get(awayKey) || { w: 0, l: 0, t: 0 };

        if (Number(hs) > Number(as)) {
          homeRec.w += 1;
          awayRec.l += 1;
        } else if (Number(hs) < Number(as)) {
          homeRec.l += 1;
          awayRec.w += 1;
        } else {
          homeRec.t += 1;
          awayRec.t += 1;
        }

        confRecordByKey.set(homeKey, homeRec);
        confRecordByKey.set(awayKey, awayRec);
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

      const career = computeCoachCareerRecord({
        coachSeasons: sorted.map((r) => ({ seasonYear: r.seasonYear, tgid: String(r.tgid ?? "") })),
        teamSeasonWinLossByKey,
        baseSeasonYear: baseRow?.baseSeasonYear ?? fallbackBaseSeasonYear,
        baseWins: baseRow?.baseWins ?? 0,
        baseLosses: baseRow?.baseLosses ?? 0,
        asOfSeasonYear: latest.seasonYear,
      });

      const latestWinningSeasons = Number.isFinite(Number(latest.winningSeasons))
        ? Number(latest.winningSeasons)
        : null;
      const latestTop25Wins = Number.isFinite(Number(latest.top25Wins)) ? Number(latest.top25Wins) : null;
      const latestTop25Losses = Number.isFinite(Number(latest.top25Losses)) ? Number(latest.top25Losses) : null;
      const latestRunPassTendency = Number.isFinite(Number(latest.runPassTendency))
        ? Number(latest.runPassTendency)
        : null;
      const latestCycd = Number.isFinite(Number(latest.cycd)) ? Number(latest.cycd) : null;
      const latestDefenseRunPassTendency = Number.isFinite(Number(latest.defenseRunPassTendency))
        ? Number(latest.defenseRunPassTendency)
        : null;
      const latestPlaybookId = Number.isFinite(Number(latest.playbookId))
        ? Number(latest.playbookId)
        : null;
      const latestBaseDefenseId = Number.isFinite(Number(latest.baseDefenseId))
        ? Number(latest.baseDefenseId)
        : null;
      const latestOffenseTypeId = Number.isFinite(Number(latest.offenseTypeId))
        ? Number(latest.offenseTypeId)
        : null;

      const latestPostseasonWins = Number.isFinite(Number(latest.bowlWins))
        ? Number(latest.bowlWins)
        : null;
      const latestPostseasonLosses = Number.isFinite(Number(latest.bowlLosses))
        ? Number(latest.bowlLosses)
        : null;
      const latestApproval = Number.isFinite(Number(latest.approval))
        ? Number(latest.approval)
        : null;

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
      const latestConferenceTitles = Number.isFinite(Number(latest.conferenceTitles))
        ? Number(latest.conferenceTitles)
        : null;
      const latestNationalTitles = Number.isFinite(Number(latest.nationalTitles))
        ? Number(latest.nationalTitles)
        : null;

      const coachAge = Number.isFinite(latestCycd)
        ? Math.trunc(latestCycd + COACH_AGE_OFFSET)
        : null;

      setCoachStats({
        coachAge,
        careerWins: Number.isFinite(Number(career.wins)) ? Number(career.wins) : null,
        careerLosses: Number.isFinite(Number(career.losses)) ? Number(career.losses) : null,
        postseasonWins: latestPostseasonWins,
        postseasonLosses: latestPostseasonLosses,
        runPassTendency: latestRunPassTendency,
        defenseRunPassTendency: latestDefenseRunPassTendency,
        playbookId: latestPlaybookId,
        baseDefenseId: latestBaseDefenseId,
        offenseTypeId: latestOffenseTypeId,
        top25Wins: latestTop25Wins,
        top25Losses: latestTop25Losses,
        winningSeasons: latestWinningSeasons,
        conferenceTitles: latestConferenceTitles,
        nationalTitles: latestNationalTitles,
      });
      setCoachApproval(latestApproval);

      const yearsWithTeam = sorted.reduce((count, r) => {
        if (String(r.tgid ?? "") === latestTgid) return count + 1;
        return count;
      }, 0);

      let teamWins = 0;
      let teamLosses = 0;
      for (const r of sorted) {
        if (String(r.tgid ?? "") !== latestTgid) continue;
        if (latestTgid === "511") continue;
        const yr = Number(r.seasonYear);
        if (!Number.isFinite(yr)) continue;
        const rec = teamSeasonWinLossByKey.get(`${yr}|${latestTgid}`) || null;
        if (!rec) continue;
        teamWins += Number(rec.w) || 0;
        teamLosses += Number(rec.l) || 0;
      }

      let teamPostseasonWins = 0;
      let teamPostseasonLosses = 0;
      for (const [yr, list] of postseasonByYear.entries()) {
        if (String(seasonTgidByYear.get(Number(yr)) ?? "") !== latestTgid) continue;
        for (const item of list) {
          if (item.outcome === "W") teamPostseasonWins += 1;
          if (item.outcome === "L") teamPostseasonLosses += 1;
        }
      }

      const hasTeamRecord = latestTgid !== "511" && (teamWins > 0 || teamLosses > 0);
      const hasTeamPostseasonRecord =
        latestTgid !== "511" && (teamPostseasonWins > 0 || teamPostseasonLosses > 0);

      setTeamStats({
        yearsWithTeam,
        teamWins: hasTeamRecord ? teamWins : null,
        teamLosses: hasTeamRecord ? teamLosses : null,
        postseasonWins: hasTeamPostseasonRecord ? teamPostseasonWins : null,
        postseasonLosses: hasTeamPostseasonRecord ? teamPostseasonLosses : null,
      });

      const rows = sorted.filter((r) => String(r.tgid ?? "") !== "511").map((r) => {
        const tgid = String(r.tgid ?? "");
        const seasonKey = `${r.seasonYear}|${tgid}`;
        const teamName = teamNameBySeasonTgid.get(seasonKey) || `TGID ${tgid}`;
        const wl = tgid && tgid !== "511" ? teamSeasonWinLossByKey.get(seasonKey) || { w: 0, l: 0 } : { w: 0, l: 0 };
        const confRec = confRecordByKey.get(seasonKey) || null;
        const confRecordText = confRec
          ? `${confRec.w}-${confRec.l}${confRec.t ? `-${confRec.t}` : ""}`
          : "-";
        const postseason =
          postseasonByYear.get(Number(r.seasonYear))?.slice().sort((a, b) => a.week - b.week) || [];

        return {
          seasonYear: r.seasonYear,
          tgid,
          teamName,
          teamLogo: logoFor(tgid),
          record: `${wl.w}-${wl.l}`,
          confRecord: confRecordText,
          top25Rank: (() => {
            const raw = teamRankBySeasonTgid.get(seasonKey);
            const rank = Number(raw);
            return Number.isFinite(rank) && rank > 0 && rank <= 25 ? rank : null;
          })(),
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

      <h2
        style={{
          marginTop: 6,
          marginBottom: 6,
          textAlign: "center",
        }}
      >
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
            fontStyle: "italic",
            opacity: 0.75,
          }}
        >
          {coachQuote}
        </p>
      ) : null}
      <div style={{ marginBottom: 18, textAlign: "center" }}>
        {(() => {
          const meta = approvalLabel(coachApproval);
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--muted)" }}>
                Job Security:
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.05)",
                  color: meta.color,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: 0.2,
                }}
              >
                {meta.text}
              </span>
            </span>
          );
        })()}
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "stretch",
          maxWidth: 1320,
          marginLeft: "auto",
          marginRight: "auto",
          marginBottom: 18,
        }}
      >
        <div className="card" style={{ marginBottom: 0, flex: "1 1 360px", maxWidth: 560 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="kicker infoCardTitle">
              Career Summary
            </div>
            <div className="kicker infoCardTitle" style={{ textAlign: "right" }}>
              Coach Age: {coachStats.coachAge ?? "-"}
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gridTemplateRows: "repeat(2, minmax(0, 1fr))",
              rowGap: 24,
              columnGap: 12,
              placeItems: "center",
              alignContent: "space-between",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Career Record</div>
              <div className="infoCardValue">
                {coachStats.careerWins ?? "-"}-{coachStats.careerLosses ?? "-"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Postseason Record</div>
              <div className="infoCardValue">
                {coachStats.postseasonWins ?? "-"}-{coachStats.postseasonLosses ?? "-"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Top-25 Record</div>
              <div className="infoCardValue">
                {coachStats.top25Wins ?? "-"}-{coachStats.top25Losses ?? "-"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Winning Seasons</div>
              <div className="infoCardValue">{coachStats.winningSeasons ?? "-"}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Conf Titles</div>
              <div className="infoCardValue">{coachStats.conferenceTitles ?? "-"}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Nat Titles</div>
              <div className="infoCardValue">{coachStats.nationalTitles ?? "-"}</div>
            </div>
          </div>
          <div style={{ height: 16 }} />
          <div className="kicker infoCardTitle" style={{ marginBottom: 10 }}>
            Team
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Years with Team</div>
              <div className="infoCardValue">{teamStats.yearsWithTeam ?? "-"}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Record</div>
              <div className="infoCardValue">
                {teamStats.teamWins ?? "-"}-{teamStats.teamLosses ?? "-"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="kicker infoCardTitle">Postseason Record</div>
              <div className="infoCardValue">
                {teamStats.postseasonWins ?? "-"}-{teamStats.postseasonLosses ?? "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, flex: "1 1 240px", maxWidth: 420 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="kicker infoCardTitle">
              Trophy Room
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />

          {!trophyWins.length ? (
            <p className="kicker infoCardValue" style={{ margin: 0 }}>
              No postseason wins yet.
            </p>
          ) : (
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: 2, paddingRight: 2 }}>
                {(() => {
                  const order = [];
                  const byKey = new Map();

                  for (const t of trophyWins) {
                    const key = t.bowlLogoUrl || t.bowlName || "W";
                    if (!byKey.has(key)) {
                      byKey.set(key, []);
                      order.push(key);
                    }
                    byKey.get(key).push(t);
                  }

                  const size = 42;
                  const renderBadge = ({ key, title, logoUrl, isNationalChampionship, style }) => {
                    const champBorder = "rgba(216,180,90,0.95)";
                    return (
                    <div
                      key={key}
                      title={title}
                      style={{
                        width: size,
                        height: size,
                        borderRadius: 999,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        background: isNationalChampionship
                          ? "linear-gradient(135deg, rgba(216,180,90,0.24), rgba(255,255,255,0.06))"
                          : "rgba(255,255,255,0.06)",
                        border: isNationalChampionship ? `1px solid ${champBorder}` : "1px solid var(--border)",
                        boxShadow: isNationalChampionship
                          ? "0 0 0 1px rgba(216,180,90,0.55), 0 2px 10px rgba(216,180,90,0.25), 0 2px 8px rgba(0,0,0,0.25)"
                          : "0 2px 8px rgba(0,0,0,0.25)",
                        flex: "0 0 auto",
                        ...style,
                      }}
                    >

                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }}
                        />
                      ) : (
                        <span style={{ fontWeight: "var(--app-font-weight)", letterSpacing: 0.5 }}>W</span>
                      )}
                    </div>
                  );
                  };

                  const nodes = [];

                  for (const groupKey of order) {
                    const list = byKey.get(groupKey) || [];
                    if (list.length <= 3) {
                      list.forEach((t, idx) => {
                        const label = `${t.seasonYear} - ${t.bowlName || "Postseason Win"}`;
                        nodes.push(
                          renderBadge({
                            key: `${groupKey}-${t.seasonYear}-${t.week}-${idx}`,
                            title: label,
                            logoUrl: t.bowlLogoUrl,
                            isNationalChampionship: Boolean(t.isNationalChampionship),
                          })
                        );
                      });
                      continue;
                    }

                    const first = list[0];
                    const isNationalChampionship = list.some((t) => t.isNationalChampionship);
                    const seasonLabels = Array.from(
                      new Set(
                        list
                          .map((t) => Number(t.seasonYear))
                          .filter((y) => Number.isFinite(y))
                      )
                    ).sort((a, b) => a - b);
                    const seasonText = seasonLabels.length ? ` - ${seasonLabels.join(", ")}` : "";
                    const title = `${first.bowlName || "Postseason Win"} (x${list.length})${seasonText}`;
                    const offset = 12;

                    nodes.push(
                      <div
                        key={`${groupKey}-stack`}
                        title={title}
                        style={{
                          position: "relative",
                          width: size + offset * 2,
                          height: size,
                          flex: "0 0 auto",
                        }}
                      >
                        {renderBadge({
                          key: `${groupKey}-stack-1`,
                          title,
                          logoUrl: first.bowlLogoUrl,
                          isNationalChampionship,
                          style: {
                            position: "absolute",
                            left: 0,
                            top: 0,
                            opacity: 0.65,
                          },
                        })}
                        {renderBadge({
                          key: `${groupKey}-stack-2`,
                          title,
                          logoUrl: first.bowlLogoUrl,
                          isNationalChampionship,
                          style: {
                            position: "absolute",
                            left: offset,
                            top: 0,
                            opacity: 0.85,
                          },
                        })}
                        {renderBadge({
                          key: `${groupKey}-stack-3`,
                          title,
                          logoUrl: first.bowlLogoUrl,
                          isNationalChampionship,
                          style: {
                            position: "absolute",
                            left: offset * 2,
                            top: 0,
                          },
                        })}
                        <div
                          style={{
                            position: "absolute",
                            right: -6,
                            top: -6,
                            padding: "2px 6px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: "var(--app-font-weight)",
                            background: "rgba(0,0,0,0.75)",
                            color: "white",
                            border: "1px solid rgba(255,255,255,0.2)",
                          }}
                          aria-hidden="true"
                        >
                          x{list.length}
                        </div>
                      </div>
                    );
                  }

                  return nodes;
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 0, flex: "1 1 280px", maxWidth: 420 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="kicker infoCardTitle">
              Run/Pass Tendency
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />

          {(() => {
            const markerLeft = (value) => {
              if (!Number.isFinite(value)) return "50%";
              if (value <= 2) return `calc(${value}% + 10px)`;
              if (value >= 98) return `calc(${value}% - 10px)`;
              return `${value}%`;
            };
            const raw = Number(coachStats.runPassTendency);
            const has = Number.isFinite(raw);
            const scaleMax = Number.isFinite(Number(tendencyScale.offMax)) ? Number(tendencyScale.offMax) : 80;
            const min = 20;
            const max = Math.max(min, Math.min(80, scaleMax));
            const clamped = has ? Math.min(max, Math.max(min, raw)) : 50;
            const pct = has && max > min ? ((clamped - min) / (max - min)) * 100 : 50;
            const markerLeftPct = markerLeft(pct);

            return (
              <div>
                <div className="kicker infoCardTitle" style={{ marginBottom: 6 }}>
                  Offense
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="kicker infoCardTitle infoCardLabelStrong">Run</span>
                  <span className="kicker infoCardTitle infoCardLabelStrong">Pass</span>
                </div>

                <div
                  style={{
                    position: "relative",
                    height: 16,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "linear-gradient(90deg, #7b4a1d 0%, #2c6bed 100%)",
                    outline: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: markerLeftPct,
                      top: "50%",
                      width: 18,
                      height: 14,
                      transform: "translate(-50%, -50%)",
                      filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
                      zIndex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 28 20" width="100%" height="100%" aria-hidden="true">
                      <path
                        d="M2 10c0-4.6 4.6-8.4 10.2-8.4h3.6C21.4 1.6 26 5.4 26 10s-4.6 8.4-10.2 8.4h-3.6C6.6 18.4 2 14.6 2 10z"
                        fill="#b86e22"
                        stroke="rgba(0,0,0,0.5)"
                        strokeWidth="1.6"
                      />
                      <path
                        d="M6.2 7.2c0 2.2 1.8 4 4 4"
                        fill="none"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M21.8 7.2c0 2.2-1.8 4-4 4"
                        fill="none"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                      <path d="M11.5 6.1h5" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
                      <path d="M11.8 8.2h4.4" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" />
                      <path d="M11.8 11.8h4.4" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" />
                    </svg>
                  </div>
                </div>

                <div style={{ height: 12 }} />

                {(() => {
                  const rawDef = Number(coachStats.defenseRunPassTendency);
                  const hasDef = Number.isFinite(rawDef);
                  const scaleMaxDef = Number.isFinite(Number(tendencyScale.defMax))
                    ? Number(tendencyScale.defMax)
                    : 80;
                  const minDef = 20;
                  const maxDef = Math.max(minDef, Math.min(80, scaleMaxDef));
                  const clampedDef = hasDef ? Math.min(maxDef, Math.max(minDef, rawDef)) : 50;
                  const pctDef = hasDef && maxDef > minDef ? ((clampedDef - minDef) / (maxDef - minDef)) * 100 : 50;
                  const markerLeftDefPct = markerLeft(pctDef);

                  return (
                    <div>
                      <div className="kicker infoCardTitle" style={{ marginBottom: 6 }}>
                        Defense
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span className="kicker infoCardTitle infoCardLabelStrong">Man</span>
                        <span className="kicker infoCardTitle infoCardLabelStrong">Zone</span>
                      </div>

                      <div
                        style={{
                          position: "relative",
                          height: 16,
                          borderRadius: 999,
                          overflow: "hidden",
                          background: "linear-gradient(90deg, #7b4a1d 0%, #2c6bed 100%)",
                          outline: "1px solid var(--border)",
                        }}
                      >
                      <div
                        style={{
                          position: "absolute",
                          left: markerLeftDefPct,
                          top: "50%",
                          width: 18,
                          height: 14,
                          transform: "translate(-50%, -50%)",
                          filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
                          zIndex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 28 20" width="100%" height="100%" aria-hidden="true">
                          <path
                            d="M2 10c0-4.6 4.6-8.4 10.2-8.4h3.6C21.4 1.6 26 5.4 26 10s-4.6 8.4-10.2 8.4h-3.6C6.6 18.4 2 14.6 2 10z"
                            fill="#b86e22"
                            stroke="rgba(0,0,0,0.5)"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M6.2 7.2c0 2.2 1.8 4 4 4"
                            fill="none"
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                          <path
                            d="M21.8 7.2c0 2.2-1.8 4-4 4"
                            fill="none"
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                          <path d="M11.5 6.1h5" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4" />
                          <path d="M11.8 8.2h4.4" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" />
                          <path d="M11.8 11.8h4.4" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" />
                        </svg>
                      </div>
                      </div>
                      </div>
                    );
                  })()}

                <div style={{ height: 12 }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className="kicker infoCardTitle">Playbook</div>
                    <div className="infoCardValue">{resolveCoachLabel(PLAYBOOK_LABELS, coachStats.playbookId)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className="kicker infoCardTitle">Base Defense</div>
                    <div className="infoCardValue">{resolveCoachLabel(BASE_DEFENSE_LABELS, coachStats.baseDefenseId)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className="kicker infoCardTitle">Offense Type</div>
                    <div className="infoCardValue">{resolveCoachLabel(OFFENSE_TYPE_LABELS, coachStats.offenseTypeId)}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 100 }}>YEAR</th>
            <th>TEAM</th>
            <th style={{ width: 120 }} className="statCol">RECORD</th>
            <th style={{ width: 120 }} className="statCol">CONF RECORD</th>
            <th style={{ width: 90 }} className="statCol">TOP 25</th>
            <th>POSTSEASON</th>
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
              <td data-label="Record" className="statCol">{r.record}</td>
              <td data-label="Conf Record" className="statCol">{r.confRecord}</td>
              <td data-label="Top 25" className="statCol">{r.top25Rank ?? "-"}</td>
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
                              fontWeight: 700,
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
