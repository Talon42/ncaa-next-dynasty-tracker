import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";

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

export default function Coaches() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dynastyId, setDynastyId] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [rows, setRows] = useState([]);

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
    if (!dynastyId) {
      setSeasonYear(null);
      setRows([]);
      return;
    }

    (async () => {
      const all = await db.coaches.where({ dynastyId }).toArray();
      const years = Array.from(new Set(all.map((c) => c.seasonYear))).sort((a, b) => b - a);
      const latest = years[0] ?? null;
      setSeasonYear((cur) => (cur == null ? latest : cur));
    })();
  }, [dynastyId]);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) {
      setRows([]);
      return;
    }

    (async () => {
      const [coaches, teamSeasons, teamLogoRows, overrideRows] = await Promise.all([
        db.coaches.where({ dynastyId, seasonYear }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      const baseLogoByTgid = new Map(teamLogoRows.map((r) => [String(r.tgid), r.url]));
      const overrideByTgid = new Map(overrideRows.map((r) => [String(r.tgid), r.url]));
      const logoFor = (id) =>
        overrideByTgid.get(String(id)) || baseLogoByTgid.get(String(id)) || FALLBACK_LOGO;

      const teamNameByTgid = new Map(
        teamSeasons.map((t) => {
          const name = `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
          return [String(t.tgid), name || `TGID ${t.tgid}`];
        })
      );

      const mapped = coaches.map((c) => {
        const tgid = String(c.tgid ?? "");
        return {
          ccid: String(c.ccid ?? ""),
          name: `${String(c.firstName ?? "").trim()} ${String(c.lastName ?? "").trim()}`.trim(),
          tgid,
          teamName: teamNameByTgid.get(tgid) || `TGID ${tgid}`,
          teamLogo: logoFor(tgid),
          isUser: c.isUser ? "User" : "CPU",
          prestige: c.hcPrestige,
          approval: c.approval,
        };
      });

      mapped.sort((a, b) => {
        const team = a.teamName.localeCompare(b.teamName);
        if (team !== 0) return team;
        return a.name.localeCompare(b.name);
      });

      setRows(mapped);
    })();
  }, [dynastyId, seasonYear]);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) return;
    const params = new URLSearchParams(location.search);
    params.set("season", String(seasonYear));
    navigate({ pathname: "/coaches", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, navigate, location.search]);

  if (!dynastyId) {
    return (
      <div>
        <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>
      </div>
    );
  }

  return (
    <div>
      {!seasonYear ? <p className="kicker">No seasons uploaded yet.</p> : null}

      {!rows.length ? (
        <p className="kicker">
          No coaches found yet. Import a season via <b>Upload New Season</b>.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Coach</th>
              <th>Team</th>
              <th style={{ width: 110 }}>User</th>
              <th style={{ width: 110 }}>Prestige</th>
              <th style={{ width: 110 }}>Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.ccid}-${r.tgid}`}>
                <td>
                  <Link to={`/coach/${r.ccid}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {r.name || `Coach ${r.ccid}`}
                  </Link>
                </td>
                <td>
                  <TeamCell name={r.teamName} logoUrl={r.teamLogo} />
                </td>
                <td>{r.isUser}</td>
                <td>{Number.isFinite(Number(r.prestige)) ? Number(r.prestige) : "-"}</td>
                <td>{Number.isFinite(Number(r.approval)) ? Number(r.approval) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
