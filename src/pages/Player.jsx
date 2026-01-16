import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { db, getActiveDynastyId } from "../db";
import { formatHometownLabel, loadHometownLookup } from "../hometownService";
import { archetypeLabelFromPposAndPten } from "../archetype";
import { getConferenceName } from "../conferences";
import { loadAwardLogoMap, loadConferenceLogoMap, normalizeConfKey } from "../logoService";
import { pickTeamAccentColor } from "../teamColorService";
import HeaderLogo from "../components/HeaderLogo";
import {
  ONE_DECIMAL_KEYS,
  POSITION_LABELS,
  STAT_DEFS,
  classLabel,
  derivedValue,
  formatStat,
  getPlayerCardStatDefs,
  getPlayerStatsPageDefs,
  getGpForTab,
  positionLabel,
  rowHasStatsForTab,
} from "../playerStatsUtils";

const LONG_KEYS = new Set(["fgLong", "puntLong", "krLong", "prLong"]);
const OFFENSE_TABS = ["Passing", "Rushing", "Receiving", "Offensive Line"];
const SPECIAL_TEAMS_KEYS = ["Returns", "Kicking", "Punting"];
const TAB_GROUPS = [...OFFENSE_TABS, "Defense", ...SPECIAL_TEAMS_KEYS];
const CATEGORY_TABS = ["Offense", "Defense", "Special Teams"];
const SPECIAL_TEAMS_TABS = [
  { key: "Returns", label: "Returning" },
  { key: "Kicking", label: "Kicking" },
  { key: "Punting", label: "Punting" },
];
const FALLBACK_LOGO =
  "https://raw.githubusercontent.com/Talon42/ncaa-next-26/refs/heads/main/textures/SLUS-21214/replacements/general/conf-logos/a12c6273bb2704a5-9cc5a928efa767d0-00005993.png";
const CAPTAIN_LOGO = `${import.meta.env.BASE_URL}logos/captain.png`;
const ALL_AMERICAN_LOGO =
  "https://github.com/Talon42/ncaa-next-26/blob/main/textures/SLUS-21214/replacements/general/dynasty-mode/d6ce085a9cf265a1-7d77d8b3187e07c4-00005553.png?raw=true";
const AWARD_LABEL_RE = /\s+(Award|Trophy)\s*$/i;
// PLAYERSEASON P0/P1 buckets removed; priority classes are no longer used.

const POSITION_CODE_BY_LABEL = new Map(
  POSITION_LABELS.map((label, idx) => [label, idx]).filter(([label]) => label)
);

function meanPositionCodes(positionCode) {
  const label = positionLabel(positionCode);

  const groupLabels =
    label === "LT" || label === "RT"
      ? ["LT", "RT"]
      : label === "LG" || label === "RG"
        ? ["LG", "RG"]
        : label === "LE" || label === "RE" || label === "LDE" || label === "RDE"
          ? ["LE", "RE"]
          : label === "LOLB" || label === "ROLB"
            ? ["LOLB", "ROLB"]
            : label
              ? [label]
              : [];

  const codes = groupLabels
    .map((l) => POSITION_CODE_BY_LABEL.get(l))
    .filter((v) => Number.isFinite(v));

  if (codes.length) return codes;

  const n = Number(positionCode);
  return Number.isFinite(n) ? [n] : [];
}

function sumOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maxOrNull(a, b) {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  return Math.max(a, b);
}

function awardShortLabel(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  const short = trimmed.replace(AWARD_LABEL_RE, "");
  return short || trimmed;
}

// PLAYERSEASON P0/P1 buckets removed — priority class helper deleted.

function defaultTabForPosition(value) {
  const pos = positionLabel(value);
  if (pos === "QB") return "Passing";
  if (pos === "HB" || pos === "FB") return "Rushing";
  if (pos === "WR" || pos === "TE") return "Receiving";
  if (pos === "LT" || pos === "LG" || pos === "C" || pos === "RG" || pos === "RT") return "Offensive Line";
  if (pos === "K") return "Kicking";
  if (pos === "P") return "Punting";
  return "Defense";
}

function isOffensiveLinePos(value) {
  const n = Number(value);
  if (n === 5 || n === 6 || n === 7 || n === 8 || n === 9) return true;
  const pos = positionLabel(value);
  return pos === "LT" || pos === "LG" || pos === "C" || pos === "RG" || pos === "RT";
}

function categoryForTab(value) {
  if (OFFENSE_TABS.includes(value)) return "Offense";
  if (value === "Defense") return "Defense";
  if (SPECIAL_TEAMS_KEYS.includes(value) || value === "Special Teams") return "Special Teams";
  return "Special Teams";
}

function firstAvailableTab(tabKeys) {
  return tabKeys[0] || null;
}

function defaultTabForCategory(category, currentTab, availableOffenseTabs, availableSpecialTeamsTabs) {
  if (category === "Defense") return "Defense";
  if (category === "Special Teams") {
    if (SPECIAL_TEAMS_KEYS.includes(currentTab)) return currentTab;
    return firstAvailableTab(availableSpecialTeamsTabs) || "Returns";
  }
  if (OFFENSE_TABS.includes(currentTab)) return currentTab;
  return firstAvailableTab(availableOffenseTabs) || "Passing";
}

function valueForStat(row, key, group) {
  const gp = getGpForTab(row, group);
  if (ONE_DECIMAL_KEYS.has(key)) return derivedValue(row, key, gp);
  return row[key];
}

function seasonGpFromRow(row) {
  const gpOff = Number(row.gpOff);
  const gpDef = Number(row.gpDef);
  const gpSpec = Number(row.gpSpec);
  const gpOl = Number(row.gpOl);
  const values = [gpOff, gpDef, gpSpec, gpOl].filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  return Math.max(...values);
}

function formatHeight(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return "";
  const total = Math.round(inches);
  const feet = Math.floor(total / 12);
  const rem = total % 12;
  if (feet <= 0) return "";
  return `${feet}'${rem}"`;
}

function formatWeight(value) {
  const pounds = Number(value);
  if (!Number.isFinite(pounds) || pounds <= 0) return "";
  return `${Math.round(pounds)} lbs`;
}

function clampRating99(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(99, Math.round(n)));
}

