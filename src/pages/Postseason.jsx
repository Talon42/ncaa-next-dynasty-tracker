import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
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
      setSeasonYear(years[0] ?? "");
    })();
  }, [dynastyId]);

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
      </div>

      {!hasSeasons ? (
        <p className="kicker">No seasons uploaded yet for this dynasty.</p>
      ) : tab === "bracket" ? (
        <div className="postseasonBracket">
          {["CFP - Round 1", "CFP - Quarterfinals", "CFP - Semifinals", "National Championship"].map((round) => (
            <div key={round} className="bracketCol">
              <h3 style={{ marginTop: 0 }}>{round}</h3>
              {playoffCols[round].length === 0 ? (
                <div className="kicker">No games found.</div>
              ) : (
                playoffCols[round].map((g, idx) => (
                  <div key={`${round}-${idx}`} className="bracketCard">
                    <div className="bracketMeta">
                      {g.bowlLogoUrl ? (
                        <img src={g.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : null}
                      <span>{g.bowlName}</span>
                    </div>

                    <div className="bracketMatch">
                      <Link
                        to={`/team/${g.homeTgid}`}
                        style={{ color: "inherit", textDecoration: "none", display: "inline-block", minWidth: 0 }}
                        title="View team page"
                      >
                        <div className="bracketTeam">
                          <img src={g.homeLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          <span>{g.homeName}</span>
                        </div>
                      </Link>
                      <span className="bracketScore">{g.homeScore ?? "-"}</span>
                    </div>
                    <div className="bracketMatch">
                      <Link
                        to={`/team/${g.awayTgid}`}
                        style={{ color: "inherit", textDecoration: "none", display: "inline-block", minWidth: 0 }}
                        title="View team page"
                      >
                        <div className="bracketTeam">
                          <img src={g.awayLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          <span>{g.awayName}</span>
                        </div>
                      </Link>
                      <span className="bracketScore">{g.awayScore ?? "-"}</span>
                    </div>
                  </div>
                ))
              )}
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
          <table className="table" style={{ tableLayout: "auto", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Bowl</th>
                <th>Team</th>
                <th style={{ width: 140 }}>Result</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={`${r.week}-${idx}`}>
                  <td>
                    <div className="postseasonBowlCell">
                      {r.bowlLogoUrl ? (
                        <img
                          className="teamLogo"
                          src={r.bowlLogoUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <span>{r.bowlName}</span>
                    </div>
                  </td>
                  <td>
                    <Link
                      to={`/team/${r.leftTgid}`}
                      style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                      title="View team page"
                    >
                      <TeamCell name={r.leftName} logoUrl={r.leftLogo} />
                    </Link>
                  </td>
                  <td>{r.result}</td>
                  <td>
                    <Link
                      to={`/team/${r.rightTgid}`}
                      style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                      title="View team page"
                    >
                      <TeamCell name={r.rightName} logoUrl={r.rightLogo} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
    </div>
  );
}
