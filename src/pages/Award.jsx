import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import HeaderLogo from "../components/HeaderLogo";
import { db, getActiveDynastyId } from "../db";
import { loadAwardLogoMap } from "../logoService";
import { awardStatsForPlayerRow } from "../awardWinnerStats";

function normalizeSeasonValue(value) {
  if (value == null) return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export default function Award() {
  const params = useParams();
  const awardName = useMemo(() => {
    const raw = String(params.awardName ?? "").trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params.awardName]);

  // `undefined` while loading, `null` if loaded and none selected.
  const [dynastyId, setDynastyId] = useState(undefined);
  const [awardLogoMap, setAwardLogoMap] = useState(new Map());

  const [awardRows, setAwardRows] = useState([]);
  const [identityByUid, setIdentityByUid] = useState(new Map());
  const [seasonPlayerByPgid, setSeasonPlayerByPgid] = useState(new Map());
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());

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

  useEffect(() => {
    if (!dynastyId) return;
    let alive = true;
    (async () => {
      try {
        const map = await loadAwardLogoMap();
        if (alive) setAwardLogoMap(map);
      } catch {
        if (alive) setAwardLogoMap(new Map());
      }
    })();
    return () => {
      alive = false;
    };
  }, [dynastyId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!dynastyId) {
        setAwardRows([]);
        setIdentityByUid(new Map());
        setSeasonPlayerByPgid(new Map());
        setLogoByTgid(new Map());
        setOverrideByTgid(new Map());
        return;
      }

      const [allAwards, logos, overrides] = await Promise.all([
        db.playerAwards.where("dynastyId").equals(dynastyId).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      const filtered = (allAwards || []).filter((r) => String(r?.awardName ?? "").trim() === awardName);
      setAwardRows(filtered);
      setLogoByTgid(new Map((logos || []).map((r) => [String(r.tgid), r.url])));
      setOverrideByTgid(new Map((overrides || []).map((r) => [String(r.tgid), r.url])));

      const keys = [];
      const uids = new Set();
      for (const r of filtered) {
        const y = Number(r?.seasonYear);
        const pgid = String(r?.pgid ?? "").trim();
        const uid = String(r?.playerUid ?? "").trim();
        if (uid) uids.add(uid);
        if (!Number.isFinite(y) || !pgid) continue;
        keys.push([dynastyId, y, pgid]);
      }

      const identities = uids.size
        ? await db.playerIdentities.bulkGet(Array.from(uids).map((uid) => [dynastyId, uid]))
        : [];
      if (!alive) return;
      const idMap = new Map();
      for (const row of identities || []) {
        const uid = String(row?.playerUid ?? "").trim();
        if (!uid) continue;
        idMap.set(uid, row);
      }
      setIdentityByUid(idMap);

      const seenKey = new Set();
      const uniqKeys = keys.filter((k) => {
        const key = `${k[0]}|${k[1]}|${k[2]}`;
        if (seenKey.has(key)) return false;
        seenKey.add(key);
        return true;
      });

      const chunk = (arr, size) => {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const playerRows = [];
      for (const group of chunk(uniqKeys, 500)) {
        const rows = await db.playerSeasonStats.where("[dynastyId+seasonYear+pgid]").anyOf(group).toArray();
        playerRows.push(...(rows || []));
      }
      if (!alive) return;

      const bySeasonPgid = new Map();
      for (const r of playerRows || []) {
        const y = Number(r?.seasonYear);
        const pgid = String(r?.pgid ?? "").trim();
        if (!Number.isFinite(y) || !pgid) continue;
        const k = `${y}|${pgid}`;
        if (!bySeasonPgid.has(k)) bySeasonPgid.set(k, r);
      }
      setSeasonPlayerByPgid(bySeasonPgid);
    })();

    return () => {
      alive = false;
    };
  }, [awardName, dynastyId]);

  const awardLogoUrl = useMemo(() => {
    if (!awardName) return "";
    return awardLogoMap.get(awardName.toLowerCase()) || "";
  }, [awardLogoMap, awardName]);

  const winners = useMemo(() => {
    const out = (awardRows || []).map((r) => {
      const rowSeasonYear = normalizeSeasonValue(r?.seasonYear);
      const uid = String(r?.playerUid ?? "").trim();
      const identity = uid ? identityByUid.get(uid) : null;
      const pgid = String(r?.pgid ?? "").trim();
      const seasonKey = `${rowSeasonYear ?? ""}|${pgid}`;
      const statsRow = seasonPlayerByPgid.get(seasonKey) || null;
      const teamId = String(statsRow?.tgid ?? "").trim();
      const teamLogoUrl = teamId ? overrideByTgid.get(teamId) || logoByTgid.get(teamId) || "" : "";
      const playerName = identity
        ? `${String(identity.firstName ?? "").trim()} ${String(identity.lastName ?? "").trim()}`.trim()
        : `${String(r?.firstName ?? "").trim()} ${String(r?.lastName ?? "").trim()}`.trim();
      const { pos, cls, stats } = statsRow ? awardStatsForPlayerRow(statsRow) : { pos: "", cls: "", stats: [] };
      const summary = (stats || [])
        .filter((s) => s?.key && s.key !== "gp")
        .slice(0, 6)
        .map((s) => ({ label: s.label, value: s.value }));

      return {
        row: r,
        rowSeasonYear,
        uid,
        playerName,
        pos,
        cls,
        teamLogoUrl,
        summary,
      };
    });

    out.sort((a, b) => (Number(b.rowSeasonYear) || 0) - (Number(a.rowSeasonYear) || 0));
    return out;
  }, [awardRows, identityByUid, logoByTgid, overrideByTgid, seasonPlayerByPgid]);

  if (dynastyId === undefined) {
    return <p className="kicker">Loading...</p>;
  }

  if (dynastyId == null) {
    return <p className="kicker">No dynasty loaded. Select a dynasty from the sidebar.</p>;
  }

  if (!awardName) {
    return <p className="kicker">No award selected.</p>;
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <div className="headerLogoWrap">
        <HeaderLogo src={awardLogoUrl} alt={awardName} className="awardHeaderLogo" />
      </div>

      <h2
        style={{
          marginTop: 6,
          marginBottom: 18,
          display: "flex",
          justifyContent: "center",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span>{awardName}</span>
      </h2>

      <div className="tableWrap" style={{ marginTop: 10 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>YEAR</th>
              <th style={{ width: 240 }}>AWARD</th>
              <th style={{ width: 320 }}>NAME</th>
              <th style={{ width: 80 }}>YR</th>
              <th style={{ width: 80 }}>POS</th>
              <th>Season Stats</th>
            </tr>
          </thead>
          <tbody>
            {winners.length ? (
              winners.map((x) => (
                <tr key={`${String(x.row?.awardKey ?? "")}|${x.uid || String(x.row?.pgid ?? "")}`}>
                  <td>{x.rowSeasonYear ?? "-"}</td>
                  <td>
                    <span className="tableLogoLabel">
                      {awardLogoUrl ? (
                        <img
                          src={awardLogoUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          style={{ width: 18, height: 18, objectFit: "contain" }}
                        />
                      ) : null}
                      <span className="selectableText">{awardName}</span>
                    </span>
                  </td>
                  <td>
                    <span className="tableLogoLabel">
                      {x.teamLogoUrl ? (
                        <img
                          src={x.teamLogoUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          style={{ width: 18, height: 18, objectFit: "contain" }}
                        />
                      ) : null}
                      {x.uid ? (
                        <Link className="tableLink" to={`/player/${x.uid}`} state={{ seasonYear: x.rowSeasonYear }}>
                          {x.playerName || "Unknown"}
                        </Link>
                      ) : (
                        <span>{x.playerName || "Unknown"}</span>
                      )}
                    </span>
                  </td>
                  <td>{x.cls || ""}</td>
                  <td>{x.pos || ""}</td>
                  <td>
                    {x.summary.length ? (
                      x.summary.map((s, idx) => (
                        <span key={`${s.label}-${idx}`}>
                          <span className="tableStatLabel">{s.label}</span>{" "}
                          <span>{s.value}</span>
                          {idx < x.summary.length - 1 ? <span>{" · "}</span> : null}
                        </span>
                      ))
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}><span className="kicker">No award winners found.</span></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
