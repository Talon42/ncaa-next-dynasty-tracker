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
  const [sortKey, setSortKey] = useState("teamName");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const season = params.get("season");
    const sort = params.get("sort");
    const dir = params.get("dir");
    if (season) setSeasonYear(Number(season));
    if (sort) setSortKey(sort);
    if (dir === "asc" || dir === "desc") setSortDir(dir);
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
        const isNotHired = tgid === "511";
        const wins = Number(c.careerWins);
        const losses = Number(c.careerLosses);
        const hasWins = Number.isFinite(wins);
        const hasLosses = Number.isFinite(losses);
        const total = hasWins && hasLosses ? wins + losses : null;
        const winPct = total != null && total > 0 ? wins / total : null;
        return {
          ccid: String(c.ccid ?? ""),
          name: `${String(c.firstName ?? "").trim()} ${String(c.lastName ?? "").trim()}`.trim(),
          tgid,
          teamName: isNotHired ? "Not Hired" : teamNameByTgid.get(tgid) || `TGID ${tgid}`,
          teamLogo: logoFor(tgid),
          prestige: c.hcPrestige,
          approval: c.approval,
          isNotHired,
          careerWins: hasWins ? wins : null,
          careerLosses: hasLosses ? losses : null,
          winPct,
        };
      });

      setRows(mapped);
    })();
  }, [dynastyId, seasonYear]);

  useEffect(() => {
    if (!dynastyId || seasonYear == null) return;
    const params = new URLSearchParams(location.search);
    params.set("season", String(seasonYear));
    params.set("sort", sortKey);
    params.set("dir", sortDir);
    navigate({ pathname: "/coaches", search: `?${params.toString()}` }, { replace: true });
  }, [dynastyId, seasonYear, sortKey, sortDir, navigate, location.search]);

  function toComparable(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;

    const n = Number(String(v).trim());
    if (Number.isFinite(n)) return n;

    const s = String(v).trim();
    return s ? s.toLowerCase() : null;
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;
    const arr = [...rows];

    arr.sort((a, b) => {
      const av =
        key === "coachName"
          ? a.name
          : key === "teamName"
            ? a.teamName
            : key === "record"
              ? a.careerWins
              : key === "winPct"
                ? a.winPct
                : key === "prestige"
                  ? a.prestige
                  : key === "approval"
                    ? a.approval
                    : a.name;
      const bv =
        key === "coachName"
          ? b.name
          : key === "teamName"
            ? b.teamName
            : key === "record"
              ? b.careerWins
              : key === "winPct"
                ? b.winPct
                : key === "prestige"
                  ? b.prestige
                  : key === "approval"
                    ? b.approval
                    : b.name;

      const ca = toComparable(av);
      const cb = toComparable(bv);

      if (ca === null && cb === null) return 0;
      if (ca === null) return 1;
      if (cb === null) return -1;

      if (typeof ca === "number" && typeof cb === "number") {
        return (ca - cb) * dir;
      }

      return String(ca).localeCompare(String(cb)) * dir;
    });

    return arr;
  }, [rows, sortKey, sortDir]);

  function clickSort(nextKey) {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir("desc");
      return;
    }
    setSortDir((curDir) => (curDir === "asc" ? "desc" : "asc"));
  }

  function sortIndicator(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▴" : " ▾";
  }

  function approvalLabel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return { text: "-", color: "inherit" };
    if (n <= 5) return { text: "Danger", color: "#c53b3b" };
    if (n <= 25) return { text: "Hot Seat", color: "#d77b2f" };
    if (n <= 49) return { text: "Warm", color: "#d8a118" };
    return { text: "Secure", color: "#2f9b4f" };
  }

  function recordLabel(wins, losses) {
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) return "-";
    return `(${wins}-${losses})`;
  }

  function winPctLabel(value) {
    if (!Number.isFinite(value)) return "-";
    const raw = value.toFixed(3);
    return raw.startsWith("0") ? raw.slice(1) : raw;
  }

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
              <th
                onClick={() => clickSort("coachName")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                Coach{sortIndicator("coachName")}
              </th>
              <th
                onClick={() => clickSort("teamName")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                Team{sortIndicator("teamName")}
              </th>
              <th
                onClick={() => clickSort("record")}
                style={{ width: 140, cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                Record{sortIndicator("record")}
              </th>
              <th
                onClick={() => clickSort("winPct")}
                style={{ width: 120, cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                Win%{sortIndicator("winPct")}
              </th>
              <th
                onClick={() => clickSort("prestige")}
                style={{ width: 110, cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                Prestige{sortIndicator("prestige")}
              </th>
              <th
                onClick={() => clickSort("approval")}
                style={{ width: 110, cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                Approval{sortIndicator("approval")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={`${r.ccid}-${r.tgid}`}>
                <td>
                  <Link to={`/coach/${r.ccid}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {r.name || `Coach ${r.ccid}`}
                  </Link>
                </td>
                <td>
                  {r.isNotHired ? (
                    <TeamCell name={r.teamName} logoUrl={r.teamLogo} />
                  ) : (
                    <Link to={`/team/${r.tgid}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <TeamCell name={r.teamName} logoUrl={r.teamLogo} />
                    </Link>
                  )}
                </td>
                <td>{recordLabel(r.careerWins, r.careerLosses)}</td>
                <td>{winPctLabel(r.winPct)}</td>
                <td>{Number.isFinite(Number(r.prestige)) ? Number(r.prestige) : "-"}</td>
                <td>
                  {(() => {
                    const meta = approvalLabel(r.approval);
                    return <span style={{ color: meta.color, fontWeight: 700 }}>{meta.text}</span>;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
