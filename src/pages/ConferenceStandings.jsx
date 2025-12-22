// src/pages/ConferenceStandings.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { loadConferenceLogoMap, normalizeConfKey } from "../logoService";

const FALLBACK_TEAM_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";

const FALLBACK_CONF_LOGO = FALLBACK_TEAM_LOGO;

/**
 * Reused visual pattern from Team.jsx (team logo + name in a row)
 */
function TeamCell({ name, logoUrl }) {
  const [src, setSrc] = useState(logoUrl || FALLBACK_TEAM_LOGO);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK_TEAM_LOGO);
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
          if (src !== FALLBACK_TEAM_LOGO) setSrc(FALLBACK_TEAM_LOGO);
        }}
      />
      <span>{name}</span>
    </div>
  );
}

/**
 * Conference header row (logo + name)
 */
function ConfHeader({ name, logoUrl, size = 44 }) {
  const [src, setSrc] = useState(logoUrl || FALLBACK_CONF_LOGO);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK_CONF_LOGO);
  }, [logoUrl]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: size }}>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ width: size, height: size, objectFit: "contain", display: "inline-block" }}
        onError={() => {
          if (src !== FALLBACK_CONF_LOGO) setSrc(FALLBACK_CONF_LOGO);
        }}
      />
      <span>{name}</span>
    </div>
  );
}

export default function ConferenceStandings() {
  const location = useLocation();

  const [dynastyId, setDynastyId] = useState(null);

  // Filters
  const [season, setSeason] = useState(""); // seasonYear as string
  const [cgid, setCgid] = useState("All"); // "All" or conference id as string

  // Data
  const [seasons, setSeasons] = useState([]); // [{key,label}]
  const [teamsById, setTeamsById] = useState(new Map()); // tgid -> {id,name,mascot,cgid}
  const [gamesForSeason, setGamesForSeason] = useState([]); // cached season games

  // Team logos (same tables used in Team.jsx)
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

  // Conference logos from /public/logos/conference_logos.csv
  const [confLogoByKey, setConfLogoByKey] = useState(new Map()); // key -> url

  // Standings
  const [standings, setStandings] = useState([]); // rows for single selected conf
  const [standingsByConf, setStandingsByConf] = useState(new Map()); // confId -> rows (for All)

  // ✅ When navigating to /standings?conf=All (sidebar), force All
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const conf = params.get("conf");
    if (conf === "All") setCgid("All");
  }, [location.search]);

  /* -------------------------------------------------- */
  /* Active dynasty                                     */
  /* -------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = await getActiveDynastyId();
      if (!alive) return;
      setDynastyId(id || null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* -------------------------------------------------- */
