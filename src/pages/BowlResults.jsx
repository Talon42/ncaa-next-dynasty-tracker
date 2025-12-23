import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
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

function bowlDisplayName(fullName) {
  const raw = String(fullName ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^cfp\s*-\s*/i, "").replace(/^college football playoff\s*-\s*/i, "");
}

export default function BowlResults() {
  const location = useLocation();
  const [dynastyId, setDynastyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [postseasonLogoMap, setPostseasonLogoMap] = useState(new Map());

  const bowlName = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("name") || "";
  }, [location.search]);

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
    if (!dynastyId || !bowlName) {
      setRows([]);
      return;
    }

    let alive = true;
    (async () => {
      const [gamesRaw, teamSeasonRows, teamLogoRows, overrideRows, bowlRows] = await Promise.all([
        db.games.where({ dynastyId }).toArray(),
        db.teamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
        db.bowlGames.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      const nameByKey = new Map();
      for (const t of teamSeasonRows) {
        nameByKey.set(`${t.seasonYear}|${t.tgid}`, `${t.tdna} ${t.tmna}`.trim());
      }

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [r.tgid, r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [r.tgid, r.url]));
      const logoFor = (tgid) =>
        overrideByTgid.get(tgid) || baseLogoByTgid.get(tgid) || FALLBACK_LOGO;

      const bowlByKey = new Map();
      for (const r of bowlRows) {
        if (r.seasonYear == null || r.sewn == null || r.sgnm == null) continue;
        if (!String(r.bnme ?? "").trim()) continue;
        bowlByKey.set(`${r.seasonYear}|${r.sewn}|${r.sgnm}`, String(r.bnme).trim());
      }

      const normalizedTarget = normalizeBowlName(bowlName);
      const postseasonLogoFor = createPostseasonLogoResolver(postseasonLogoMap);

      const filtered = gamesRaw
        .filter((g) => bowlByKey.has(`${g.seasonYear}|${g.week}|${g.sgnm}`))
        .map((g) => {
          const bnme = bowlByKey.get(`${g.seasonYear}|${g.week}|${g.sgnm}`) || "";
          return { game: g, bnme };
        })
        .filter(({ bnme }) => normalizeBowlName(bnme) === normalizedTarget)
        .map(({ game, bnme }) => {
          const homeName = nameByKey.get(`${game.seasonYear}|${game.homeTgid}`) || `TGID ${game.homeTgid}`;
          const awayName = nameByKey.get(`${game.seasonYear}|${game.awayTgid}`) || `TGID ${game.awayTgid}`;

          return {
            seasonYear: game.seasonYear,
            week: game.week,
            homeTgid: game.homeTgid,
            awayTgid: game.awayTgid,
            homeName,
            awayName,
            homeLogo: logoFor(game.homeTgid),
            awayLogo: logoFor(game.awayTgid),
            result:
              game.homeScore != null && game.awayScore != null ? `${game.homeScore} - ${game.awayScore}` : "—",
            bnme,
          };
        })
        .sort((a, b) => {
          if (a.seasonYear !== b.seasonYear) return b.seasonYear - a.seasonYear;
          if (a.week !== b.week) return a.week - b.week;
          return String(a.homeTgid).localeCompare(String(b.homeTgid));
        });

      setRows(filtered);
      setTitle(bowlDisplayName(bowlName));
      setLogoUrl(postseasonLogoFor(bowlName));
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, bowlName, postseasonLogoMap]);

  if (!dynastyId) {
    return (
      <div>
        <h2>Bowl Results</h2>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="hrow">
        <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>{title || "Bowl Results"}</span>
          {logoUrl ? (
            <img className="teamLogo" src={logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : null}
        </h2>
      </div>

      {!bowlName ? (
        <p className="kicker">No bowl selected.</p>
      ) : rows.length === 0 ? (
        <p className="kicker">No games found for this bowl.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Season</th>
              <th>Team</th>
              <th style={{ width: 140 }}>Result</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.seasonYear}-${r.week}-${idx}`}>
                <td data-label="Season">{r.seasonYear}</td>
                <td data-label="Team">
                  <Link
                    to={`/team/${r.homeTgid}`}
                    style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                    title="View team page"
                  >
                    <TeamCell name={r.homeName} logoUrl={r.homeLogo} />
                  </Link>
                </td>
                <td data-label="Result">{r.result}</td>
                <td data-label="Team">
                  <Link
                    to={`/team/${r.awayTgid}`}
                    style={{ color: "inherit", textDecoration: "none", display: "inline-block" }}
                    title="View team page"
                  >
                    <TeamCell name={r.awayName} logoUrl={r.awayLogo} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
