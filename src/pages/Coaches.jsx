import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { getConferenceName } from "../conferences";
import { buildTeamSeasonWinLossMap, computeCoachCareerRecord } from "../coachRecords";

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
  const [confFilter, setConfFilter] = useState("All");
  const [approvalFilter, setApprovalFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active");

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
      const [coaches, allCoachRows, games, baseRows, teamSeasons, teamLogoRows, overrideRows] = await Promise.all([
        db.coaches.where({ dynastyId, seasonYear }).toArray(),
        db.coaches.where({ dynastyId }).toArray(),
        db.games.where({ dynastyId }).toArray(),
        db.coachCareerBases.where({ dynastyId }).toArray(),
        db.teamSeasons.where({ dynastyId, seasonYear }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      const teamSeasonWinLossByKey = buildTeamSeasonWinLossMap(games);

      const coachSeasonsByCcid = new Map();
      for (const r of allCoachRows) {
        const ccid = String(r.ccid ?? "");
        if (!ccid) continue;
        const list = coachSeasonsByCcid.get(ccid) || [];
        list.push({ seasonYear: r.seasonYear, tgid: String(r.tgid ?? "") });
        coachSeasonsByCcid.set(ccid, list);
      }

      const baseByCcid = new Map(baseRows.map((r) => [String(r.ccid ?? ""), r]));
      const fallbackBaseSeasonYear = (() => {
        const years = allCoachRows.map((r) => Number(r.seasonYear)).filter((n) => Number.isFinite(n));
        return years.length ? Math.min(...years) : Number(seasonYear);
      })();

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

      const cgidByTgid = new Map(teamSeasons.map((t) => [String(t.tgid), t.cgid]));

      const mapped = coaches.map((c) => {
        const firstName = String(c.firstName ?? "").trim();
        const lastName = String(c.lastName ?? "").trim();
        const tgid = String(c.tgid ?? "");
        const isNotHired = tgid === "511";

        const ccid = String(c.ccid ?? "");
        const base = baseByCcid.get(ccid) || null;
        const career = computeCoachCareerRecord({
          coachSeasons: coachSeasonsByCcid.get(ccid) || [],
          teamSeasonWinLossByKey,
          baseSeasonYear: base?.baseSeasonYear ?? fallbackBaseSeasonYear,
          baseWins: base?.baseWins ?? 0,
          baseLosses: base?.baseLosses ?? 0,
          asOfSeasonYear: seasonYear,
        });

        const wins = Number(career.wins);
        const losses = Number(career.losses);
        const hasWins = Number.isFinite(wins);
        const hasLosses = Number.isFinite(losses);
        const total = hasWins && hasLosses ? wins + losses : null;
        const winPct = total != null && total > 0 ? wins / total : null;

        const bowlWins = Number(c.bowlWins);
        const bowlLosses = Number(c.bowlLosses);
        const hasBowlWins = Number.isFinite(bowlWins);
        const hasBowlLosses = Number.isFinite(bowlLosses);
        const bowlTotal = hasBowlWins && hasBowlLosses ? bowlWins + bowlLosses : null;
        const bowlWinPct =
          bowlTotal != null && bowlTotal > 0 ? bowlWins / bowlTotal : null;
        return {
          ccid,
          firstName,
          lastName,
          name: `${firstName} ${lastName}`.trim(),
          coachSortName: `${lastName} ${firstName}`.trim(),
          tgid,
          teamName: isNotHired ? "Not Hired" : teamNameByTgid.get(tgid) || `TGID ${tgid}`,
          teamLogo: logoFor(tgid),
          confName: isNotHired ? "Not Hired" : getConferenceName(cgidByTgid.get(tgid)),
          prestige: c.hcPrestige,
          approval: c.approval,
          isNotHired,
          careerWins: hasWins ? wins : null,
          careerLosses: hasLosses ? losses : null,
          winPct,
          bowlWins: hasBowlWins ? bowlWins : null,
          bowlLosses: hasBowlLosses ? bowlLosses : null,
          bowlWinPct,
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

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "Active" && r.isNotHired) return false;
      if (statusFilter === "Inactive" && !r.isNotHired) return false;
      if (confFilter !== "All" && r.confName !== confFilter) return false;
      if (approvalFilter !== "All" && approvalLabel(r.approval).text !== approvalFilter) {
        return false;
      }
      return true;
    });
  }, [rows, confFilter, approvalFilter, statusFilter]);

  const confOptions = useMemo(() => {
    const uniq = new Set();
    rows.forEach((r) => {
      if (r.confName) uniq.add(r.confName);
    });
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const approvalOptions = useMemo(() => ["Danger", "Hot Seat", "Warm", "Secure"], []);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;
    const arr = [...filteredRows];

    arr.sort((a, b) => {
      const av =
        key === "coachName"
          ? a.coachSortName || a.name
          : key === "teamName"
            ? a.teamName
            : key === "record"
              ? a.careerWins
            : key === "winPct"
              ? a.winPct
            : key === "bowlRecord"
              ? a.bowlWins
              : key === "bowlWinPct"
                ? a.bowlWinPct
            : key === "prestige"
              ? a.prestige
            : key === "approval"
              ? a.approval
            : a.name;
      const bv =
        key === "coachName"
          ? b.coachSortName || b.name
          : key === "teamName"
            ? b.teamName
            : key === "record"
              ? b.careerWins
            : key === "winPct"
              ? b.winPct
            : key === "bowlRecord"
              ? b.bowlWins
              : key === "bowlWinPct"
                ? b.bowlWinPct
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
  }, [filteredRows, sortKey, sortDir]);

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
    return sortDir === "asc" ? " ↑" : " ↓";
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

  function bowlRecordLabel(wins, losses) {
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) return "-";
    return `(${wins}-${losses})`;
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
      <div className="hrow">
        <h2>Coaches</h2>
      </div>
      <div className="playerStatsControlRow">
        <div className="playerStatsFilters">
          <select
            value={confFilter}
            onChange={(e) => setConfFilter(e.target.value)}
            disabled={!confOptions.length}
            aria-label="Conference"
          >
            <option value="All">All</option>
            {confOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} aria-label="Approval">
            <option value="All">All</option>
            {approvalOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!seasonYear ? <p className="kicker">No seasons uploaded yet.</p> : null}

      {!rows.length ? (
        <p className="kicker">
          No coaches found yet. Import a season via <b>Upload New Season</b>.
        </p>
      ) : (
        <>
          {!sortedRows.length ? (
            <p className="kicker">No coaches match those filters.</p>
          ) : null}

          <table className="table">
          <thead>
            <tr>
              <th
                onClick={() => clickSort("coachName")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                COACH{sortIndicator("coachName")}
              </th>
              <th
                onClick={() => clickSort("teamName")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Sort"
              >
                TEAM{sortIndicator("teamName")}
              </th>
              <th
                onClick={() => clickSort("record")}
                style={{ width: 140, cursor: "pointer", userSelect: "none" }}
                title="Sort"
                className="statCol"
              >
                RECORD{sortIndicator("record")}
              </th>
              <th
                onClick={() => clickSort("winPct")}
                style={{ width: 120, cursor: "pointer", userSelect: "none" }}
                title="Sort"
                className="statCol"
              >
                WIN%{sortIndicator("winPct")}
              </th>
              <th
                onClick={() => clickSort("bowlRecord")}
                style={{ width: 140, cursor: "pointer", userSelect: "none" }}
                title="Sort"
                className="statCol"
              >
                BOWL RECORD{sortIndicator("bowlRecord")}
              </th>
              <th
                onClick={() => clickSort("bowlWinPct")}
                style={{ width: 140, cursor: "pointer", userSelect: "none" }}
                title="Sort"
                className="statCol"
              >
                BOWL WIN%{sortIndicator("bowlWinPct")}
              </th>
              <th
                onClick={() => clickSort("prestige")}
                style={{ width: 110, cursor: "pointer", userSelect: "none" }}
                title="Sort"
                className="statCol"
              >
                PRESTIGE{sortIndicator("prestige")}
              </th>
              <th
                onClick={() => clickSort("approval")}
                style={{ width: 110, cursor: "pointer", userSelect: "none" }}
                title="Sort"
                className="statCol"
              >
                APPROVAL{sortIndicator("approval")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={`${r.ccid}-${r.tgid}`}>
                <td data-label="Coach">
                  <Link to={`/coach/${r.ccid}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {r.name || `Coach ${r.ccid}`}
                  </Link>
                </td>
                <td data-label="Team">
                  {r.isNotHired ? (
                    <TeamCell name={r.teamName} logoUrl={r.teamLogo} />
                  ) : (
                    <Link to={`/team/${r.tgid}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <TeamCell name={r.teamName} logoUrl={r.teamLogo} />
                    </Link>
                  )}
                </td>
                <td data-label="Record" className="statCol">
                  {recordLabel(r.careerWins, r.careerLosses)}
                </td>
                <td data-label="Win%" className="statCol">
                  {winPctLabel(r.winPct)}
                </td>
                <td data-label="Bowl Record" className="statCol">
                  {bowlRecordLabel(r.bowlWins, r.bowlLosses)}
                </td>
                <td data-label="Bowl Win%" className="statCol">
                  {winPctLabel(r.bowlWinPct)}
                </td>
                <td data-label="Prestige" className="statCol">
                  {Number.isFinite(Number(r.prestige)) ? Number(r.prestige) : "-"}
                </td>
                <td data-label="Approval" className="statCol">
                  {(() => {
                    const meta = approvalLabel(r.approval);
                    return <span style={{ color: meta.color, fontWeight: 700 }}>{meta.text}</span>;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </>
      )}
    </div>
  );
}
