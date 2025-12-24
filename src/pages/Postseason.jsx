import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import { loadPostseasonLogoMap } from "../logoService";

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

function normalizeBowlName(name) {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .trim()
    .toLowerCase();
}

function createPostseasonLogoResolver(map) {
  return (name) => {
    if (!name) return "";
    const raw = String(name);
    const direct = map.get(normalizeBowlName(raw));
    if (direct) return direct;

    const stripped = raw.replace(/^cfp\s*-\s*/i, "").replace(/^college football playoff\s*-\s*/i, "");
    const strippedKey = normalizeBowlName(stripped);
    if (strippedKey && map.has(strippedKey)) {
      return map.get(strippedKey) || "";
    }

    const rawKey = normalizeBowlName(raw);
    for (const [key, url] of map.entries()) {
      if (rawKey.includes(key) || key.includes(rawKey)) {
        return url || "";
      }
    }

    return "";
  };
}

function playoffRoundForGame(game) {
  const name = String(game?.bowlName ?? "");
  const lower = name.toLowerCase();
  const week = Number(game?.week);

  if (week === 22 && lower.includes("national championship")) return "National Championship";
  if (week === 21 && /^cfp/i.test(name)) return "CFP - Semifinals";
  if (week === 20 && /^cfp/i.test(name)) return "CFP - Quarterfinals";
  if (week === 18 && lower.includes("cfp - round 1")) return "CFP - Round 1";

  return null;
}

