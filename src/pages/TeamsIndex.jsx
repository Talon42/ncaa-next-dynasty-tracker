import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { loadConferenceLogoMap, normalizeConfKey } from "../logoService";

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

export default function TeamsIndex() {
  const [dynastyId, setDynastyId] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [confBlocks, setConfBlocks] = useState([]); // [{ confName, teams: [...] }]

  const [confLogoByName, setConfLogoByName] = useState(new Map());

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
  (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}logos/conference_logos.csv`, { cache: "no-store" });
      if (!res.ok) return;

      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(Boolean);

      // Expected header: Conference,URL
      const map = new Map();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [confName, url] = line.split(",");
        if (!confName || !url) continue;

        map.set(confName.trim(), url.trim());
      }

      setConfLogoByName(map);
    } catch {
      // Silent failure by design
      setConfLogoByName(new Map());
    }
  })();
}, []);


  useEffect(() => {
    if (!dynastyId) {
      setSeasonYear(null);
      setConfBlocks([]);
      return;
    }

    (async () => {
      const all = await db.teamSeasons.where({ dynastyId }).toArray();
      const years = Array.from(new Set(all.map((t) => t.seasonYear))).sort((a, b) => b - a);
      const latest = years[0] ?? null;
      setSeasonYear(latest);

      if (!latest) {
        setConfBlocks([]);
        return;
      }

      const [teamSeasons, teamLogoRows, overrideRows] = await Promise.all([
        db.teamSeasons.where({ dynastyId, seasonYear: latest }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));
      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      const byConf = new Map();

      for (const t of teamSeasons) {
        const tgid = String(t.tgid);
        const name = `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
        const confName = getConferenceName(t.cgid);

        if (!byConf.has(confName)) byConf.set(confName, []);
        byConf.get(confName).push({
          tgid,
          name,
          logoUrl: logoFor(tgid),
        });
      }

      const blocks = Array.from(byConf.entries())
        .map(([confName, teams]) => ({
          confName,
          teams: teams.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.confName.localeCompare(b.confName));

      setConfBlocks(blocks);
    })();
  }, [dynastyId]);

  const hasDynasty = !!dynastyId;
  const hasTeams = confBlocks.length > 0;

  if (!hasDynasty) {
    return (
      <div>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="teamsPage">
      {!seasonYear ? <p className="kicker">No seasons uploaded yet.</p> : null}

      {!hasTeams ? (
        <p className="kicker">
          No teams found yet. Import a season via <b>Upload New Season</b>.
        </p>
      ) : (
        <div className="confGrid">
          {confBlocks.map((c) => (
            <div key={c.confName} className="confCard">
            <div
            className="confTitle"
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
            }}
            >
            {confLogoByName.get(c.confName) ? (
                <img
                src={confLogoByName.get(c.confName)}
                alt=""
                style={{ width: 20, height: 20, objectFit: "contain" }}
                loading="lazy"
                referrerPolicy="no-referrer"
                />
            ) : null}
            <span>{c.confName}</span>
            </div>
              <div className="confTeams">
                {c.teams.map((t) => (
                  <Link
                    key={t.tgid}
                    to={`/team/${t.tgid}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                    title="View team page"
                  >
                    <div className="confTeamRow">
                      <TeamCell name={t.name} logoUrl={t.logoUrl} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