/* Load conference logos (static)                      */
/* -------------------------------------------------- */
useEffect(() => {
  let alive = true;

  (async () => {
    const map = await loadConferenceLogoMap();
    if (!alive) return;
    setConfLogoByKey(map);
  })();

  return () => {
    alive = false;
  };
}, []);


  const teamLogoFor = (id) =>
    overrideByTgid.get(String(id)) || logoByTgid.get(String(id)) || FALLBACK_TEAM_LOGO;

  const confLogoFor = (confId) => {
    const confName = getConferenceName(confId);
    return (
      confLogoByKey.get(normalizeConfKey(String(confId))) ||
      confLogoByKey.get(normalizeConfKey(confName)) ||
      FALLBACK_CONF_LOGO
    );
  };

  /* -------------------------------------------------- */
  /* Load seasons list                                  */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!dynastyId) return;
    let alive = true;

    (async () => {
      const rows = await db.teamSeasons.where("dynastyId").equals(dynastyId).toArray();

      const keys = new Map();
      for (const r of rows) {
        const k = String(r.seasonYear ?? "");
        if (k) keys.set(k, k);
      }

      const list = Array.from(keys.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => (a.key < b.key ? 1 : -1)); // descending

      if (!alive) return;
      setSeasons(list);

      if (!season && list.length) setSeason(list[0].key);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynastyId]);

  /* -------------------------------------------------- */
  /* Load team snapshot for selected season              */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!dynastyId || !season) return;
    let alive = true;

    (async () => {
      const yearNum = Number(season);

      const rows = await db.teamSeasons.where({ dynastyId, seasonYear: yearNum }).toArray();

      const map = new Map();
      for (const r of rows) {
        const id = String(r.tgid ?? "");
        if (!id) continue;

        const name = String(r.tdna ?? "").trim();
        const mascot = String(r.tmna ?? "").trim();
        const conf = String(r.cgid ?? "").trim();

        map.set(id, { id, name, mascot, cgid: conf });
      }

      if (!alive) return;
      setTeamsById(map);

      if (!cgid) setCgid("All");
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynastyId, season]);

  /* -------------------------------------------------- */
  /* Load games for selected season (cached)             */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!dynastyId || !season) {
      setGamesForSeason([]);
      return;
    }

    let alive = true;

    (async () => {
      const yearNum = Number(season);
      const games = await db.games.where({ dynastyId, seasonYear: yearNum }).toArray();
      if (!alive) return;
      setGamesForSeason(games);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, season]);

  /* -------------------------------------------------- */
  /* Load team logos (same source as Team.jsx)           */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!dynastyId) {
      setLogoByTgid(new Map());
      setOverrideByTgid(new Map());
      return;
    }

    let alive = true;

    (async () => {
      const [teamLogoRows, overrideRows] = await Promise.all([
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      setLogoByTgid(new Map(teamLogoRows.map((r) => [String(r.tgid), r.url])));
      setOverrideByTgid(new Map(overrideRows.map((r) => [String(r.tgid), r.url])));
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId]);

  const availableConfs = useMemo(() => {
    const seen = new Set();
    for (const t of teamsById.values()) if (t.cgid) seen.add(String(t.cgid));
    return Array.from(seen).sort((a, b) => Number(a) - Number(b));
  }, [teamsById]);

  /* -------------------------------------------------- */
  /* Standings computation                              */
  /* -------------------------------------------------- */
  const computeStandingsForConf = (confId) => {
    const confTeamIds = new Set(
      Array.from(teamsById.values())
        .filter((t) => String(t.cgid) === String(confId))
        .map((t) => t.id)
    );

    const rec = new Map();
    for (const id of confTeamIds) {
      rec.set(id, {
        id,
        OverallW: 0,
        OverallL: 0,
        OverallT: 0,

        ConfW: 0,
        ConfL: 0,
        ConfT: 0,

        PF: 0,
        PA: 0,
      });
    }

    for (const g of gamesForSeason) {
      const homeId = String(g.homeTgid ?? "");
      const awayId = String(g.awayTgid ?? "");

      const hs = Number(g.homeScore);
      const as = Number(g.awayScore);
      const played = Number.isFinite(hs) && Number.isFinite(as);
      if (!played) continue;

      const homeIn = confTeamIds.has(homeId);
      const awayIn = confTeamIds.has(awayId);

      // Overall updates for teams in this conference
      if (homeIn) {
        const home = rec.get(homeId);
        home.PF += hs;
        home.PA += as;

        if (hs > as) home.OverallW += 1;
        else if (hs < as) home.OverallL += 1;
        else home.OverallT += 1;
      }

      if (awayIn) {
        const away = rec.get(awayId);
        away.PF += as;
        away.PA += hs;

        if (as > hs) away.OverallW += 1;
        else if (as < hs) away.OverallL += 1;
        else away.OverallT += 1;
      }

      // Conf updates only if both teams are in this conference
      if (homeIn && awayIn) {
        const home = rec.get(homeId);
        const away = rec.get(awayId);

        if (hs > as) {
          home.ConfW += 1;
          away.ConfL += 1;
        } else if (hs < as) {
          away.ConfW += 1;
          home.ConfL += 1;
        } else {
          home.ConfT += 1;
          away.ConfT += 1;
        }
      }
    }

    const rows = Array.from(rec.values()).map((r) => {
      const t = teamsById.get(r.id);
      const name = t ? `${t.name}${t.mascot ? " " + t.mascot : ""}` : r.id;

      const confGp = r.ConfW + r.ConfL + r.ConfT;
      const confPct = confGp ? (r.ConfW + 0.5 * r.ConfT) / confGp : 0;

      return {
        ...r,
        name,
        logoUrl: teamLogoFor(r.id),
        ConfGP: confGp,
        ConfPCT: confPct,
        Diff: r.PF - r.PA,
      };
    });

    rows.sort((a, b) => {
      if (b.ConfPCT !== a.ConfPCT) return b.ConfPCT - a.ConfPCT;
      if (b.ConfW !== a.ConfW) return b.ConfW - a.ConfW;
      if (b.Diff !== a.Diff) return b.Diff - a.Diff;
      return a.name.localeCompare(b.name);
    });

    return rows;
  };

  /* -------------------------------------------------- */
  /* Compute standings for selected conference OR All    */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!dynastyId || !season || !teamsById.size) {
      setStandings([]);
      setStandingsByConf(new Map());
      return;
    }

    if (!cgid) return;

    if (cgid !== "All") {
      setStandingsByConf(new Map());
      setStandings(computeStandingsForConf(cgid));
      return;
    }

    const map = new Map();
    for (const confId of availableConfs) {
      map.set(confId, computeStandingsForConf(confId));
    }
    setStandings([]);
    setStandingsByConf(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dynastyId,
    season,
    cgid,
    teamsById,
    gamesForSeason,
    logoByTgid,
    overrideByTgid,
    availableConfs,
  ]);

  const hasSeasons = seasons.length > 0;

  const headerTitle = cgid === "All" ? "Conference Standings" : getConferenceName(cgid);
  const headerLogo = cgid === "All" ? null : confLogoFor(cgid);

  const Table = ({ rows, emptyText }) => (
    <table className="table">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Team</th>
          <th style={{ width: 110 }}>Overall</th>
          <th style={{ width: 110 }}>Conf</th>
          <th style={{ width: 90 }}>PF</th>
          <th style={{ width: 90 }}>PA</th>
          <th style={{ width: 90 }}>Diff</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="kicker" style={{ padding: "12px" }}>
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link
                  to={`/team/${r.id}`}
                  style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                  title="View team page"
                >
                  <TeamCell name={r.name} logoUrl={r.logoUrl} />
                </Link>
              </td>
              <td>
                {r.OverallW}-{r.OverallL}
                {r.OverallT ? `-${r.OverallT}` : ""}
              </td>
              <td>
                {r.ConfW}-{r.ConfL}
                {r.ConfT ? `-${r.ConfT}` : ""}
              </td>
              <td>{r.PF}</td>
              <td>{r.PA}</td>
              <td>{r.Diff}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="hrow" style={{ alignItems: "flex-start" }}>
        <h2 style={{ margin: 0 }}>
          {cgid === "All" ? (
            "Conference Standings"
          ) : (
            <ConfHeader name={headerTitle} logoUrl={headerLogo} size={44} />
          )}
        </h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Season</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)} disabled={!hasSeasons}>
              {!hasSeasons ? (
                <option value="">No seasons uploaded</option>
              ) : (
                seasons.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Conference</span>
            <select value={cgid} onChange={(e) => setCgid(e.target.value)} disabled={!teamsById.size}>
              <option value="All">All</option>
              {availableConfs.map((id) => (
                <option key={id} value={id}>
                  {getConferenceName(id)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {cgid === "All" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {availableConfs.map((confId) => {
            const rows = standingsByConf.get(confId) || [];
            const confName = getConferenceName(confId);
            const confLogo = confLogoFor(confId);

            return (
              <div key={confId} className="card" style={{ padding: 14 }}>
                <h3 style={{ marginTop: 0, marginBottom: 10 }}>
                  <ConfHeader name={confName} logoUrl={confLogo} size={44} />
                </h3>

                <Table rows={rows} emptyText="No conference games found for this season." />
              </div>
            );
          })}
        </div>
      ) : (
        <Table rows={standings} emptyText="No conference games found for this season/conference." />
      )}
    </div>
  );
}
