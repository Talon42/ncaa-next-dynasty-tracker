import { Fragment, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { pickSeasonFromList, writeSeasonFilter } from "../seasonFilter";
import { loadConferenceLogoMap, loadPostseasonLogoMap, normalizeConfKey } from "../logoService";
import { readCachedViewPreference, readViewFromSearch, readViewPreference, writeViewPreference } from "../viewPreference";
import { buildRunningRecords, formatRecord } from "../runningRecords";

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
  const isCfp = /^cfp\b/i.test(name) || /^college football playoff\b/i.test(name);

  if (week === 22 && lower.includes("national championship")) return "National Championship";
  if (week === 21 && isCfp) return "CFP - Semifinals";
  // NCAA Next exports commonly schedule CFP quarterfinal bowls in week 19 (and some variants use week 20).
  if ((week === 19 || week === 20) && isCfp) return "CFP - Quarterfinals";
  if (week === 18 && lower.includes("cfp - round 1")) return "CFP - Round 1";

  return null;
}

export default function Postseason() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialParams = new URLSearchParams(location.search);
  const initialTabParam = String(initialParams.get("tab") || "").trim();
  const initialTab =
    initialTabParam === "confChamp" || initialTabParam === "bowls" || initialTabParam === "bracket"
      ? initialTabParam
      : "confChamp";
  const initialSeasonParam = initialParams.get("season");
  const initialSeasonYear = initialSeasonParam === "All" ? "All" : initialSeasonParam || "";
  const initialView = readViewFromSearch(location.search) || "cards";
  // `undefined` while loading, `null` if loaded and none selected.
  const [dynastyId, setDynastyId] = useState(undefined);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  const [seasonYear, setSeasonYear] = useState(initialSeasonYear);
  const [tab, setTab] = useState(initialTab);
  const [bowlFilter, setBowlFilter] = useState("");
  const [confFilter, setConfFilter] = useState("");
  const [view, setView] = useState(initialView);
  const [viewReady, setViewReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [playoffCols, setPlayoffCols] = useState({
    "CFP - Round 1": [],
    "CFP - Quarterfinals": [],
    "CFP - Semifinals": [],
    "National Championship": [],
  });
  const [postseasonLogoMap, setPostseasonLogoMap] = useState(new Map());
  const [confLogoMap, setConfLogoMap] = useState(new Map());
  const [loadingRows, setLoadingRows] = useState(false);

  const viewButtonStyle = (active) => ({
    fontWeight: "var(--app-control-font-weight)",
    opacity: 1,
    color: active ? "var(--text)" : "var(--muted)",
    borderColor: active ? "rgba(211, 0, 0, 0.55)" : "var(--border)",
    background: active ? "rgba(211, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.03)",
    boxShadow: active ? "0 0 0 2px rgba(211, 0, 0, 0.14) inset" : "none",
  });

  function renderMatchupCards(list, seasonValue) {
    if (seasonValue === "All") {
      const bySeason = new Map();
      list.forEach((r) => {
        const key = String(r.seasonYear ?? "");
        if (!bySeason.has(key)) bySeason.set(key, []);
        bySeason.get(key).push(r);
      });
      const seasons = Array.from(bySeason.keys()).sort((a, b) => Number(b) - Number(a));

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {seasons.map((season) => (
            <div key={season} className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>{season}</h3>
              <div className="matchupGrid matchupGridPostseason">
                {bySeason.get(season).map((r, idx) => (
                  <div key={`${season}-${r.week}-${idx}`} className="matchupCard">
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
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="matchupGrid matchupGridPostseason">
        {list.map((r, idx) => (
          <div key={`${r.seasonYear}-${r.week}-${idx}`} className="matchupCard">
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
  }

  function renderBowlFilteredSeasonCards(list) {
    const bySeason = new Map();
    list.forEach((r) => {
      const key = String(r.seasonYear ?? "");
      if (!bySeason.has(key)) bySeason.set(key, []);
      bySeason.get(key).push(r);
    });
    const seasons = Array.from(bySeason.keys()).sort((a, b) => Number(b) - Number(a));

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {seasons.map((season) => {
          const seasonRows = bySeason.get(season) || [];
          if (!seasonRows.length) return null;
          const first = seasonRows[0];
          const bowlLabel = String(first.bowlName ?? "").replace(/^cfp\s*-\s*/i, "").trim();

          return (
            <div
              key={season}
              className="card"
              style={{ padding: 14, maxWidth: 860, marginLeft: "auto", marginRight: "auto" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <h3 style={{ margin: 0 }}>{season}</h3>
                <Link
                  to={`/postseason/bowl?name=${encodeURIComponent(first.bowlName)}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                  title="View bowl results"
                >
                  <div className="postseasonBowlCell">
                    {first.bowlLogoUrl ? (
                      <img className="teamLogo" src={first.bowlLogoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : null}
                    <span>{bowlLabel || first.bowlName}</span>
                  </div>
                </Link>
              </div>

              {seasonRows.map((r, idx) => (
                <div key={`${season}-${r.week}-${idx}`} className="matchupCard" style={{ marginTop: idx ? 12 : 0 }}>
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
        })}
      </div>
    );
  }

  function renderBowlFilteredTable(
    list,
    {
      showWinningCoach = false,
      winnerLabel = "Winner",
      normalizeBowlLabel = (name) => name,
      groupBySeason = false,
      sortBy = "season",
      showSeasonColumn = false,
      showGameColumn = true,
      showConfRecord = false,
    } = {}
  ) {
    const sortLabel = (name) => normalizeBowlLabel(name);
    const byGame = (a, b) => sortLabel(a.bowlName).localeCompare(sortLabel(b.bowlName));
    const sorted = list
      .slice()
      .sort((a, b) => {
        if (sortBy === "game") {
          const nameSort = byGame(a, b);
          if (nameSort) return nameSort;
          if (a.seasonYear !== b.seasonYear) return Number(b.seasonYear) - Number(a.seasonYear);
          if (a.week !== b.week) return Number(a.week) - Number(b.week);
          return String(a.homeTgid).localeCompare(String(b.homeTgid));
        }
        if (a.seasonYear !== b.seasonYear) return Number(b.seasonYear) - Number(a.seasonYear);
        if (a.week !== b.week) return Number(a.week) - Number(b.week);
        return String(a.homeTgid).localeCompare(String(b.homeTgid));
      });

    const seasonWidth = showSeasonColumn ? 8 : 0;
    const gameWidth = showGameColumn ? (showWinningCoach ? 18 : (showConfRecord ? 16 : 20)) : 0;
    const resultWidth = showWinningCoach ? 8 : (showConfRecord ? 8 : 10);
    const recordWidth = showWinningCoach ? 10 : (showConfRecord ? 9 : 12);
    const confRecordWidth = showConfRecord ? 9 : 0;
    const winningCoachWidth = showWinningCoach ? 20 : 0;
    const baseWidth =
      seasonWidth +
      gameWidth +
      resultWidth +
      recordWidth * 2 +
      confRecordWidth * 2 +
      (showWinningCoach ? winningCoachWidth : 0);
    const teamWidth = (100 - baseWidth) / 2;
    const colCount =
      5 +
      (showGameColumn ? 1 : 0) +
      (showSeasonColumn ? 1 : 0) +
      (showConfRecord ? 2 : 0) +
      (showWinningCoach ? 1 : 0);
    const seasonHeaderColCount = colCount;

    const groupedRows = groupBySeason
      ? sorted.reduce((acc, row) => {
          const key = String(row.seasonYear ?? "");
          if (!acc.has(key)) acc.set(key, []);
          acc.get(key).push(row);
          return acc;
        }, new Map())
      : null;
    const groupedSeasons = groupBySeason
      ? Array.from(groupedRows.keys()).sort((a, b) => Number(b) - Number(a))
      : [];
    const singleSeasonLabel = !groupBySeason && sorted.length ? sorted[0].seasonYear : null;
    const rowsBySeason = groupBySeason ? groupedRows : new Map([[String(singleSeasonLabel ?? ""), sorted]]);
    if (sortBy === "game") {
      for (const [seasonKey, items] of rowsBySeason.entries()) {
        rowsBySeason.set(seasonKey, items.slice().sort(byGame));
      }
    }

    return (
      <div className="tableWrap">
        <table className="table postseasonTable">
          <colgroup>
            {showSeasonColumn ? <col style={{ width: `${seasonWidth}%` }} /> : null}
            {showGameColumn ? <col style={{ width: `${gameWidth}%` }} /> : null}
            <col style={{ width: `${teamWidth}%` }} />
            <col style={{ width: `${recordWidth}%` }} />
            {showConfRecord ? <col style={{ width: `${confRecordWidth}%` }} /> : null}
            <col style={{ width: `${resultWidth}%` }} />
            <col style={{ width: `${teamWidth}%` }} />
            <col style={{ width: `${recordWidth}%` }} />
            {showConfRecord ? <col style={{ width: `${confRecordWidth}%` }} /> : null}
            {showWinningCoach ? <col style={{ width: `${winningCoachWidth}%` }} /> : null}
          </colgroup>
          <thead />
          <tbody>
          {groupBySeason
            ? groupedSeasons.map((season, seasonIdx) => (
                <Fragment key={season || "season"}>
                  <tr className="scheduleWeekRow">
                    <th colSpan={seasonHeaderColCount} className="scheduleWeekHeaderTop">
                      {season || "-"}
                    </th>
                  </tr>
                  <tr className="scheduleWeekHeader">
                    {showSeasonColumn ? <th>Season</th> : null}
                    {showGameColumn ? <th>Game</th> : null}
                    <th>{winnerLabel}</th>
                    <th>Record</th>
                    {showConfRecord ? <th>CONFERENCE</th> : null}
                    <th>Result</th>
                    <th>Opponent</th>
                    <th>Record</th>
                    {showConfRecord ? <th>CONFERENCE</th> : null}
                    {showWinningCoach ? <th>Winning Coach</th> : null}
                  </tr>
                  {(rowsBySeason.get(season) || []).map((r, idx) => (
                    <Fragment key={`${season}-${r.week}-${idx}`}>
                      <tr>
                        {showSeasonColumn ? <td>{r.seasonYear}</td> : null}
                        {showGameColumn ? (
                        <td>
                          {r.bowlName ? (
                            <Link
                              to={`/postseason/bowl?name=${encodeURIComponent(r.bowlName)}`}
                              style={{ color: "inherit", textDecoration: "none" }}
                              title="View bowl results"
                            >
                              <span className="postseasonBowlCell">
                                {r.bowlLogoUrl ? (
                                  <img
                                    className="postseasonBowlLogo"
                                    src={r.bowlLogoUrl}
                                    alt=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : null}
                                <span>{normalizeBowlLabel(r.bowlName)}</span>
                              </span>
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        ) : null}
                        <td>
                          <Link to={`/team/${r.leftTgid || r.awayTgid}`} className="matchupTeam" title="View team page">
                            <TeamCell name={r.leftName || r.awayName} logoUrl={r.leftLogo || r.awayLogo} />
                          </Link>
                        </td>
                        <td>{r.leftRecord || "-"}</td>
                        {showConfRecord ? <td>{r.leftConfRecord || "-"}</td> : null}
                        <td>
                          {(r.leftScore ?? r.awayScore) ?? "-"} - {(r.rightScore ?? r.homeScore) ?? "-"}
                        </td>
                        <td>
                          <Link to={`/team/${r.rightTgid || r.homeTgid}`} className="matchupTeam" title="View team page">
                            <TeamCell name={r.rightName || r.homeName} logoUrl={r.rightLogo || r.homeLogo} />
                          </Link>
                        </td>
                        <td>{r.rightRecord || "-"}</td>
                        {showConfRecord ? <td>{r.rightConfRecord || "-"}</td> : null}
                        {showWinningCoach ? <td>{r.leftCoachName || "-"}</td> : null}
                      </tr>
                    </Fragment>
                  ))}
                  {seasonIdx < (groupBySeason ? groupedSeasons.length : 1) - 1 ? (
                    <tr className="scheduleWeekSpacer" aria-hidden="true">
                      <td colSpan={seasonHeaderColCount} />
                    </tr>
                  ) : null}
                </Fragment>
              ))
            : (
                <>
                  <tr className="scheduleWeekHeader">
                    {showSeasonColumn ? <th>Season</th> : null}
                    {showGameColumn ? <th>Game</th> : null}
                    <th>{winnerLabel}</th>
                    <th>Record</th>
                    {showConfRecord ? <th>CONFERENCE</th> : null}
                    <th>Result</th>
                    <th>Opponent</th>
                    <th>Record</th>
                    {showConfRecord ? <th>CONFERENCE</th> : null}
                    {showWinningCoach ? <th>Winning Coach</th> : null}
                  </tr>
                  {(rowsBySeason.get(String(singleSeasonLabel ?? "")) || []).map((r, idx) => (
                    <Fragment key={`${r.seasonYear}-${r.week}-${idx}`}>
                      <tr>
                        {showSeasonColumn ? <td>{r.seasonYear}</td> : null}
                        {showGameColumn ? (
                          <td>
                            {r.bowlName ? (
                              <Link
                                to={`/postseason/bowl?name=${encodeURIComponent(r.bowlName)}`}
                                style={{ color: "inherit", textDecoration: "none" }}
                                title="View bowl results"
                              >
                                <span className="postseasonBowlCell">
                                  {r.bowlLogoUrl ? (
                                    <img
                                      className="postseasonBowlLogo"
                                      src={r.bowlLogoUrl}
                                      alt=""
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : null}
                                  <span>{normalizeBowlLabel(r.bowlName)}</span>
                                </span>
                              </Link>
                            ) : (
                              "-"
                            )}
                        </td>
                        ) : null}
                        <td>
                          <Link to={`/team/${r.leftTgid || r.awayTgid}`} className="matchupTeam" title="View team page">
                            <TeamCell name={r.leftName || r.awayName} logoUrl={r.leftLogo || r.awayLogo} />
                          </Link>
                        </td>
                        <td>{r.leftRecord || "-"}</td>
                        {showConfRecord ? <td>{r.leftConfRecord || "-"}</td> : null}
                        <td>
                          {(r.leftScore ?? r.awayScore) ?? "-"} - {(r.rightScore ?? r.homeScore) ?? "-"}
                        </td>
                        <td>
                          <Link to={`/team/${r.rightTgid || r.homeTgid}`} className="matchupTeam" title="View team page">
                            <TeamCell name={r.rightName || r.homeName} logoUrl={r.rightLogo || r.homeLogo} />
                          </Link>
                        </td>
                        <td>{r.rightRecord || "-"}</td>
                        {showConfRecord ? <td>{r.rightConfRecord || "-"}</td> : null}
                        {showWinningCoach ? <td>{r.leftCoachName || "-"}</td> : null}
                      </tr>
                    </Fragment>
                  ))}
                </>
              )}
          </tbody>
        </table>
      </div>
    );
  }

  useEffect(() => {
    (async () => {
      try {
        const id = await getActiveDynastyId();
        setDynastyId(id ?? null);
      } catch {
        setDynastyId(null);
      }
    })();
  }, []);

  const confOptions = useMemo(() => {
    if (tab !== "confChamp") return [];
    return Array.from(
      new Set(
        rows
          .map((r) => r.homeConfName || r.awayConfName)
          .filter((name) => name && String(name).trim())
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
  }, [rows, tab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = String(params.get("tab") || "").trim();
    if (q === "confChamp" || q === "bowls" || q === "bracket") {
      setTab(q);
    }
    const seasonParam = params.get("season");
    if (seasonParam === "All") {
      setSeasonYear("All");
    } else if (seasonParam) {
      setSeasonYear(seasonParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (!dynastyId) return;
    setViewReady(false);
    let alive = true;
    (async () => {
      const fromSearch = readViewFromSearch(location.search);
      if (fromSearch) {
        setView(fromSearch);
        if (alive) setViewReady(true);
        return;
      }
      const saved = await readViewPreference({ page: "postseason", dynastyId });
      if (!alive) return;
      if (saved) setView(saved);
      setViewReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [dynastyId, location.search]);

  useLayoutEffect(() => {
    if (!dynastyId) return;
    const fromSearch = readViewFromSearch(location.search);
    if (fromSearch) {
      setView(fromSearch);
      return;
    }
    const cached = readCachedViewPreference({ dynastyId });
    if (cached) setView(cached);
  }, [dynastyId, location.search]);

  useEffect(() => {
    if (!dynastyId || !viewReady) return;
    const normalizedView = view === "table" ? "table" : "cards";
    const params = new URLSearchParams(location.search);
    const current = params.get("view");
    if (normalizedView !== current) {
      params.set("view", normalizedView);
      navigate({ pathname: "/postseason", search: `?${params.toString()}` }, { replace: true });
    }
    writeViewPreference({ page: "postseason", dynastyId, view: normalizedView });
  }, [dynastyId, view, navigate, location.search]);

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
    let alive = true;
    (async () => {
      const map = await loadConferenceLogoMap();
      if (!alive) return;
      setConfLogoMap(map);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (dynastyId == null) {
      setAvailableSeasons([]);
      setSeasonYear("");
      setSeasonsLoaded(false);
      return;
    }

    let alive = true;
    setSeasonsLoaded(false);
    (async () => {
      const allGames = await db.games.where({ dynastyId }).toArray();
      if (!alive) return;
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setAvailableSeasons(years);
      setSeasonsLoaded(true);
      if (seasonYear === "All") return;
      const picked = pickSeasonFromList({ currentSeason: seasonYear, availableSeasons: years });
      if (picked != null) setSeasonYear(picked);
    })();
    return () => {
      alive = false;
    };
  }, [dynastyId]);

  useEffect(() => {
    if (seasonYear !== "" && seasonYear !== "All") {
      writeSeasonFilter(seasonYear);
    }
  }, [seasonYear]);

  useEffect(() => {
    setBowlFilter("");
  }, [tab]);

useEffect(() => {
  setConfFilter("");
}, [tab]);

  useEffect(() => {
    if (dynastyId == null || seasonYear === "") {
      setRows([]);
      setPlayoffCols({
        "CFP - Round 1": [],
        "CFP - Quarterfinals": [],
        "CFP - Semifinals": [],
        "National Championship": [],
      });
      setLoadingRows(false);
      return;
    }

    let alive = true;
    setLoadingRows(true);

    (async () => {
      try {
        const isAllSeasons = seasonYear === "All";
        const year = Number(seasonYear);
        const [gamesRaw, teamSeasonRows, teamLogoRows, overrideRows, bowlRows, coachRows] = await Promise.all([
          isAllSeasons
            ? db.games.where({ dynastyId }).toArray()
            : db.games.where("[dynastyId+seasonYear]").equals([dynastyId, year]).toArray(),
          isAllSeasons
            ? db.teamSeasons.where({ dynastyId }).toArray()
            : db.teamSeasons.where("[dynastyId+seasonYear]").equals([dynastyId, year]).toArray(),
          db.teamLogos.where({ dynastyId }).toArray(),
          db.logoOverrides.where({ dynastyId }).toArray(),
          isAllSeasons
            ? db.bowlGames.where({ dynastyId }).toArray()
            : db.bowlGames.where("[dynastyId+seasonYear]").equals([dynastyId, year]).toArray(),
          isAllSeasons
            ? db.coaches.where({ dynastyId }).toArray()
            : db.coaches.where("[dynastyId+seasonYear]").equals([dynastyId, year]).toArray(),
        ]);

        if (!alive) return;

      const nameByKey = new Map(
        teamSeasonRows.map((t) => [`${t.seasonYear}|${t.tgid}`, `${t.tdna} ${t.tmna}`.trim()])
      );
      const confByKey = new Map(
        teamSeasonRows.map((t) => [`${t.seasonYear}|${t.tgid}`, String(t.cgid ?? "")])
      );
      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [r.tgid, r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [r.tgid, r.url]));
      const logoFor = (tgid) =>
        overrideByTgid.get(tgid) || baseLogoByTgid.get(tgid) || FALLBACK_LOGO;

      const coachNameByKey = new Map(
        coachRows.map((c) => {
          const name = `${String(c.firstName ?? "").trim()} ${String(c.lastName ?? "").trim()}`.trim();
          return [`${c.seasonYear}|${c.tgid}`, name || "-"];
        })
      );
      const coachNameFor = (season, tgid) =>
        coachNameByKey.get(`${season}|${tgid}`) || "-";

      const bowlByKey = new Map();
      for (const r of bowlRows) {
        if (r.sewn == null || r.sgnm == null) continue;
        if (!String(r.bnme ?? "").trim()) continue;
        bowlByKey.set(`${r.seasonYear ?? ""}|${r.sewn}|${r.sgnm}`, String(r.bnme).trim());
      }

      const postseasonLogoFor = createPostseasonLogoResolver(postseasonLogoMap);

      const runningBySeason = new Map();
      const gamesBySeason = new Map();
      for (const g of gamesRaw) {
        const seasonKey = String(g.seasonYear);
        if (!gamesBySeason.has(seasonKey)) gamesBySeason.set(seasonKey, []);
        gamesBySeason.get(seasonKey).push(g);
      }
      for (const [seasonKey, seasonGames] of gamesBySeason.entries()) {
        const confByTgid = new Map(
          teamSeasonRows
            .filter((t) => String(t.seasonYear) === seasonKey)
            .map((t) => [String(t.tgid), String(t.cgid ?? "")])
        );
        runningBySeason.set(seasonKey, buildRunningRecords({ games: seasonGames, confByTgid }));
      }

      const postseasonGames = gamesRaw
        .filter((g) => bowlByKey.has(`${g.seasonYear}|${g.week}|${g.sgnm}`))
        .map((g) => {
          const bowlNameRaw = bowlByKey.get(`${g.seasonYear}|${g.week}|${g.sgnm}`) || "";
          const bowlName = /^nat championship$/i.test(bowlNameRaw)
            ? "National Championship"
            : bowlNameRaw;
          const bowlLogoUrl = bowlName ? postseasonLogoFor(bowlName) : "";

          const homeName =
            nameByKey.get(`${g.seasonYear}|${g.homeTgid}`) || `TGID ${g.homeTgid}`;
          const awayName =
            nameByKey.get(`${g.seasonYear}|${g.awayTgid}`) || `TGID ${g.awayTgid}`;
          const hasScore = g.homeScore != null && g.awayScore != null;
          const homeWins = hasScore && Number(g.homeScore) > Number(g.awayScore);
          const awayWins = hasScore && Number(g.awayScore) > Number(g.homeScore);
          const winner = homeWins ? "home" : awayWins ? "away" : null;

          const homeId = String(g.homeTgid);
          const awayId = String(g.awayTgid);
          const homeKey = `${g.seasonYear}|${homeId}`;
          const awayKey = `${g.seasonYear}|${awayId}`;
          const homeConfId = confByKey.get(homeKey);
          const awayConfId = confByKey.get(awayKey);
          const homeConfName = getConferenceName(homeConfId);
          const awayConfName = getConferenceName(awayConfId);
          const runningForSeason = runningBySeason.get(String(g.seasonYear));
          const homeRec =
            runningForSeason?.getRecordAtWeek(homeId, g.week) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const awayRec =
            runningForSeason?.getRecordAtWeek(awayId, g.week) || { w: 0, l: 0, t: 0, cw: 0, cl: 0, ct: 0 };
          const homeRecordText = formatRecord(homeRec);
          const awayRecordText = formatRecord(awayRec);

          const leftIsHome = homeWins || (!homeWins && !awayWins);
          const leftTgid = leftIsHome ? g.homeTgid : g.awayTgid;
          const rightTgid = leftIsHome ? g.awayTgid : g.homeTgid;
          const leftName = leftIsHome ? homeName : awayName;
          const rightName = leftIsHome ? awayName : homeName;
          const leftLogo = leftIsHome ? logoFor(g.homeTgid) : logoFor(g.awayTgid);
          const rightLogo = leftIsHome ? logoFor(g.awayTgid) : logoFor(g.homeTgid);
          const leftScore = leftIsHome ? g.homeScore : g.awayScore;
          const rightScore = leftIsHome ? g.awayScore : g.homeScore;
          const leftRecord = leftIsHome ? homeRecordText : awayRecordText;
          const rightRecord = leftIsHome ? awayRecordText : homeRecordText;
          const leftConfRecord = leftIsHome
            ? formatRecord({ w: homeRec.cw, l: homeRec.cl, t: homeRec.ct })
            : formatRecord({ w: awayRec.cw, l: awayRec.cl, t: awayRec.ct });
          const rightConfRecord = leftIsHome
            ? formatRecord({ w: awayRec.cw, l: awayRec.cl, t: awayRec.ct })
            : formatRecord({ w: homeRec.cw, l: homeRec.cl, t: homeRec.ct });

          return {
            seasonYear: g.seasonYear,
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
            homeRecord: homeRecordText,
            awayRecord: awayRecordText,
            leftRecord,
            rightRecord,
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
            leftCoachName: coachNameFor(g.seasonYear, leftTgid),
            leftConfRecord,
            rightConfRecord,
            bowlName,
            bowlLogoUrl,
          };
        })
        .sort((a, b) => {
          if (a.seasonYear !== b.seasonYear) return b.seasonYear - a.seasonYear;
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
      } finally {
        if (alive) setLoadingRows(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, seasonYear, postseasonLogoMap]);

  const hasSeasons = availableSeasons.length > 0;
  const seasonOptions = useMemo(() => {
    if (tab === "bracket") return availableSeasons.map(String);
    return ["All", ...availableSeasons.map(String)];
  }, [availableSeasons, tab]);
  const isConfChamp = (name) =>
    /championship$/i.test(String(name ?? "")) && !/national championship$/i.test(String(name ?? ""));
  const normalizeBowlLabel = (name) => String(name ?? "").replace(/^cfp\s*-\s*/i, "").trim();
  const roundOrder = ["CFP - Round 1", "CFP - Quarterfinals", "CFP - Semifinals", "National Championship"];
  const roundRank = new Map(roundOrder.map((r, i) => [r, i]));
  const baseFilteredRows = useMemo(() => {
    const byName = (a, b) => String(a.bowlName).localeCompare(String(b.bowlName));
    if (tab === "confChamp") {
      return rows.filter((r) => isConfChamp(r.bowlName)).slice().sort(byName);
    }
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
    return [...nonPlayoff, ...playoffSorted];
  }, [rows, tab, roundRank]);
  const bowlOptions = useMemo(() => {
    if (tab !== "bowls") return [];
    const options = Array.from(
      new Set(
        baseFilteredRows
          .map((r) => r.bowlName)
          .filter((name) => name && !/cfp\s*-\s*round\s*1/i.test(String(name)))
      )
    ).sort((a, b) => normalizeBowlLabel(a).localeCompare(normalizeBowlLabel(b)));
    const natIndex = options.findIndex((name) => /national championship/i.test(String(name)));
    if (natIndex > 0) {
      const [nat] = options.splice(natIndex, 1);
      options.unshift(nat);
    }
    return options;
  }, [baseFilteredRows, tab]);

  if (dynastyId === undefined) {
    return null;
  }

  if (dynastyId === null) {
    return (
      <div>
        <div className="hrow">
          <h2>Postseason</h2>
        </div>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="hrow">
        <h2>Postseason</h2>
      </div>
      <div className="playerStatsCategoryRow">
        <button
          className={`toggleBtn playerStatsCategoryBtn${tab === "confChamp" ? " active" : ""}`}
          onClick={() => setTabAndUrl("confChamp")}
        >
          Conference Championships
        </button>
        <button
          className={`toggleBtn playerStatsCategoryBtn${tab === "bowls" ? " active" : ""}`}
          onClick={() => setTabAndUrl("bowls")}
        >
          Bowl Results
        </button>
        <button
          className={`toggleBtn playerStatsCategoryBtn${tab === "bracket" ? " active" : ""}`}
          onClick={() => setTabAndUrl("bracket")}
        >
          CFP Bracket
        </button>
      </div>
      <div className="playerStatsControlRow flexRowWrap">
        <div className="playerStatsFilters flexRowWrap">
          <select
            value={seasonYear}
            onChange={(e) => {
              const next = e.target.value;
              setSeasonYear(next);
              setBowlFilter("");
              setConfFilter("");
              if (next !== "All") {
                writeSeasonFilter(next);
              }
            }}
            disabled={!hasSeasons}
            aria-label="Season"
          >
            {!seasonsLoaded ? (
              <option value="">Loading seasons...</option>
            ) : !hasSeasons ? (
              <option value="">No seasons uploaded</option>
            ) : (
              seasonOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            )}
          </select>
          {tab === "bowls" ? (
            <select
              value={bowlFilter}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== "All" && seasonYear !== "All") {
                  setSeasonYear("All");
                }
                if (next !== "All") {
                  setView("table");
                }
                setBowlFilter(next);
              }}
              disabled={!bowlOptions.length}
              aria-label="Bowl"
            >
              <option value="" disabled style={{ display: "none" }}>
                Bowl
              </option>
              <option value="All">All</option>
              {bowlOptions.map((name) => (
                <option key={name} value={name}>
                  {normalizeBowlLabel(name)}
                </option>
              ))}
            </select>
          ) : null}
          {tab === "bowls" && (!bowlFilter || bowlFilter === "All") ? (
            <>
              <span className="playerStatsControlDivider" aria-hidden="true" />
              <div className="playerStatsViewToggle">
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
            </>
          ) : null}
          {tab === "confChamp" ? (
            <>
              <select
                value={confFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next !== "All" && seasonYear !== "All") {
                    setSeasonYear("All");
                  }
                  if (next === "All") {
                    const latest = availableSeasons[0];
                    if (latest != null) setSeasonYear(String(latest));
                  }
                  if (next !== "All") {
                    setView("table");
                  }
                  setConfFilter(next);
                }}
                disabled={!confOptions.length}
                aria-label="Conference"
              >
                <option value="" disabled style={{ display: "none" }}>
                  Conference
                </option>
                <option value="All">All</option>
                {confOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {!confFilter || confFilter === "All" ? (
                <>
                  <span className="playerStatsControlDivider" aria-hidden="true" />
                  <div className="playerStatsViewToggle">
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
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {!seasonsLoaded || loadingRows ? (
        <p className="kicker">Loading...</p>
      ) : !hasSeasons ? (
        <p className="kicker">No seasons uploaded yet for this dynasty.</p>
      ) : tab === "bracket" ? (
        seasonYear === "All" ? (
          <p className="kicker">Select a season to view the CFP bracket.</p>
        ) : (
        <>
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
                    <div className="bracketCard bracketCardEmpty matchupCard">
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
                          className={`bracketCard matchupCard ${isFinal ? "bracketCardFinal" : ""}`}
                        >
                      <div className="bracketMeta matchupMeta">
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

                          <div className="matchupRow">
                            <Link to={`/team/${g.homeTgid}`} className="matchupTeam" title="View team page">
                              <div className="bracketTeam">
                                <img className="matchupLogo" src={g.homeLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                <span className="matchupTeamName">{g.homeName}</span>
                                {isFinal && homeWins ? <span className="bracketPill">Champion</span> : null}
                              </div>
                            </Link>
                            <span className="matchupScore">
                              {g.homeScore ?? "-"}
                              {homeWins ? <span className="winnerCaret" aria-hidden="true" /> : null}
                            </span>
                          </div>
                          <div className="matchupMeta">
                            ({g.homeRecord}, {g.homeConfRecord} {g.homeConfName})
                          </div>

                          <div className="matchupRow">
                            <Link to={`/team/${g.awayTgid}`} className="matchupTeam" title="View team page">
                              <div className="bracketTeam">
                                <img className="matchupLogo" src={g.awayLogo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                <span className="matchupTeamName">{g.awayName}</span>
                                {isFinal && awayWins ? <span className="bracketPill">Champion</span> : null}
                              </div>
                            </Link>
                            <span className="matchupScore">
                              {g.awayScore ?? "-"}
                              {awayWins ? <span className="winnerCaret" aria-hidden="true" /> : null}
                            </span>
                          </div>
                          <div className="matchupMeta">
                            ({g.awayRecord}, {g.awayConfRecord} {g.awayConfName})
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="bracketTableWrap">
            {[
              { key: "CFP - Round 1", label: "Round 1" },
              { key: "CFP - Quarterfinals", label: "Round 2" },
              { key: "CFP - Semifinals", label: "Round 3" },
              { key: "National Championship", label: "National Championship" },
            ].map((round) => {
              const list = playoffCols[round.key] || [];
              if (list.length === 0) return null;
              return (
                <div key={round.key} className="bracketTableGroup">
                  <h3 className="bracketRoundTitle">{round.label}</h3>
                  {renderBowlFilteredTable(list, {
                    showWinningCoach: round.key === "National Championship",
                    winnerLabel: round.key === "National Championship" ? "Champion" : "Winner",
                    normalizeBowlLabel: (name) => String(name ?? "").replace(/^cfp\s*-\s*/i, "").trim(),
                  })}
                </div>
              );
            })}
          </div>
        </>
        )
      ) : (() => {
        let filtered = baseFilteredRows.slice();

        const forcedTable =
          (tab === "confChamp" && confFilter && confFilter !== "All") ||
          (tab === "bowls" && bowlFilter && bowlFilter !== "All");
        const effectiveView = forcedTable ? "table" : view;

        if (tab === "bowls") {
          if (bowlFilter && bowlFilter !== "All") {
            filtered = filtered.filter((r) => r.bowlName === bowlFilter);
          }

          const bowlHeaderLogo = filtered.find((r) => r.bowlLogoUrl)?.bowlLogoUrl || "";
          const bowlHeaderName = normalizeBowlLabel(bowlFilter) || bowlFilter;
          const showWinningCoach = /national championship/i.test(bowlFilter);

          return (
            <>
              {filtered.length === 0 ? (
                <p className="kicker">No games found for that bowl.</p>
              ) : bowlFilter && bowlFilter !== "All" ? (
                <>
                  <div className="bowlFilterHeader">
                    {bowlHeaderLogo ? (
                      <img
                        className="bowlFilterLogo"
                        src={bowlHeaderLogo}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </div>
                  {renderBowlFilteredTable(filtered, { showWinningCoach })}
                </>
              ) : effectiveView === "table" ? (
                renderBowlFilteredTable(filtered, { showWinningCoach: false, groupBySeason: seasonYear === "All" })
              ) : (
                renderMatchupCards(filtered, seasonYear)
              )}
            </>
          );
        }

        if (tab === "confChamp") {
          const isAllConfs = !confFilter || confFilter === "All";
          if (!isAllConfs) {
            filtered = filtered.filter((r) => {
              const confName = r.homeConfName || r.awayConfName;
              return confName === confFilter;
            });
          }

          const confHeaderLogo = isAllConfs ? "" : (filtered[0]?.bowlLogoUrl || "");
          const confHeaderName = isAllConfs
            ? ""
            : String(filtered[0]?.bowlName ?? confFilter)
                .replace(/^cfp\s*-\s*/i, "")
                .trim();

          return (
            <>
              {filtered.length === 0 ? (
                <p className="kicker">No games found for this season.</p>
              ) : !isAllConfs ? (
                <>
                  <div className="bowlFilterHeader">
                    {confHeaderLogo ? (
                      <img
                        className="bowlFilterLogo"
                        src={confHeaderLogo}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    {confHeaderName ? (
                      <h2 style={{ marginTop: 6, marginBottom: 0, textAlign: "center" }}>
                        {confHeaderName}
                      </h2>
                    ) : null}
                  </div>
                  {renderBowlFilteredTable(filtered, {
                    showWinningCoach: false,
                    showConfRecord: true,
                    showSeasonColumn: !isAllConfs,
                    showGameColumn: isAllConfs,
                    groupBySeason: isAllConfs && seasonYear === "All",
                    sortBy: "game",
                  })}
                </>
              ) : effectiveView === "table" ? (
                renderBowlFilteredTable(filtered, {
                  showWinningCoach: false,
                  showConfRecord: true,
                  showSeasonColumn: !isAllConfs,
                  showGameColumn: isAllConfs,
                  groupBySeason: isAllConfs && seasonYear === "All",
                  sortBy: "game",
                })
              ) : (
                renderMatchupCards(filtered, seasonYear)
              )}
            </>
          );
        }

        if (filtered.length === 0) {
          return <p className="kicker">No games found for this season.</p>;
        }

        return renderMatchupCards(filtered, seasonYear);
      })()}
    </div>
  );
}

