import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { getSeasonFromParamOrSaved, pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import { buildRunningRecords, formatRecord } from "../runningRecords";
import { readViewFromSearch, readViewPreference, writeViewPreference } from "../viewPreference";

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
  const latestSeasonRef = useRef(null);

  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [weekFilter, setWeekFilter] = useState("All");
  const [confFilter, setConfFilter] = useState("All");
  const [view, setView] = useState("cards");

  const [rows, setRows] = useState([]);
  const [confOptions, setConfOptions] = useState([]);

  const viewButtonStyle = (active) => ({
    fontWeight: active ? 800 : 600,
    opacity: 1,
    color: active ? "var(--text)" : "var(--muted)",
    borderColor: active ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
    background: active ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
    boxShadow: active ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
  });

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
    (async () => {
      const fromSearch = readViewFromSearch(location.search);
      if (fromSearch) {
        setView(fromSearch);
        return;
      }
      const saved = await readViewPreference({ page: "home", dynastyId });
      if (saved) setView(saved);
    })();
  }, [dynastyId, location.search]);

  useEffect(() => {
    if (!dynastyId) return;
    const normalizedView = view === "table" ? "table" : "cards";
    const params = new URLSearchParams(location.search);
    const current = params.get("view");
    if (normalizedView !== current) {
      params.set("view", normalizedView);
      navigate({ pathname: "/", search: `?${params.toString()}` }, { replace: true });
    }
    writeViewPreference({ page: "home", dynastyId, view: normalizedView });
  }, [dynastyId, view, navigate, location.search]);

  function renderScheduleTable(groups) {
    const resultWidth = 10;
    const recordWidth = 12;
    const teamWidth = (100 - resultWidth - recordWidth * 2) / 2;

    return (
      <table className="table postseasonTable">
        <colgroup>
          <col style={{ width: `${teamWidth}%` }} />
          <col style={{ width: `${recordWidth}%` }} />
          <col style={{ width: `${resultWidth}%` }} />
          <col style={{ width: `${teamWidth}%` }} />
          <col style={{ width: `${recordWidth}%` }} />
        </colgroup>
        <thead />
        <tbody>
          {groups.map((group, groupIdx) => (
            <Fragment key={group.week ?? "week"}>
              <tr className="scheduleWeekRow">
                <th colSpan={5} className="scheduleWeekHeaderTop">
                  Week {group.week ?? "-"}
                </th>
              </tr>
              <tr className="scheduleWeekHeader">
                <th>Team</th>
                <th>Record</th>
                <th>Result</th>
                <th>Team</th>
                <th>Record</th>
              </tr>
              {group.rows.map((r, idx) => (
                <tr key={`${r.week}-${idx}`}>
                  <td>
                    <Link to={`/team/${r.leftTgid}`} className="matchupTeam" title="View team page">
                      <TeamCell name={r.leftName} logoUrl={r.leftLogo} />
                    </Link>
                  </td>
                  <td>{r.leftRecord || "-"}</td>
                  <td>
                    {r.leftScore ?? "-"} - {r.rightScore ?? "-"}
                  </td>
                  <td>
                    <Link to={`/team/${r.rightTgid}`} className="matchupTeam" title="View team page">
                      <TeamCell name={r.rightName} logoUrl={r.rightLogo} />
                    </Link>
                  </td>
                  <td>{r.rightRecord || "-"}</td>
                </tr>
              ))}
              {groupIdx < groups.length - 1 ? (
                <tr className="scheduleWeekSpacer" aria-hidden="true">
                  <td colSpan={5} />
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    );
  }

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

      const running = buildRunningRecords({ games: gamesRaw, confByTgid });

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
          const homeRec = running.getRecordAtWeek(homeId, g.week) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const awayRec = running.getRecordAtWeek(awayId, g.week) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const homeRecordText = formatRecord(homeRec);
          const awayRecordText = formatRecord(awayRec);
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
          const homeWins = winner === "home";
          const awayWins = winner === "away";
          const leftIsHome = homeWins || (!homeWins && !awayWins);
          const leftTgid = leftIsHome ? g.homeTgid : g.awayTgid;
          const rightTgid = leftIsHome ? g.awayTgid : g.homeTgid;
          const leftName = leftIsHome ? (nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`) : (nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`);
          const rightName = leftIsHome ? (nameByTgid.get(g.awayTgid) || `TGID ${g.awayTgid}`) : (nameByTgid.get(g.homeTgid) || `TGID ${g.homeTgid}`);
          const leftLogo = leftIsHome ? logoFor(g.homeTgid) : logoFor(g.awayTgid);
          const rightLogo = leftIsHome ? logoFor(g.awayTgid) : logoFor(g.homeTgid);
          const leftScore = leftIsHome ? (hasScore ? g.homeScore : "-") : (hasScore ? g.awayScore : "-");
          const rightScore = leftIsHome ? (hasScore ? g.awayScore : "-") : (hasScore ? g.homeScore : "-");
          const leftRecord = leftIsHome ? homeRecordText : awayRecordText;
          const rightRecord = leftIsHome ? awayRecordText : homeRecordText;
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
            homeRecord: homeRecordText,
            awayRecord: awayRecordText,
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
            leftRecord,
            rightRecord,
          };
        });

      setRows(sorted);
    })();
  }, [dynastyId, seasonYear, weekFilter, confFilter, location.search]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => availableSeasons.map(String), [availableSeasons]);
  const weekOptions = useMemo(() => ["All", ...availableWeeks.map(String)], [availableWeeks]);
  const groupedRows = useMemo(() => {
    if (rows.length === 0) return [];
    if (weekFilter !== "All") {
      const weekNum = Number(weekFilter);
      return [{ week: Number.isFinite(weekNum) ? weekNum : null, rows }];
    }
    const groups = [];
    const byWeek = new Map();
    rows.forEach((row) => {
      if (!byWeek.has(row.week)) {
        byWeek.set(row.week, []);
        groups.push({ week: row.week, rows: byWeek.get(row.week) });
      }
      byWeek.get(row.week).push(row);
    });
    return groups;
  }, [rows, weekFilter]);

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

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
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

          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="toggleBtn"
              style={viewButtonStyle(view === "cards")}
              onClick={() => setView("cards")}
            >
              Cards
            </button>
            <button
              className="toggleBtn"
              style={viewButtonStyle(view === "table")}
              onClick={() => setView("table")}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {!hasSeasons ? (
        <p className="kicker">
          No seasons uploaded yet for this dynasty. Use <b>Upload New Season</b> in the sidebar.
        </p>
      ) : view === "table" ? (
        renderScheduleTable(groupedRows)
      ) : (
        <div className="matchupWeekGroups">
          {groupedRows.map((group) => (
            <section key={group.week ?? "week"} className="matchupWeekGroup">
              <div className="matchupWeekHeader">Week {group.week ?? "-"}</div>
              <div className="matchupGrid">
                {group.rows.map((r, idx) => (
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
