import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [confBlocks, setConfBlocks] = useState([]); // [{ confName, teams: [...] }]
  const [divisionFilter, setDivisionFilter] = useState("FBS");

  const [confLogoByName, setConfLogoByName] = useState(new Map());
  const fbsConfs = useMemo(
    () =>
      new Set(
        [
          "ACC",
          "Sun Belt",
          "SEC",
          "PAC",
          "Mt West",
          "MAC",
          "Independent",
          "CUSA",
          "Big Ten",
          "Big 12",
          "American",
        ].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ""))
      ),
    []
  );

  function isFbsConference(confName) {
    const key = String(confName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return fbsConfs.has(key);
  }

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
    if (season) setSeasonYear(Number(season));
  }, [location.search]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const map = await loadConferenceLogoMap();
      if (!alive) return;
      setConfLogoByName(map);
    })();

    return () => {
      alive = false;
    };
  }, []);


  useEffect(() => {
    if (!dynastyId) {
      setSeasonYear(null);
      setConfBlocks([]);
      return;
    }

    (async () => {
      const [latestTeams, teamLogoRows, overrideRows] = await Promise.all([
        db.latestTeamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      const years = Array.from(
        new Set(latestTeams.map((t) => Number(t.seasonYear)).filter((n) => Number.isFinite(n)))
      ).sort((a, b) => b - a);
      const latest = years[0] ?? null;
      setSeasonYear((cur) => (cur == null ? latest : cur));

      if (!latestTeams.length || !latest) {
        setConfBlocks([]);
        return;
      }

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));
      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      const byConf = new Map();

      for (const t of latestTeams) {
        const tgid = String(t.tgid);
        const name = `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
        const confName = getConferenceName(t.cgid);
        const isFbs = isFbsConference(confName);
        if (divisionFilter === "FBS" && !isFbs) continue;
        if (divisionFilter === "FCS" && isFbs) continue;

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
  }, [dynastyId, divisionFilter, fbsConfs]);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) return;
    const params = new URLSearchParams(location.search);
    params.set("season", String(seasonYear));
    navigate({ pathname: "/teams", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, navigate, location.search]);

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
      <div className="hrow">
        <h2>Teams</h2>
      </div>
      <div className="playerStatsControlRow flexRowWrap">
        <div className="playerStatsFilters flexRowWrap">
          <select
            aria-label="Division"
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
          >
            <option value="All">All</option>
            <option value="FBS">FBS</option>
            <option value="FCS">FCS</option>
          </select>
        </div>
      </div>
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
            {confLogoByName.get(normalizeConfKey(c.confName)) ? (
                <img
                src={confLogoByName.get(normalizeConfKey(c.confName))}
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