function formatRecord({ w, l, t }) {
  if (!Number.isFinite(w) || !Number.isFinite(l)) return "-";
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export default function Postseason() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("");
  const [tab, setTab] = useState("confChamp");
  const [rows, setRows] = useState([]);
  const [playoffCols, setPlayoffCols] = useState({
    "CFP - Round 1": [],
    "CFP - Quarterfinals": [],
    "CFP - Semifinals": [],
    "National Championship": [],
  });
  const [postseasonLogoMap, setPostseasonLogoMap] = useState(new Map());

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = String(params.get("tab") || "").trim();
    if (q === "confChamp" || q === "bowls" || q === "bracket") {
      setTab(q);
    }
  }, [location.search]);

  function setTabAndUrl(nextTab) {
    setTab(nextTab);
    const params = new URLSearchParams(location.search);
    params.set("tab", nextTab);
    navigate({ pathname: "/postseason", search: `?${params.toString()}` }, { replace: false });
  }

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
    if (!dynastyId) {
      setAvailableSeasons([]);
      setSeasonYear("");
      return;
    }

    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);
      const picked = pickSeasonFromList({ currentSeason: seasonYear, availableSeasons: years });
      if (picked != null) setSeasonYear(picked);
    })();
  }, [dynastyId]);

  useEffect(() => {
    if (seasonYear !== "") {
      writeSeasonFilter(seasonYear);
    }
  }, [seasonYear]);

  useEffect(() => {
    if (!dynastyId || seasonYear === "") {
      setRows([]);
      setPlayoffCols({
        "CFP - Round 1": [],
        "CFP - Quarterfinals": [],
        "CFP - Semifinals": [],
        "National Championship": [],
      });
      return;
    }

    let alive = true;

    (async () => {
      const year = Number(seasonYear);
      const [gamesRaw, teamSeasonRows, teamLogoRows, overrideRows, bowlRows] = await Promise.all([
        db.games.where({ dynastyId, seasonYear: year }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear: year }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
        db.bowlGames.where({ dynastyId, seasonYear: year }).toArray(),
      ]);

      if (!alive) return;

      const nameByTgid = new Map(
        teamSeasonRows.map((t) => [t.tgid, `${t.tdna} ${t.tmna}`.trim()])
      );
      const confByTgid = new Map(teamSeasonRows.map((t) => [String(t.tgid), String(t.cgid ?? "")]));
      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [r.tgid, r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [r.tgid, r.url]));
      const logoFor = (tgid) =>
        overrideByTgid.get(tgid) || baseLogoByTgid.get(tgid) || FALLBACK_LOGO;

      const bowlByKey = new Map();
      for (const r of bowlRows) {
        if (r.sewn == null || r.sgnm == null) continue;
        if (!String(r.bnme ?? "").trim()) continue;
        bowlByKey.set(`${r.sewn}|${r.sgnm}`, String(r.bnme).trim());
      }

      const postseasonLogoFor = createPostseasonLogoResolver(postseasonLogoMap);

      const recordMap = new Map();
      for (const g of gamesRaw) {
        const hasScore = g.homeScore != null && g.awayScore != null;
        if (!hasScore) continue;

        const homeId = String(g.homeTgid);
        const awayId = String(g.awayTgid);
        const hs = Number(g.homeScore);
        const as = Number(g.awayScore);
        if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;

        if (!recordMap.has(homeId)) recordMap.set(homeId, { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 });
        if (!recordMap.has(awayId)) recordMap.set(awayId, { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 });

        const homeRec = recordMap.get(homeId);
        const awayRec = recordMap.get(awayId);

        if (hs > as) {
          homeRec.w += 1;
          awayRec.l += 1;
        } else if (hs < as) {
          homeRec.l += 1;
          awayRec.w += 1;
        } else {
          homeRec.t += 1;
          awayRec.t += 1;
        }

        const homeConf = confByTgid.get(homeId);
        const awayConf = confByTgid.get(awayId);
        if (homeConf && awayConf && homeConf === awayConf) {
          if (hs > as) {
            homeRec.cw += 1;
            awayRec.cl += 1;
          } else if (hs < as) {
            homeRec.cl += 1;
            awayRec.cw += 1;
          } else {
            homeRec.ct += 1;
            awayRec.ct += 1;
          }
        }
      }

      const postseasonGames = gamesRaw
        .filter((g) => bowlByKey.has(`${g.week}|${g.sgnm}`))
        .map((g) => {
          const bowlNameRaw = bowlByKey.get(`${g.week}|${g.sgnm}`) || "";
          const bowlName = /^nat championship$/i.test(bowlNameRaw)
            ? "National Championship"
            : bowlNameRaw;
          const bowlLogoUrl = bowlName ? postseasonLogoFor(bowlName) : "";

          const homeName = nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`;
          const awayName = nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`;
          const hasScore = g.homeScore != null && g.awayScore != null;
          const homeWins = hasScore && Number(g.homeScore) > Number(g.awayScore);
          const awayWins = hasScore && Number(g.awayScore) > Number(g.homeScore);
          const winner = homeWins ? "home" : awayWins ? "away" : null;

          const homeId = String(g.homeTgid);
          const awayId = String(g.awayTgid);
          const homeConfId = confByTgid.get(homeId);
          const awayConfId = confByTgid.get(awayId);
          const homeConfName = getConferenceName(homeConfId);
          const awayConfName = getConferenceName(awayConfId);
          const homeRec = recordMap.get(homeId) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const awayRec = recordMap.get(awayId) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };

          const leftIsHome = homeWins || (!homeWins && !awayWins);
          const leftTgid = leftIsHome ? g.homeTgid : g.awayTgid;
          const rightTgid = leftIsHome ? g.awayTgid : g.homeTgid;
          const leftName = leftIsHome ? homeName : awayName;
          const rightName = leftIsHome ? awayName : homeName;
          const leftLogo = leftIsHome ? logoFor(g.homeTgid) : logoFor(g.awayTgid);
          const rightLogo = leftIsHome ? logoFor(g.awayTgid) : logoFor(g.homeTgid);
          const leftScore = leftIsHome ? g.homeScore : g.awayScore;
          const rightScore = leftIsHome ? g.awayScore : g.homeScore;

          return {
            week: g.week,
            homeTgid: g.homeTgid,
            awayTgid: g.awayTgid,
            homeName,
            awayName,
            homeLogo: logoFor(g.homeTgid),
            awayLogo: logoFor(g.awayTgid),
            homeScore: g.homeScore,
            awayScore: g.awayScore,
            winner,
            homeRecord: formatRecord(homeRec),
            awayRecord: formatRecord(awayRec),
            homeConfRecord: formatRecord({ w: homeRec.cw, l: homeRec.cl, t: homeRec.ct }),
            awayConfRecord: formatRecord({ w: awayRec.cw, l: awayRec.cl, t: awayRec.ct }),
            homeConfName,
            awayConfName,
            leftTgid,
            rightTgid,
            leftName,
            rightName,
            leftLogo,
            rightLogo,
            leftScore,
            rightScore,
            result: hasScore ? `${leftScore} - ${rightScore}` : "—",
            bowlName,
            bowlLogoUrl,
          };
        })
        .sort((a, b) => {
          if (a.week !== b.week) return a.week - b.week;
          return String(a.homeTgid).localeCompare(String(b.homeTgid));
        });

      const grouped = {
        "CFP - Round 1": [],
        "CFP - Quarterfinals": [],
        "CFP - Semifinals": [],
        "National Championship": [],
      };
      for (const g of postseasonGames) {
        const round = playoffRoundForGame(g);
        if (round) grouped[round].push(g);
      }
      for (const key of Object.keys(grouped)) grouped[key].sort((a, b) => a.week - b.week);

      setRows(postseasonGames);
      setPlayoffCols(grouped);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear, postseasonLogoMap]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);

  if (!dynastyId) {
    return (
      <div>
        <h2>Postseason</h2>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="hrow">
        <h2>Postseason</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="postseasonTabs">
            <button
              className="toggleBtn"
              onClick={() => setTabAndUrl("confChamp")}
              style={{
                fontWeight: tab === "confChamp" ? 800 : 600,
                opacity: 1,
                color: tab === "confChamp" ? "var(--text)" : "var(--muted)",
                borderColor: tab === "confChamp" ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
                background: tab === "confChamp" ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
                boxShadow: tab === "confChamp" ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
              }}
            >
              Conference Championships
            </button>
            <button
              className="toggleBtn"
              onClick={() => setTabAndUrl("bowls")}
              style={{
                fontWeight: tab === "bowls" ? 800 : 600,
                opacity: 1,
                color: tab === "bowls" ? "var(--text)" : "var(--muted)",
                borderColor: tab === "bowls" ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
                background: tab === "bowls" ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
                boxShadow: tab === "bowls" ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
              }}
            >
              Bowl Results
            </button>
            <button
              className="toggleBtn"
              onClick={() => setTabAndUrl("bracket")}
              style={{
                fontWeight: tab === "bracket" ? 800 : 600,
                opacity: 1,
                color: tab === "bracket" ? "var(--text)" : "var(--muted)",
                borderColor: tab === "bracket" ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
                background: tab === "bracket" ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
                boxShadow: tab === "bracket" ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
              }}
            >
              CFP Bracket
            </button>
          </div>

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
                seasonOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </div>

      {!hasSeasons ? (
        <p className="kicker">No seasons uploaded yet for this dynasty.</p>
      ) : tab === "bracket" ? (
        <div className="postseasonBracket">
          {["CFP - Round 1", "CFP - Quarterfinals", "CFP - Semifinals", "National Championship"].map((round) => (
            <div
              key={round}
              className={[
                "bracketCol",
                round === "National Championship" ? "bracketColFinal" : "",
                round === "CFP - Semifinals" ? "bracketColCenter" : "",
                round === "National Championship" ? "bracketColCenter" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <h3 className="bracketRoundTitle">{round}</h3>
              <div className="bracketColBody">
                {playoffCols[round].length === 0 ? (
                  <div className="bracketCard bracketCardEmpty">
                    <div className="bracketMeta">
                      <span className="kicker">No game for this round</span>
                    </div>
                    <div className="bracketMatch bracketMatchEmpty" />
                    <div className="bracketMatch bracketMatchEmpty" />
                  </div>
                ) : (
                  playoffCols[round].map((g, idx) => {
                    const hs = g.homeScore;
                    const as = g.awayScore;
                    const hasScore = hs != null && as != null;
                    const homeWins = hasScore && Number(hs) > Number(as);
                    const awayWins = hasScore && Number(as) > Number(hs);
                    const isFinal = round === "National Championship";

                    return (
                      <div
                        key={`${round}-${idx}`}
                        className={`bracketCard ${isFinal ? "bracketCardFinal" : ""}`}
                      >
                    <div className="bracketMeta">
                      {g.bowlLogoUrl ? (
                        <img src={g.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : null}
                      <Link
                        to={`/postseason/bowl?name=${encodeURIComponent(g.bowlName)}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        title="View bowl results"
                      >
                        <span>{g.bowlName}</span>
                      </Link>
                    </div>

                        <div className={`bracketMatch ${homeWins ? "isWinner" : awayWins ? "isLoser" : ""}`}>
                          <Link to={`/team/${g.homeTgid}`} className="bracketTeamLink" title="View team page">
                            <div className="bracketTeam">
                              <img src={g.homeLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                              <span className="bracketTeamName">{g.homeName}</span>
                              {isFinal && homeWins ? <span className="bracketPill">Champion</span> : null}
                            </div>
                          </Link>
                          <span
                            className={`bracketScore ${homeWins ? "scoreWinner" : awayWins ? "scoreLoser" : ""}`}
                          >
                            {g.homeScore ?? "-"}
                          </span>
                        </div>
                        <div className={`bracketMatch ${awayWins ? "isWinner" : homeWins ? "isLoser" : ""}`}>
                          <Link to={`/team/${g.awayTgid}`} className="bracketTeamLink" title="View team page">
                            <div className="bracketTeam">
                              <img src={g.awayLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                              <span className="bracketTeamName">{g.awayName}</span>
                              {isFinal && awayWins ? <span className="bracketPill">Champion</span> : null}
                            </div>
                          </Link>
                          <span
                            className={`bracketScore ${awayWins ? "scoreWinner" : homeWins ? "scoreLoser" : ""}`}
                          >
                            {g.awayScore ?? "-"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (() => {
        const isConfChamp = (name) =>
          /championship$/i.test(String(name ?? "")) && !/national championship$/i.test(String(name ?? ""));
        const byName = (a, b) => String(a.bowlName).localeCompare(String(b.bowlName));
        const roundOrder = ["CFP - Round 1", "CFP - Quarterfinals", "CFP - Semifinals", "National Championship"];
        const roundRank = new Map(roundOrder.map((r, i) => [r, i]));

        let filtered = [];
        if (tab === "confChamp") {
          filtered = rows.filter((r) => isConfChamp(r.bowlName)).slice().sort(byName);
        } else {
          const nonConf = rows.filter((r) => !isConfChamp(r.bowlName));
          const playoff = nonConf.filter((r) => playoffRoundForGame(r));
          const nonPlayoff = nonConf.filter((r) => !playoffRoundForGame(r)).slice().sort(byName);
          const playoffSorted = playoff
            .slice()
            .sort((a, b) => {
              const ra = roundRank.get(playoffRoundForGame(a)) ?? 999;
              const rb = roundRank.get(playoffRoundForGame(b)) ?? 999;
              if (ra !== rb) return ra - rb;
              return String(a.bowlName).localeCompare(String(b.bowlName));
            });
          filtered = [...nonPlayoff, ...playoffSorted];
        }

        if (filtered.length === 0) {
          return <p className="kicker">No games found for this season.</p>;
        }

        return (
          <div className="matchupGrid matchupGridPostseason">
            {filtered.map((r, idx) => (
              <div key={`${r.week}-${idx}`} className="matchupCard">
                <div className="matchupMeta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {r.bowlLogoUrl ? (
                    <img className="matchupLogo" src={r.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : null}
                  <Link
                    to={`/postseason/bowl?name=${encodeURIComponent(r.bowlName)}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                    title="View bowl results"
                  >
                    {r.bowlName}
                  </Link>
                </div>

                <div className="matchupRow">
                  <Link to={`/team/${r.awayTgid}`} className="matchupTeam" title="View team page">
                    <img className="matchupLogo" src={r.awayLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    <span className="matchupTeamName">{r.awayName}</span>
                  </Link>
                  <span className="matchupScore">
                    {r.awayScore ?? "-"}
                    {r.winner === "away" ? <span className="winnerCaret" aria-hidden="true" /> : null}
                  </span>
                </div>
                <div className="matchupMeta">
                  ({r.awayRecord}, {r.awayConfRecord} {r.awayConfName})
                </div>

                <div className="matchupRow">
                  <Link to={`/team/${r.homeTgid}`} className="matchupTeam" title="View team page">
                    <img className="matchupLogo" src={r.homeLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    <span className="matchupTeamName">{r.homeName}</span>
                  </Link>
                  <span className="matchupScore">
                    {r.homeScore ?? "-"}
                    {r.winner === "home" ? <span className="winnerCaret" aria-hidden="true" /> : null}
                  </span>
                </div>
                <div className="matchupMeta">
                  ({r.homeRecord}, {r.homeConfRecord} {r.homeConfName})
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
