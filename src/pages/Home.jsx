import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";

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

function formatRecord({ w, l, t }) {
  if (!Number.isFinite(w) || !Number.isFinite(l)) return "-";
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);

  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonYear, setSeasonYear] = useState("");
  const latestSeasonRef = useRef(null);

  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [weekFilter, setWeekFilter] = useState("All");
  const [confFilter, setConfFilter] = useState("All");

  const [rows, setRows] = useState([]);
  const [confOptions, setConfOptions] = useState([]);

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
    const conf = params.get("conf");
    const hasUploadFlag = Boolean(
      sessionStorage.getItem("seasonUploadComplete") || sessionStorage.getItem("seasonUploadLatest")
    );

    if (!hasUploadFlag) {
      const savedSeason = getSeasonFromParamOrSaved(season);
      if (savedSeason != null) setSeasonYear(savedSeason);
    }

    if (week != null) setWeekFilter(week);
    if (conf) setConfFilter(conf);
  }, [location.search]);

  useEffect(() => {
    if (!dynastyId) return;
    const hasUploadFlag = Boolean(
      sessionStorage.getItem("seasonUploadComplete") || sessionStorage.getItem("seasonUploadLatest")
    );
    if (hasUploadFlag) return;
    const params = new URLSearchParams(location.search);
    if (seasonYear !== "") {
      params.set("season", seasonYear);
      writeSeasonFilter(seasonYear);
    }
    if (weekFilter) params.set("week", weekFilter);
    if (confFilter) params.set("conf", confFilter);
    navigate({ pathname: "/", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, weekFilter, confFilter, navigate, location.search]);

  useEffect(() => {
    if (!dynastyId) {
      setAvailableSeasons([]);
      setSeasonYear("");
      latestSeasonRef.current = null;
      return;
    }

    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);

      const latest = years[0] ?? null;
      const prevLatest = latestSeasonRef.current;
      const hasNewLatest = latest != null && prevLatest != null && latest > prevLatest;
      const hasUploadFlag = Boolean(sessionStorage.getItem("seasonUploadComplete"));
      const uploadLatestRaw = sessionStorage.getItem("seasonUploadLatest");
      const uploadLatest = uploadLatestRaw ? Number(uploadLatestRaw) : null;
      const hasUploadLatest = uploadLatest != null && Number.isFinite(uploadLatest) && years.includes(uploadLatest);

      if (hasUploadLatest) {
        const nextSeason = String(uploadLatest);
        setSeasonYear(nextSeason);
        writeSeasonFilter(nextSeason);
        const params = new URLSearchParams(location.search);
        params.set("season", nextSeason);
        navigate({ pathname: "/", search: `?${params.toString()}` }, { replace: true });
        sessionStorage.removeItem("seasonUploadLatest");
        sessionStorage.removeItem("seasonUploadComplete");
      } else if (hasUploadFlag || hasNewLatest) {
        const nextSeason = latest != null ? String(latest) : "";
        setSeasonYear(nextSeason);
        writeSeasonFilter(nextSeason);
        sessionStorage.removeItem("seasonUploadComplete");
      } else {
        const picked = pickSeasonFromList({ currentSeason: seasonYear, availableSeasons: years });
        if (picked != null && picked !== seasonYear) setSeasonYear(picked);
      }

      latestSeasonRef.current = latest;
    })();
  }, [dynastyId, location.search, seasonYear, navigate]);

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
      setConfOptions([]);
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
      const confByTgid = new Map(teamSeasonRows.map((t) => [String(t.tgid), String(t.cgid ?? "")]));
      const confIds = Array.from(new Set(teamSeasonRows.map((t) => String(t.cgid ?? "")).filter(Boolean)))
        .sort((a, b) => Number(a) - Number(b))
        .map((id) => ({ id, name: getConferenceName(id) }));
      setConfOptions(confIds);
      if (confFilter !== "All" && !confIds.some((c) => c.id === String(confFilter))) {
        setConfFilter("All");
      }
      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [r.tgid, r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [r.tgid, r.url]));

      const logoFor = (tgid) =>
        overrideByTgid.get(tgid) || baseLogoByTgid.get(tgid) || FALLBACK_LOGO;

      const recordMap = new Map();
      for (const g of gamesRaw) {
        const hasScore = g.homeScore != null && g.awayScore != null;
        if (!hasScore) continue;

        const homeId = String(g.homeTgid);
        const awayId = String(g.awayTgid);
        const hs = Number(g.homeScore);
        const as = Number(g.awayScore);

        if (!recordMap.has(homeId)) {
          recordMap.set(homeId, { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 });
        }
        if (!recordMap.has(awayId)) {
          recordMap.set(awayId, { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 });
        }

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

      let games = gamesRaw;
      if (weekFilter !== "All") {
        const wf = Number(weekFilter);
        games = gamesRaw.filter((g) => g.week === wf);
      }
      if (confFilter !== "All") {
        games = games.filter((g) => {
          const homeConf = confByTgid.get(String(g.homeTgid));
          const awayConf = confByTgid.get(String(g.awayTgid));
          return String(homeConf) === String(confFilter) || String(awayConf) === String(confFilter);
        });
      }

      const sorted = games
        .slice()
        .sort((a, b) => a.week - b.week)
        .map((g) => {
          const homeId = String(g.homeTgid);
          const awayId = String(g.awayTgid);
          const homeConfId = confByTgid.get(homeId);
          const awayConfId = confByTgid.get(awayId);
          const homeConfName = getConferenceName(homeConfId);
          const awayConfName = getConferenceName(awayConfId);
          const homeRec = recordMap.get(homeId) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const awayRec = recordMap.get(awayId) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const hasScore = g.homeScore != null && g.awayScore != null;
          const homeScoreNum = hasScore ? Number(g.homeScore) : null;
          const awayScoreNum = hasScore ? Number(g.awayScore) : null;
          const winner =
            hasScore && Number.isFinite(homeScoreNum) && Number.isFinite(awayScoreNum)
              ? homeScoreNum === awayScoreNum
                ? null
                : homeScoreNum > awayScoreNum
                  ? "home"
                  : "away"
              : null;
          return {
            week: g.week,
            homeTgid: g.homeTgid,
            awayTgid: g.awayTgid,
            homeName: nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`,
            awayName: nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`,
            result:
              hasScore ? `${g.homeScore} - ${g.awayScore}` : "-",
            homeLogo: logoFor(g.homeTgid),
            awayLogo: logoFor(g.awayTgid),
            homeScore: hasScore ? g.homeScore : "-",
            awayScore: hasScore ? g.awayScore : "-",
            winner,
            homeRecord: formatRecord(homeRec),
            awayRecord: formatRecord(awayRec),
            homeConfRecord: formatRecord({ w: homeRec.cw, l: homeRec.cl, t: homeRec.ct }),
            awayConfRecord: formatRecord({ w: awayRec.cw, l: awayRec.cl, t: awayRec.ct }),
            homeConfName,
            awayConfName,
          };
        });

      setRows(sorted);
    })();
  }, [dynastyId, seasonYear, weekFilter, confFilter, location.search]);

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

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Conference</span>
            <select
              value={confFilter}
              onChange={(e) => setConfFilter(e.target.value)}
              disabled={!hasSeasons}
            >
              <option value="All">All</option>
              {confOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
        <div className="matchupGrid">
          {rows.map((r, idx) => (
            <div key={`${r.week}-${idx}`} className="matchupCard">
              <div className="matchupRow">
                <Link
                  to={`/team/${r.awayTgid}`}
                  className="matchupTeam"
                  title="View team page"
                >
                  <img className="matchupLogo" src={r.awayLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <span className="matchupTeamName">{r.awayName}</span>
                </Link>
                <span className="matchupScore">
                  {r.awayScore}
                  {r.winner === "away" ? <span className="winnerCaret" aria-hidden="true" /> : null}
                </span>
              </div>
              <div className="matchupMeta">
                ({r.awayRecord}, {r.awayConfRecord} {r.awayConfName})
              </div>

              <div className="matchupRow">
                <Link
                  to={`/team/${r.homeTgid}`}
                  className="matchupTeam"
                  title="View team page"
                >
                  <img className="matchupLogo" src={r.homeLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <span className="matchupTeamName">{r.homeName}</span>
                </Link>
                <span className="matchupScore">
                  {r.homeScore}
                  {r.winner === "home" ? <span className="winnerCaret" aria-hidden="true" /> : null}
                </span>
              </div>
              <div className="matchupMeta">
                ({r.homeRecord}, {r.homeConfRecord} {r.homeConfName})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