function hexToRgba(hex, alpha = 1) {
  const h = String(hex ?? "").trim();
  const m = h.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r},${g},${b},${a})`;
}

function hexToRgb(hex) {
  const h = String(hex ?? "").trim();
  const m = h.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function blendRgb(a, b, t) {
  const tt = Math.max(0, Math.min(1, Number(t)));
  const r = Math.round(a.r + (b.r - a.r) * tt);
  const g = Math.round(a.g + (b.g - a.g) * tt);
  const b2 = Math.round(a.b + (b.b - a.b) * tt);
  return { r, g, b: b2 };
}

function rgbToRgba(rgb, alpha = 1) {
  if (!rgb) return null;
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function rgbToHex(rgb) {
  if (!rgb) return "";
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const to2 = (n) => clamp(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

function tintHexTowardWhite(hex, whiteT) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "";
  const t = Math.max(0, Math.min(1, Number(whiteT)));
  if (t <= 0) return String(hex ?? "").trim().toUpperCase();
  const white = { r: 255, g: 255, b: 255 };
  return rgbToHex(blendRgb(rgb, white, t));
}

function ratingBucket(value) {
  const n = clampRating99(value);
  if (n == null) return null;
  if (n <= 49) return 0;
  if (n <= 59) return 1;
  if (n <= 69) return 2;
  if (n <= 79) return 3;
  if (n <= 89) return 4;
  return 5; // 90-99
}

function ratingGradient(value, accentHex) {
  const bucket = ratingBucket(value);
  if (bucket == null) {
    return "linear-gradient(90deg, rgba(148,163,184,0.35), rgba(148,163,184,0.18))";
  }

  const accentRgb = hexToRgb(accentHex);
  if (accentRgb) {
    const white = { r: 255, g: 255, b: 255 };

    // Light -> dark. 90-99 ends at the exact hex color.
    // Keep the within-bar gradient subtle (~5% difference), and step buckets by ~5%.
    const endWhiteTByBucket = [0.30, 0.25, 0.20, 0.15, 0.10, 0.0]; // darker end (0.0 == exact hex)
    const startWhiteTByBucket = endWhiteTByBucket.map((t) => Math.min(0.95, t + 0.05)); // lighter start

    const from = blendRgb(accentRgb, white, startWhiteTByBucket[bucket]);
    const to =
      bucket === 5
        ? String(accentHex).trim().toUpperCase()
        : rgbToRgba(blendRgb(accentRgb, white, endWhiteTByBucket[bucket]), 0.96);

    return `linear-gradient(90deg, ${rgbToRgba(from, 0.96)}, ${to})`;
  }

  // Fallback palette (no team color available).
  const fallback = [
    ["rgba(185,28,28,0.90)", "rgba(248,113,113,0.90)"], // <=49
    ["rgba(194,65,12,0.90)", "rgba(251,146,60,0.90)"], // 50-59
    ["rgba(161,98,7,0.90)", "rgba(250,204,21,0.90)"], // 60-69
    ["rgba(74,222,128,0.90)", "rgba(34,197,94,0.90)"], // 70-79
    ["rgba(132,204,22,0.90)", "rgba(34,197,94,0.90)"], // 80-89
    ["rgba(16,185,129,0.95)", "rgba(34,197,94,0.95)"], // 90-99
  ];

  const [from, to] = fallback[bucket];
  return `linear-gradient(90deg, ${from}, ${to})`;
}

function RatingBar({ value, meanValue, accentHex }) {
  const n = clampRating99(value);
  const pct = n == null ? 0 : Math.round((n / 99) * 100);
  const fill = ratingGradient(n, accentHex);
  const mean = clampRating99(meanValue);
  const meanPct = mean == null ? null : Math.max(0, Math.min(100, (mean / 99) * 100));

  return (
    <div
      style={{
        position: "relative",
        height: 10,
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--border)",
        overflow: "hidden",
        width: "100%",
        minWidth: 0,
      }}
      aria-label={n == null ? "No rating" : `Rating ${n} out of 99`}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: fill }} />
      {meanPct == null ? null : (
        <div
          title={`Positional Avg: ${mean}`}
          aria-label={`Position mean ${mean} out of 99`}
          style={{
            position: "absolute",
            left: `${meanPct}%`,
            top: "50%",
            width: 8,
            height: 8,
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(0,0,0,0.35)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.55)",
            transform: "translate(-50%, -50%) rotate(45deg)",
            borderRadius: 2,
            zIndex: 3,
            cursor: "default",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: "rgba(255,255,255,0.25)",
        }}
      />
    </div>
  );
}

function RatingRow({ label, value, meanValue, deltaValue, showDelta, accentHex }) {
  const n = clampRating99(value);
  const delta = Number.isFinite(Number(deltaValue)) ? Math.round(Number(deltaValue)) : null;
  const show = Boolean(showDelta) && delta != null && delta !== 0;
  const deltaText = !show ? "" : delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor = delta > 0 ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 56px", columnGap: 10, alignItems: "center" }}>
      <div
        style={{
          fontSize: "var(--app-table-header-font-size)",
          fontWeight: "var(--app-table-header-font-weight)",
          letterSpacing: "0.35px",
          color: "var(--muted)",
        }}
      >
        {label}
      </div>
      <RatingBar value={n} meanValue={meanValue} accentHex={accentHex} />
      <div style={{ width: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <span>{n == null ? "-" : n}</span>
        {show ? (
          <span style={{ marginLeft: 6, color: deltaColor }}>
            {deltaText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function computeTotals(rows) {
  const totals = {
    gpOff: 0,
    gpDef: 0,
    gpSpec: 0,
    gpOl: 0,
    fgLong: null,
    puntLong: null,
    krLong: null,
    prLong: null,
  };

  for (const row of rows) {
    totals.gpOff += sumOrZero(row.gpOff);
    totals.gpDef += sumOrZero(row.gpDef);
    totals.gpSpec += sumOrZero(row.gpSpec);
    totals.gpOl += sumOrZero(row.gpOl);

    for (const def of STAT_DEFS) {
      const key = def.key;
      if (ONE_DECIMAL_KEYS.has(key)) continue;
      if (LONG_KEYS.has(key)) {
        totals[key] = maxOrNull(totals[key], Number(row[key]));
      } else {
        totals[key] = sumOrZero(totals[key]) + sumOrZero(row[key]);
      }
    }
  }

  return totals;
}

export default function Player() {
  const { playerUid } = useParams();
  const location = useLocation();
  const [dynastyId, setDynastyId] = useState(null);
  const [playerRows, setPlayerRows] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [tab, setTab] = useState("Passing");
  const [tabInitialized, setTabInitialized] = useState(false);
  const [teamLogoUrl, setTeamLogoUrl] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamAccentHex, setTeamAccentHex] = useState(null);
  const [ratingsSeasonYear, setRatingsSeasonYear] = useState(null);
  const [showRatingProg, setShowRatingProg] = useState(false);
  const [posRatingMeans, setPosRatingMeans] = useState(null);
  const [teamBySeasonTgid, setTeamBySeasonTgid] = useState(new Map());
  const [logoByTgid, setLogoByTgid] = useState(new Map());
  const [overrideByTgid, setOverrideByTgid] = useState(new Map());
  const [hometownLookup, setHometownLookup] = useState(null);
  const [awardLogoMap, setAwardLogoMap] = useState(new Map());
  const [confLogoMap, setConfLogoMap] = useState(new Map());
  const [allAmericanRows, setAllAmericanRows] = useState([]);
  const [awardRows, setAwardRows] = useState([]);
  const [leadersBySeason, setLeadersBySeason] = useState(new Map());

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
    })();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const lookup = await loadHometownLookup();
      if (!alive) return;
      setHometownLookup(lookup);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const map = await loadAwardLogoMap();
      if (!alive) return;
      setAwardLogoMap(map);
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
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setPlayerRows([]);
        setIdentity(null);
        setLoading(true);
        setHasLoaded(false);
        return;
      }

      setLoading(true);
      const [statsRows, identityRow] = await Promise.all([
        db.playerSeasonStats.where({ dynastyId, playerUid }).toArray(),
        db.playerIdentities.get({ dynastyId, playerUid }),
      ]);

      if (!alive) return;

      statsRows.sort((a, b) => Number(a.seasonYear) - Number(b.seasonYear));
      setPlayerRows(statsRows);
      setIdentity(identityRow ?? null);
      setHasLoaded(true);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, playerUid]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setAllAmericanRows([]);
        return;
      }

      const rows = await db.playerAllAmericans.where({ dynastyId, playerUid }).toArray();
      if (!alive) return;
      rows.sort((a, b) => Number(a.seasonYear) - Number(b.seasonYear));
      setAllAmericanRows(rows);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, playerUid]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerUid) {
        setAwardRows([]);
        return;
      }

      const rows = await db.playerAwards.where({ dynastyId, playerUid }).toArray();
      if (!alive) return;
      rows.sort((a, b) => Number(a.seasonYear) - Number(b.seasonYear));
      setAwardRows(rows);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, playerUid]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId) {
        setTeamBySeasonTgid(new Map());
        setLogoByTgid(new Map());
        setOverrideByTgid(new Map());
        return;
      }

      const [teams, logos, overrides] = await Promise.all([
        db.teamSeasons.where({ dynastyId }).toArray(),
        db.teamLogos.where({ dynastyId }).toArray(),
        db.logoOverrides.where({ dynastyId }).toArray(),
      ]);

      if (!alive) return;

      const teamMap = new Map();
      for (const t of teams) {
        const tgid = String(t.tgid ?? "");
        if (!tgid) continue;
        teamMap.set(`${t.seasonYear}|${tgid}`, t);
      }
      setTeamBySeasonTgid(teamMap);
      setLogoByTgid(new Map(logos.map((r) => [String(r.tgid), r.url])));
      setOverrideByTgid(new Map(overrides.map((r) => [String(r.tgid), r.url])));
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId]);

  const careerTotals = useMemo(() => computeTotals(playerRows), [playerRows]);

  const defsByGroup = useMemo(() => {
    const map = new Map();
    for (const def of STAT_DEFS) {
      const list = map.get(def.group) || [];
      list.push(def);
      map.set(def.group, list);
    }
    return map;
  }, []);

  const latestRow = useMemo(() => {
    if (!playerRows.length) return null;
    return playerRows.reduce((acc, row) => {
      if (!acc) return row;
      return Number(row.seasonYear) > Number(acc.seasonYear) ? row : acc;
    }, null);
  }, [playerRows]);

  const availableRatingSeasons = useMemo(() => {
    const years = new Set();
    for (const r of playerRows) {
      const y = Number(r?.seasonYear);
      if (Number.isFinite(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [playerRows]);

  const availableRatingSeasonsAsc = useMemo(
    () => availableRatingSeasons.slice().sort((a, b) => a - b),
    [availableRatingSeasons],
  );

  useEffect(() => {
    if (!availableRatingSeasons.length) return;

    if (ratingsSeasonYear != null && availableRatingSeasons.includes(Number(ratingsSeasonYear))) {
      return;
    }

    const fromState = Number(location?.state?.seasonYear);
    if (Number.isFinite(fromState) && availableRatingSeasons.includes(fromState)) {
      setRatingsSeasonYear(fromState);
      return;
    }

    setRatingsSeasonYear(availableRatingSeasons[0]);
  }, [availableRatingSeasons, location?.state, ratingsSeasonYear]);

  const ratingsRow = useMemo(() => {
    if (!playerRows.length) return null;
    const target = ratingsSeasonYear != null ? Number(ratingsSeasonYear) : Number(latestRow?.seasonYear);
    if (!Number.isFinite(target)) return latestRow;
    return playerRows.find((r) => Number(r?.seasonYear) === target) || latestRow;
  }, [latestRow, playerRows, ratingsSeasonYear]);

  const archetypeLabel = useMemo(() => {
    return archetypeLabelFromPposAndPten(latestRow?.position, latestRow?.pten);
  }, [latestRow?.position, latestRow?.pten]);

  const prevRatingsRow = useMemo(() => {
    if (!playerRows.length || !availableRatingSeasonsAsc.length) return null;
    const currentYear = Number(ratingsRow?.seasonYear);
    if (!Number.isFinite(currentYear)) return null;
    const idx = availableRatingSeasonsAsc.indexOf(currentYear);
    if (idx <= 0) return null;
    const prevYear = availableRatingSeasonsAsc[idx - 1];
    return playerRows.find((r) => Number(r?.seasonYear) === prevYear) || null;
  }, [availableRatingSeasonsAsc, playerRows, ratingsRow?.seasonYear]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !latestRow?.tgid) {
        setTeamLogoUrl(null);
        setTeamName("");
        return;
      }

      const tgid = String(latestRow.tgid).trim();
      if (!tgid) {
        setTeamLogoUrl(null);
        setTeamName("");
        return;
      }

      const [logoRow, overrideRow, teamRows] = await Promise.all([
        db.teamLogos.get([dynastyId, tgid]),
        db.logoOverrides.get([dynastyId, tgid]),
        db.teamSeasons.where({ dynastyId, tgid }).toArray(),
      ]);

      if (!alive) return;

      const latestTeam = teamRows.reduce((acc, row) => {
        if (!acc) return row;
        return Number(row.seasonYear) > Number(acc.seasonYear) ? row : acc;
      }, null);
      const name = latestTeam
        ? `${String(latestTeam.tdna ?? "").trim()} ${String(latestTeam.tmna ?? "").trim()}`.trim()
        : `TGID ${tgid}`;

      setTeamLogoUrl(overrideRow?.url || logoRow?.url || null);
      setTeamName(name);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, latestRow]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!teamName) {
        setTeamAccentHex(null);
        return;
      }

      const hex = await pickTeamAccentColor(teamName);
      if (!alive) return;
      setTeamAccentHex(hex);
    })();

    return () => {
      alive = false;
    };
  }, [teamName]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const seasonYear = ratingsRow?.seasonYear ?? null;
      const position = ratingsRow?.position ?? null;

      if (!dynastyId || seasonYear == null || position == null) {
        setPosRatingMeans(null);
        return;
      }

      const posCodes = meanPositionCodes(position);
      if (!posCodes.length) {
        setPosRatingMeans(null);
        return;
      }

      const rows =
        posCodes.length === 1
          ? await db.playerSeasonStats
              .where("[dynastyId+seasonYear+position]")
              .equals([dynastyId, seasonYear, posCodes[0]])
              .toArray()
          : await db.playerSeasonStats
              .where("[dynastyId+seasonYear+position]")
              .anyOf(posCodes.map((code) => [dynastyId, seasonYear, code]))
              .toArray();

      if (!alive) return;

      const keys = [
        "pspd",
        "pstr",
        "pawr",
        "pagi",
        "pacc",
        "pcth",
        "pcar",
        "pjmp",
        "pbtk",
        "ptak",
        "pthp",
        "ptha",
        "ppbk",
        "prbk",
        "pkpr",
        "pkac",
        "psta",
      ];

      const sums = Object.fromEntries(keys.map((k) => [k, 0]));
      const counts = Object.fromEntries(keys.map((k) => [k, 0]));

      for (const r of rows) {
        for (const k of keys) {
          const v = Number(r?.[k]);
          if (!Number.isFinite(v)) continue;
          sums[k] += v;
          counts[k] += 1;
        }
      }

      const means = {};
      for (const k of keys) {
        const c = counts[k];
        means[k] = c > 0 ? sums[k] / c : null;
      }

      setPosRatingMeans(means);
    })();

    return () => {
      alive = false;
    };
  }, [dynastyId, ratingsRow?.seasonYear, ratingsRow?.position]);

  const tabAvailability = useMemo(() => {
    const result = new Map(TAB_GROUPS.map((key) => [key, false]));
    if (!playerRows.length) return result;
    for (const tabKey of TAB_GROUPS) {
      const defs = getPlayerStatsPageDefs(tabKey);
      if (!defs.length) continue;
      for (const row of playerRows) {
        if (rowHasStatsForTab(row, defs, tabKey)) {
          result.set(tabKey, true);
          break;
        }
      }
    }

    // OL players should always see the OL tab, even if there are no counting stats for a season.
    if (isOffensiveLinePos(latestRow?.position)) {
      result.set("Offensive Line", true);
    }
    return result;
  }, [playerRows, latestRow?.position]);

  const availableTabs = useMemo(
    () => (isOffensiveLinePos(latestRow?.position) ? ["Offensive Line"] : TAB_GROUPS.filter((key) => tabAvailability.get(key))),
    [tabAvailability, latestRow?.position],
  );
  const availableOffenseTabs = useMemo(
    () => (isOffensiveLinePos(latestRow?.position) ? ["Offensive Line"] : OFFENSE_TABS.filter((key) => tabAvailability.get(key))),
    [tabAvailability, latestRow?.position],
  );
  const availableSpecialTeamsTabs = useMemo(
    () => SPECIAL_TEAMS_KEYS.filter((key) => tabAvailability.get(key)),
    [tabAvailability],
  );
  const availableCategories = useMemo(() => {
    const hasDefense = tabAvailability.get("Defense");
    return CATEGORY_TABS.filter((key) => {
      if (key === "Offense") return availableOffenseTabs.length > 0;
      if (key === "Defense") return hasDefense;
      if (key === "Special Teams") return availableSpecialTeamsTabs.length > 0;
      return false;
    });
  }, [availableOffenseTabs, availableSpecialTeamsTabs, tabAvailability]);
  const category = useMemo(() => categoryForTab(tab), [tab]);

  useEffect(() => {
    if (!latestRow) return;
    if (isOffensiveLinePos(latestRow.position)) {
      setTab("Offensive Line");
      if (!tabInitialized) setTabInitialized(true);
      return;
    }
    const preferred = defaultTabForPosition(latestRow.position);
    if (!tabInitialized) {
      if (availableTabs.includes(preferred)) {
        setTab(preferred);
      } else if (availableTabs.length) {
        setTab(availableTabs[0]);
      }
      setTabInitialized(true);
      return;
    }
    if (!availableTabs.includes(tab) && availableTabs.length) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, latestRow, tab, tabInitialized]);

  const seasonsLabel = useMemo(() => {
    if (!playerRows.length) return "";
    const years = playerRows
      .map((r) => Number(r.seasonYear))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!years.length) return "";
    if (years.length === 1) return String(years[0]);
    return `${years[0]}-${years[years.length - 1]}`;
  }, [playerRows]);

  const displayName = useMemo(() => {
    const first = String(identity?.firstName ?? latestRow?.firstName ?? "").trim();
    const last = String(identity?.lastName ?? latestRow?.lastName ?? "").trim();
    const full = `${first} ${last}`.trim();
    return full || "Player";
  }, [identity, latestRow]);

  const hometownLabel = useMemo(
    () => formatHometownLabel(identity?.hometown, hometownLookup),
    [identity, hometownLookup],
  );
  const heightLabel = useMemo(() => {
    const value = identity?.height ?? latestRow?.height;
    return formatHeight(value);
  }, [identity, latestRow]);
  const weightLabel = useMemo(() => {
    const value = identity?.weight ?? latestRow?.weight;
    return formatWeight(value);
  }, [identity, latestRow]);
  const captainBadges = useMemo(() => {
    if (!playerRows.length || !teamBySeasonTgid.size) return [];
    const out = [];
    const seen = new Set();

    for (const row of playerRows) {
      const tgid = row?.tgid != null ? String(row.tgid) : "";
      const pgid = Number(row?.pgid);
      const seasonYear = row?.seasonYear;
      if (!tgid || !Number.isFinite(pgid) || seasonYear == null) continue;
      const teamRow = teamBySeasonTgid.get(`${seasonYear}|${tgid}`) || null;
      if (!teamRow) continue;
      const tgidNum = Number(tgid);
      if (!Number.isFinite(tgidNum)) continue;
      const offset = pgid - tgidNum * 70;
      if (!Number.isFinite(offset)) continue;

      const isOcap =
        Number.isFinite(teamRow?.ocap) && offset === Number(teamRow.ocap);
      const isDcap =
        Number.isFinite(teamRow?.dcap) && offset === Number(teamRow.dcap);
      if (!isOcap && !isDcap) continue;

      const type = isOcap && isDcap ? "Captain" : isOcap ? "Offensive Captain" : "Defensive Captain";
      const teamLabel = `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim();
      const title = `${seasonYear}${teamLabel ? ` - ${teamLabel}` : ""} - ${type}`;
      const key = `${seasonYear}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, title, seasonYear: Number(seasonYear) || 0, logoUrl: CAPTAIN_LOGO, type: "captain" });
    }

    out.sort((a, b) => Number(String(a.key).split("|")[0]) - Number(String(b.key).split("|")[0]));
    return out;
  }, [playerRows, teamBySeasonTgid]);
  const allAmericanBadges = useMemo(() => {
    if (!allAmericanRows.length) return [];
    const seen = new Set();
    const labelForType = (value) => {
      const t = Number(value);
      if (t === 0) return "1st Team All-American";
      if (t === 1) return "2nd Team All-American";
      if (t === 2) return "Freshman All-American";
      return "All-American";
    };

    return allAmericanRows
      .map((row) => {
        const seasonYear = Number(row.seasonYear) || 0;
        const typeLabel = labelForType(row.ttyp);
        const confId = String(row.cgid ?? "").trim();
        const isNationalAllAmerican = confId === "15";
        const confName = !isNationalAllAmerican && confId ? getConferenceName(confId) : "";
        const fullLabel = confName ? `${confName} ${typeLabel}` : typeLabel;
        const logoUrl = (() => {
          if (!confName) return ALL_AMERICAN_LOGO;
          const byId = confLogoMap.get(normalizeConfKey(confId));
          if (byId) return byId;
          const byName = confLogoMap.get(normalizeConfKey(confName));
          return byName || ALL_AMERICAN_LOGO;
        })();
        const key = `${seasonYear}|aapl|${confId || "na"}|${row.ttyp ?? "na"}|${row.pgid ?? "na"}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          title: `${seasonYear} - ${fullLabel}`,
          seasonYear,
          logoUrl,
          type: "allAmerican",
        };
      })
      .filter(Boolean);
  }, [allAmericanRows, confLogoMap]);
  const awardBadges = useMemo(() => {
    if (!awardRows.length) return [];
    const seen = new Set();

    return awardRows
      .map((row) => {
        const seasonYear = Number(row.seasonYear) || 0;
        const awardName = String(row.awardName ?? "").trim();
        if (!awardName) return null;
        const logoUrl = awardLogoMap.get(awardName.toLowerCase()) || null;
        const key = `${seasonYear}|award|${row.awardKey ?? "na"}|${row.pgid ?? "na"}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          title: `${seasonYear} - ${awardName}`,
          seasonYear,
          logoUrl,
          label: awardShortLabel(awardName),
          isHeisman: awardName.toLowerCase().includes("heisman"),
          type: "award",
        };
      })
      .filter(Boolean);
  }, [awardLogoMap, awardRows]);
  const trophyBadges = useMemo(() => {
    const typeRank = new Map([
      ["captain", 0],
      ["allAmerican", 1],
      ["award", 2],
    ]);

    const all = [...captainBadges, ...allAmericanBadges, ...awardBadges];
    all.sort((a, b) => {
      const ar = typeRank.get(a.type) ?? 99;
      const br = typeRank.get(b.type) ?? 99;
      if (ar !== br) return ar - br;
      const ay = Number(a.seasonYear) || 0;
      const by = Number(b.seasonYear) || 0;
      if (ay !== by) return ay - by;
      return String(a.key).localeCompare(String(b.key));
    });
    return all;
  }, [allAmericanBadges, awardBadges, captainBadges]);

  const activeDefs = useMemo(() => {
    return getPlayerStatsPageDefs(tab);
  }, [tab]);
  const isDefenseTab = tab === "Defense";
  const isKickingTab = tab === "Kicking";
  const defenseDividerClass = (idx) => {
    if (!isDefenseTab) return "";
    if (idx === 0 || idx === 3 || idx === 7 || idx === 10) return " tableGroupDivider";
    return "";
  };
  const kickingDividerClass = (idx) => {
    if (!isKickingTab) return "";
    if (idx === 0 || idx === 4) return " tableGroupDivider";
    return "";
  };
  function playerSeasonPriorityClass(key) {
    return "";
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!dynastyId || !playerRows.length || !activeDefs.length) {
        if (alive) setLeadersBySeason(new Map());
        return;
      }

      const seasons = Array.from(
        new Set(
          playerRows
            .map((row) => Number(row.seasonYear))
            .filter((year) => Number.isFinite(year))
        )
      );
      if (!seasons.length) {
        if (alive) setLeadersBySeason(new Map());
        return;
      }

      const next = new Map();
      await Promise.all(
        seasons.map(async (year) => {
          const rows = await db.playerSeasonStats
            .where("[dynastyId+seasonYear]")
            .equals([dynastyId, year])
            .toArray();
          const maxByKey = new Map(activeDefs.map((def) => [def.key, null]));
          for (const row of rows) {
            for (const def of activeDefs) {
              const value = valueForStat(row, def.key, tab);
              if (!Number.isFinite(value)) continue;
              const current = maxByKey.get(def.key);
              maxByKey.set(def.key, current == null ? value : Math.max(current, value));
            }
          }
          next.set(String(year), maxByKey);
        })
      );

      if (alive) setLeadersBySeason(next);
    })();

    return () => {
      alive = false;
    };
  }, [activeDefs, dynastyId, playerRows, tab]);
  const seasonRowsForTab = useMemo(() => {
    if (!activeDefs.length) return [];
    const groups = Array.from(defsByGroup.keys());
    return playerRows.map((row) => {
      const hasAnyStats = groups.some((group) => {
        const defs = defsByGroup.get(group) || [];
        return defs.length ? rowHasStatsForTab(row, defs, group) : false;
      });
      return {
        row,
        hasStats: rowHasStatsForTab(row, activeDefs, tab),
        hasAnyStats,
        seasonGp: hasAnyStats ? seasonGpFromRow(row) : 0,
      };
    });
  }, [activeDefs, defsByGroup, playerRows, tab]);

  const careerGp = useMemo(() => {
    const groups = Array.from(defsByGroup.keys());
    let total = 0;
    for (const row of playerRows) {
      const hasAnyStats = groups.some((group) => {
        const defs = defsByGroup.get(group) || [];
        return defs.length ? rowHasStatsForTab(row, defs, group) : false;
      });
      if (hasAnyStats) total += seasonGpFromRow(row);
    }
    return total;
  }, [defsByGroup, playerRows]);

  const teamTotals = useMemo(() => {
    const groups = Array.from(defsByGroup.keys());
    const totalsByTeam = new Map();
    const seasonMeta = new Map();

    for (const row of playerRows) {
      const tgid = row.tgid != null ? String(row.tgid) : "";
      if (!tgid) continue;
      const entry = totalsByTeam.get(tgid) || { rows: [] };
      entry.rows.push(row);
      totalsByTeam.set(tgid, entry);

      const meta = seasonMeta.get(tgid) || { firstSeason: Number(row.seasonYear) || 0, lastSeason: 0 };
      const seasonValue = Number(row.seasonYear) || 0;
      meta.firstSeason = meta.firstSeason ? Math.min(meta.firstSeason, seasonValue) : seasonValue;
      meta.lastSeason = Math.max(meta.lastSeason, seasonValue);
      seasonMeta.set(tgid, meta);
    }

    const result = [];
    for (const [tgid, entry] of totalsByTeam.entries()) {
      const totals = computeTotals(entry.rows);
      let gpTotal = 0;
      for (const row of entry.rows) {
        const hasAnyStats = groups.some((group) => {
          const defs = defsByGroup.get(group) || [];
          return defs.length ? rowHasStatsForTab(row, defs, group) : false;
        });
        if (hasAnyStats) gpTotal += seasonGpFromRow(row);
      }
      const meta = seasonMeta.get(tgid) || { firstSeason: 0, lastSeason: 0 };
      result.push({ tgid, totals, gpTotal, firstSeason: meta.firstSeason, lastSeason: meta.lastSeason });
    }

    result.sort((a, b) => a.firstSeason - b.firstSeason);
    return result;
  }, [defsByGroup, playerRows]);

  const teamTotalsForTab = useMemo(() => {
    if (!activeDefs.length) return [];
    return teamTotals.filter((team) => {
      const gpTotal = team.gpTotal;
      return activeDefs.some((def) => {
        const value = ONE_DECIMAL_KEYS.has(def.key)
          ? derivedValue(team.totals, def.key, gpTotal)
          : team.totals[def.key];
        return Number.isFinite(value) && value !== 0;
      });
    });
  }, [activeDefs, teamTotals]);

  if (loading || !dynastyId || !playerUid || !hasLoaded) {
    return <div className="muted">Loading...</div>;
  }

  if (!playerRows.length) {
    return <div className="muted">No player stats found.</div>;
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <div className="headerLogoWrap">
        <HeaderLogo src={teamLogoUrl || FALLBACK_LOGO} fallbackSrc={FALLBACK_LOGO} alt={teamName || "Team"} />
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
        {latestRow?.jersey != null ? <span>#{latestRow.jersey}</span> : null}
        <span>{displayName}</span>
      </h2>

      <div style={{ display: "flex", justifyContent: "center", marginTop: -6, marginBottom: 16 }}>
        {(() => {
          const ovr = clampRating99(ratingsRow?.povr);
          return (
            <div
              title={ovr == null ? "OVR" : `OVR ${ovr}`}
              aria-label={ovr == null ? "Overall rating" : `Overall rating ${ovr} out of 99`}
              style={{
                width: 74,
                height: 74,
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "transparent",
                boxShadow: teamAccentHex
                  ? [
                      `0 0 0 2px ${hexToRgba(teamAccentHex, 0.9)}`,
                      `0 0 18px ${hexToRgba(teamAccentHex, 0.35)}`,
                      "0 2px 10px rgba(0,0,0,0.25)",
                    ].join(", ")
                  : "0 2px 10px rgba(0,0,0,0.25)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {ovr == null ? "-" : ovr}
              </div>
              <div className="kicker" style={{ margin: 0, opacity: 0.9, lineHeight: 1 }}>
                OVR
              </div>
            </div>
          );
        })()}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "stretch",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "stretch",
            width: "100%",
            maxWidth: 1138,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div className="card" style={{ marginBottom: 0, flex: "1 1 320px", maxWidth: 560 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div className="kicker infoCardTitle">Player Summary</div>
            </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
          <div className="muted" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {latestRow?.position != null ? <span>{positionLabel(latestRow.position)}</span> : null}
              {latestRow?.classYear != null ? (
                <span>
                  {classLabel(latestRow.classYear)}
                  {Number(latestRow.redshirt) >= 1 ? " (RS)" : ""}
                </span>
              ) : null}
              {heightLabel ? <span>Height: {heightLabel}</span> : null}
              {weightLabel ? <span>Weight: {weightLabel}</span> : null}
            </div>
            {archetypeLabel ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <span>Archetype: {archetypeLabel}</span>
              </div>
            ) : null}
            {hometownLabel ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <span>Hometown: {hometownLabel}</span>
              </div>
            ) : null}
          </div>
        </div>

          <div className="card" style={{ marginBottom: 0, flex: "1 1 320px", maxWidth: 560 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div className="kicker infoCardTitle">Trophy Room</div>
            </div>
            <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />
            {!trophyBadges.length ? (
              <p className="kicker" style={{ margin: 0 }}>
                No trophies yet.
              </p>
            ) : (
              <div style={{ display: "flex" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: 2, paddingRight: 2 }}>
                  {(() => {
                    const size = 42;
                    const renderBadge = ({ key, title, logoUrl, label, isHeisman }) => {
                      const champBorder = "rgba(216,180,90,0.95)";
                      return (
                        <div
                          key={key}
                          title={title}
                          style={{
                            width: size,
                            height: size,
                            borderRadius: 999,
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            background: isHeisman
                              ? "linear-gradient(135deg, rgba(216,180,90,0.24), rgba(255,255,255,0.06))"
                              : "rgba(255,255,255,0.06)",
                            border: isHeisman ? `1px solid ${champBorder}` : "1px solid var(--border)",
                            boxShadow: isHeisman
                              ? "0 0 0 1px rgba(216,180,90,0.55), 0 2px 10px rgba(216,180,90,0.25), 0 2px 8px rgba(0,0,0,0.25)"
                              : "0 2px 8px rgba(0,0,0,0.25)",
                            flex: "0 0 auto",
                          }}
                        >
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 10,
                              lineHeight: 1.1,
                              textAlign: "center",
                              padding: 6,
                              fontWeight: 600,
                              color: "var(--text)",
                            }}
                          >
                            {label || "Award"}
                          </span>
                        )}
                        </div>
                      );
                    };

                    return trophyBadges.map((badge) =>
                      renderBadge({
                        key: badge.key,
                        title: badge.title,
                        logoUrl: badge.logoUrl,
                        label: badge.label,
                        isHeisman: badge.isHeisman,
                      }),
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <div className="card" style={{ marginBottom: 0, width: "100%", maxWidth: 1138 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="kicker infoCardTitle">Player Ratings</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Season
                </div>
                <select
                  value={ratingsSeasonYear ?? ""}
                  onChange={(e) => setRatingsSeasonYear(Number(e.target.value))}
                  className="toggleBtn"
                  style={{
                    height: 30,
                    padding: "0 10px",
                    fontSize: 12,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {availableRatingSeasons.map((y) => (
                    <option key={y} value={y} style={{ color: "var(--text)" }}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`toggleBtn${showRatingProg ? " primary" : ""}`}
                  onClick={() => setShowRatingProg((v) => !v)}
                  style={{ height: 30, padding: "0 12px", fontSize: 12, borderRadius: 999 }}
                  title="Show year-over-year progression"
                >
                  Prog
                </button>
              </div>
            </div>
            <div style={{ height: 1, background: "var(--border)", marginBottom: 12 }} />

            {(() => {
              const ordered = [
                ["SPD", "pspd"],
                ["STR", "pstr"],
                ["AWR", "pawr"],
                ["AGI", "pagi"],
                ["ACC", "pacc"],
                ["CTH", "pcth"],
                ["CAR", "pcar"],
                ["JMP", "pjmp"],
                ["BTK", "pbtk"],
                ["TAK", "ptak"],
                ["THP", "pthp"],
                ["THA", "ptha"],
                ["PBK", "ppbk"],
                ["RBK", "prbk"],
                ["KPW", "pkpr"],
                ["KAC", "pkac"],
                ["STA", "psta"],
              ].map(([label, key]) => {
                const current = ratingsRow?.[key];
                const prev = prevRatingsRow?.[key];
                const delta =
                  Number.isFinite(Number(current)) && Number.isFinite(Number(prev))
                    ? Number(current) - Number(prev)
                    : null;
                return [label, key, current, posRatingMeans?.[key] ?? null, delta];
              });

              const targetRowsPerColumn = 6;
              const columnCount = Math.max(1, Math.ceil(ordered.length / targetRowsPerColumn));
              const baseSize = Math.floor(ordered.length / columnCount);
              const extra = ordered.length % columnCount;
              const columns = [];
              let cursor = 0;
              for (let i = 0; i < columnCount; i++) {
                const size = baseSize + (i < extra ? 1 : 0);
                columns.push(ordered.slice(cursor, cursor + size));
                cursor += size;
              }

              return (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                      columnGap: 26,
                      rowGap: 14,
                    }}
                  >
                    {columns.map((col, idx) => (
                      <div key={idx} style={{ minWidth: 0 }}>
                        <div style={{ display: "grid", gap: 8 }}>
                          {col.map(([label, key, value, meanValue, deltaValue]) => (
                            <RatingRow
                              key={key}
                              label={label}
                              value={value}
                              meanValue={meanValue}
                              deltaValue={deltaValue}
                              showDelta={showRatingProg}
                              accentHex={teamAccentHex}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {availableCategories.length ? (
        <div className="playerStatsCategoryRow">
          {availableCategories.map((group) => (
            <button
              key={group}
              type="button"
              className={`playerStatsCategoryBtn${category === group ? " active" : ""}`}
              onClick={() => {
                const nextTab = defaultTabForCategory(
                  group,
                  tab,
                  availableOffenseTabs,
                  availableSpecialTeamsTabs,
                );
                setTab(nextTab);
                setTabInitialized(true);
              }}
            >
              {group}
            </button>
          ))}
        </div>
      ) : null}

      {category === "Offense" ? (
        <div className="playerStatsControlRow flexRowWrap">
          <div className="playerStatsSubTabs">
            {availableOffenseTabs.map((group) => (
              <button
                key={group}
                type="button"
                className={`toggleBtn playerStatsSubTabBtn${tab === group ? " active" : ""}`}
                onClick={() => {
                  setTab(group);
                  setTabInitialized(true);
                }}
              >
                {group}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {category === "Special Teams" ? (
        <div className="playerStatsControlRow flexRowWrap">
          <div className="playerStatsSubTabs">
            {SPECIAL_TEAMS_TABS.filter((group) => availableSpecialTeamsTabs.includes(group.key)).map((group) => (
              <button
                key={group.key}
                type="button"
                className={`toggleBtn playerStatsSubTabBtn${tab === group.key ? " active" : ""}`}
                onClick={() => {
                  setTab(group.key);
                  setTabInitialized(true);
                }}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeDefs.length ? (
        <div className="tableWrap statsTableWrap" style={{ width: "100%", maxWidth: "100%" }}>
          <table className="table statsTable playerSeasonTable">
            <thead>
              {isDefenseTab ? (
                <>
	                  <tr className="statsGroupRow">
                    <th colSpan={4}></th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">TACKLES</th>
                    <th colSpan={4} className="tableGroupHeader tableGroupDivider">INTERCEPTIONS</th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">FUMBLES</th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">SCORING</th>
                  </tr>
	                  <tr className="statsGroupRow">
                    <th>Season</th>
                    <th>Team</th>
                    <th>Class</th>
                    <th className="centerCol">G</th>
                    {activeDefs.map((c, idx) => {
                      const isTackleStart = idx === 0;
                      const isIntStart = idx === 3;
                      const isFumbleStart = idx === 7;
                      const isScoreStart = idx === 10;
                      return (
                        <th
                          key={c.key}
                          title={c.fullLabel}
                          className={`${
                            isTackleStart || isIntStart || isFumbleStart || isScoreStart
                              ? "tableGroupDivider "
                              : ""
                          }statCol ${playerSeasonPriorityClass(c.key)}`}
                        >
                          {c.label}
                        </th>
                      );
                    })}
                  </tr>
                </>
              ) : isKickingTab ? (
                <>
                  <tr>
                    <th colSpan={4}></th>
                    <th colSpan={4} className="tableGroupHeader tableGroupDivider">FIELD GOALS</th>
                    <th colSpan={3} className="tableGroupHeader tableGroupDivider">EXTRA POINTS</th>
                  </tr>
                  <tr>
                    <th>Season</th>
                    <th>Team</th>
                    <th>Class</th>
                    <th className="centerCol">G</th>
                    {activeDefs.map((c, idx) => {
                      const isFgStart = idx === 0;
                      const isXpStart = idx === 4;
                      return (
                        <th
                          key={c.key}
                          title={c.fullLabel}
                          className={`${isFgStart || isXpStart ? "tableGroupDivider " : ""}statCol ${playerSeasonPriorityClass(c.key)}`}
                        >
                          {c.label}
                        </th>
                      );
                    })}
                  </tr>
                </>
              ) : (
                <tr>
                  <th>Season</th>
                  <th>Team</th>
                  <th>Class</th>
                  <th className="centerCol">G</th>
                  {activeDefs.map((c) => (
                    <th key={c.key} title={c.fullLabel} className={`statCol ${playerSeasonPriorityClass(c.key)}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {seasonRowsForTab.map(({ row, hasStats, hasAnyStats, seasonGp }) => {
                const gp = hasAnyStats ? seasonGp : 0;
                const redshirtYear = Number(row.redshirt) === 1;
                const yearLabel = row.classYear != null ? classLabel(row.classYear) : "";
                const yearText = yearLabel
                  ? `${yearLabel}${Number(row.redshirt) >= 2 ? " (RS)" : ""}`
                  : "";
                const tgid = row.tgid != null ? String(row.tgid) : "";
                const teamRow = tgid ? teamBySeasonTgid.get(`${row.seasonYear}|${tgid}`) || null : null;
                const teamLabel = teamRow
                  ? `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim()
                  : tgid
                    ? `TGID ${tgid}`
                    : "Unknown";
                const logoUrl = overrideByTgid.get(tgid) || logoByTgid.get(tgid) || null;
                return (
                  <tr key={row.seasonYear}>
                    <td>{row.seasonYear}</td>
                    <td>
                      {tgid ? (
                        <Link
                          to={`/team/${tgid}?season=${row.seasonYear}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          <div className="teamCell">
                            {logoUrl ? (
                              <img
                                className="teamLogo"
                                src={logoUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <span>{teamLabel}</span>
                          </div>
                        </Link>
                      ) : (
                        <div className="teamCell">
                          {logoUrl ? (
                            <img
                              className="teamLogo"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                          <span>{teamLabel}</span>
                        </div>
                      )}
                    </td>
                    <td>{yearText}</td>
                    {hasStats ? (
                      <>
                        <td className="centerCol">{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c, idx) => (
                          <td
                            key={c.key}
                            className={`statCol ${playerSeasonPriorityClass(c.key)}${
                              (() => {
                                const value = valueForStat(row, c.key, tab);
                                const leaders = leadersBySeason.get(String(row.seasonYear));
                                const leaderValue = leaders?.get(c.key);
                                const isLeader =
                                  Number.isFinite(value) &&
                                  Number.isFinite(leaderValue) &&
                                  leaderValue > 0 &&
                                  value === leaderValue;
                                return `${isLeader ? " playerStatLeader" : ""}${defenseDividerClass(idx)}${kickingDividerClass(idx)}`;
                              })()
                            }`}
                          >
                            {formatStat(valueForStat(row, c.key, tab), c.key)}
                          </td>
                        ))}
                      </>
                    ) : !hasAnyStats ? (
                      isDefenseTab ? (
                        <>
                          <td className="centerCol"></td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={4}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                        </>
                      ) : isKickingTab ? (
                        <>
                          <td className="centerCol"></td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={4}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                          <td className="playerSeasonNoteCell tableGroupDivider" colSpan={3}>
                            <div className="playerSeasonNote">
                              <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                            </div>
                          </td>
                        </>
                      ) : (
                        <td className="playerSeasonNoteCell" colSpan={activeDefs.length + 1}>
                          <div className="playerSeasonNote">
                            <span>{redshirtYear ? "Redshirt Year" : "Did Not Play"}</span>
                          </div>
                        </td>
                      )
                    ) : (
                      <>
                        <td className="centerCol">{Number.isFinite(gp) && gp > 0 ? gp : ""}</td>
                        {activeDefs.map((c, idx) => (
                          <td
                            key={c.key}
                            className={`statCol ${playerSeasonPriorityClass(c.key)}${defenseDividerClass(idx)}${kickingDividerClass(idx)}`}
                          >
                            0
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                );
              })}
              {teamTotalsForTab.length ? (
                <tr className="playerTotalsDivider">
                  <td colSpan={activeDefs.length + 4}></td>
                </tr>
              ) : null}
              {teamTotalsForTab.map((team) => {
                const teamRow =
                  teamBySeasonTgid.get(`${team.lastSeason}|${team.tgid}`) ||
                  teamBySeasonTgid.get(`${team.firstSeason}|${team.tgid}`) ||
                  null;
                const teamLabel = teamRow
                  ? `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim()
                  : `TGID ${team.tgid}`;
                const logoUrl = overrideByTgid.get(team.tgid) || logoByTgid.get(team.tgid) || null;
                const teamGp = team.gpTotal;
                return (
                  <tr key={`team-${team.tgid}`}>
                    <td>Team Total</td>
                    <td>
                      <Link
                        to={`/team/${team.tgid}?season=${team.lastSeason || team.firstSeason}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        <div className="teamCell">
                          {logoUrl ? (
                            <img
                              className="teamLogo"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                          <span>{teamLabel}</span>
                        </div>
                      </Link>
                    </td>
                    <td></td>
                    <td className="centerCol">{Number.isFinite(teamGp) && teamGp > 0 ? teamGp : ""}</td>
                    {activeDefs.map((c, idx) => {
                      const value = ONE_DECIMAL_KEYS.has(c.key)
                        ? derivedValue(team.totals, c.key, teamGp)
                        : team.totals[c.key];
                      return (
                        <td
                          key={c.key}
                          className={`statCol ${playerSeasonPriorityClass(c.key)}${defenseDividerClass(idx)}${kickingDividerClass(idx)}`}
                        >
                          {formatStat(value, c.key)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td>Career</td>
                <td></td>
                <td></td>
                <td className="centerCol">{Number.isFinite(careerGp) && careerGp > 0 ? careerGp : ""}</td>
                {activeDefs.map((c, idx) => {
                  const value = ONE_DECIMAL_KEYS.has(c.key)
                    ? derivedValue(careerTotals, c.key, careerGp)
                    : careerTotals[c.key];
                  return (
                    <td
                      key={c.key}
                      className={`statCol ${playerSeasonPriorityClass(c.key)}${defenseDividerClass(idx)}${kickingDividerClass(idx)}`}
                    >
                      {formatStat(value, c.key)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">No stats found for this category.</div>
      )}
    </div>
  );
}

