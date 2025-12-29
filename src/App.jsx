// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import BackBreadcrumb from "./components/BackBreadcrumb";
import Home from "./pages/Home";
import ImportSeason from "./pages/ImportSeason";
import Team from "./pages/Team";
import ConferenceStandings from "./pages/ConferenceStandings";
import TeamsIndex from "./pages/TeamsIndex";
import TeamStats from "./pages/TeamStats";
import PlayerStats from "./pages/PlayerStats";
import Player from "./pages/Player";
import Postseason from "./pages/Postseason";
import BowlResults from "./pages/BowlResults";
import Coaches from "./pages/Coaches";
import Coach from "./pages/Coach";
import CoachesPollRankings from "./pages/CoachesPollRankings";
import { writePreviousRoute } from "./previousRoute";

import {
  createDynasty,
  db,
  deleteDynasty,
  getActiveDynastyId,
  listDynasties,
  setActiveDynastyId,
} from "./db";
import {
  exportDatabase,
  getImportPreview,
  importDatabase,
  validateBackupPayload,
} from "./backup";

function Modal({ title, children, maxWidth = 560 }) {
  return (
    <div className="modalOverlay">
      <div className="card" style={{ width: "100%", maxWidth }}>
        <h2 style={{ margin: 0, marginBottom: 8, textAlign: "center" }}>{title}</h2>
        <div style={{ marginTop: 4 }}>{children}</div>
      </div>
    </div>
  );
}

function CreateDynastySplash({ onCreate }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Create your first dynasty</h2>
      <p className="kicker">Create a dynasty to start importing seasons.</p>
      <button className="primary" onClick={onCreate}>
        + New Dynasty
      </button>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // widen the routed card on TeamsIndex and Team Stats
  const isTeamsPage =
    location.pathname === "/teams" ||
    location.pathname === "/team-stats" ||
    location.pathname === "/player-stats" ||
    location.pathname === "/postseason" ||
    location.pathname === "/coaches" ||
    location.pathname === "/coaches-poll" ||
    location.pathname.startsWith("/coach/");
  const isSchedulePage = location.pathname === "/";

  const [dynasties, setDynasties] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [dynastyOpen, setDynastyOpen] = useState(true);

  const [showNewDynasty, setShowNewDynasty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStartYear, setNewStartYear] = useState(2025);
  const [newErr, setNewErr] = useState("");
  const [showImportSeason, setShowImportSeason] = useState(false);
  const [pendingFirstDynastyId, setPendingFirstDynastyId] = useState(null);
  const [hasAnySeasons, setHasAnySeasons] = useState(false);
  const [activeDynastyHasSeasons, setActiveDynastyHasSeasons] = useState(false);

  const [showDynastyActions, setShowDynastyActions] = useState(false);
  const [selectedDynasty, setSelectedDynasty] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingDynasty, setDeletingDynasty] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [clearingStorage, setClearingStorage] = useState(false);
  const [optimizeBusy, setOptimizeBusy] = useState(false);
  const [optimizeBlocked, setOptimizeBlocked] = useState(false);
  const [optimizeErr, setOptimizeErr] = useState("");
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [importPayload, setImportPayload] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importErr, setImportErr] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [openHeaderPanel, setOpenHeaderPanel] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const lastRouteRef = useRef("");

  async function refresh() {
    const list = await listDynasties();
    setDynasties(list);
    const id = await getActiveDynastyId();
    setActiveId(id);
    const gamesCount = await db.games.count();
    setHasAnySeasons(gamesCount > 0);
    if (id) {
      const activeCount = await db.games.where({ dynastyId: id }).count();
      setActiveDynastyHasSeasons(activeCount > 0);
    } else {
      setActiveDynastyHasSeasons(false);
    }
  }

  useEffect(() => {
    if (clearingStorage) return;
    refresh();
  }, []);

  useEffect(() => {
    if (dynasties.length === 0) {
      setShowNewDynasty(true);
      return;
    }
    setShowNewDynasty(false);
  }, [dynasties.length]);

  useEffect(() => {
    setOpenHeaderPanel(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const next = `${location.pathname}${location.search}`;
    const prev = lastRouteRef.current;
    if (prev && prev !== next) {
      writePreviousRoute(prev);
    }
    lastRouteRef.current = next;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (clearingStorage) return;
    if (!activeId) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const q = String(searchQuery ?? "").trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let alive = true;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      (async () => {
        const [teamRows, coachRows, bowlRows, playerRows] = await Promise.all([
          db.teamSeasons.where({ dynastyId: activeId }).toArray(),
          db.coaches.where({ dynastyId: activeId }).toArray(),
          db.bowlGames.where({ dynastyId: activeId }).toArray(),
          db.playerSeasonStats.where({ dynastyId: activeId }).toArray(),
        ]);

        if (!alive) return;

        const teamLatestByTgid = new Map();
        for (const t of teamRows) {
          const tgid = String(t.tgid ?? "");
          const yr = Number(t.seasonYear);
          const existing = teamLatestByTgid.get(tgid);
          if (!existing || yr > existing.seasonYear) {
            teamLatestByTgid.set(tgid, { ...t, seasonYear: yr });
          }
        }

        const coachLatestByCcid = new Map();
        for (const c of coachRows) {
          const ccid = String(c.ccid ?? "");
          const yr = Number(c.seasonYear);
          const existing = coachLatestByCcid.get(ccid);
          if (!existing || yr > existing.seasonYear) {
            coachLatestByCcid.set(ccid, { ...c, seasonYear: yr });
          }
        }

        const playerLatestByUid = new Map();
        for (const p of playerRows) {
          const uid = String(p.playerUid ?? "").trim() || `pgid:${String(p.pgid ?? "").trim()}`;
          if (!uid) continue;
          const yr = Number(p.seasonYear);
          const existing = playerLatestByUid.get(uid);
          if (!existing || yr > existing.seasonYear) {
            playerLatestByUid.set(uid, { ...p, seasonYear: yr });
          }
        }

        const results = [];
        const addResult = (item) => results.push(item);
        const scoreOf = (text) => {
          const s = String(text ?? "").toLowerCase();
          if (!s) return null;
          if (s.startsWith(q)) return 0;
          if (s.includes(q)) return 1;
          return null;
        };

        for (const t of teamLatestByTgid.values()) {
          const name = `${String(t.tdna ?? "").trim()} ${String(t.tmna ?? "").trim()}`.trim();
          const score = scoreOf(name) ?? scoreOf(t.tgid);
          if (score == null) continue;
          addResult({
            type: "Team",
            label: name || `TGID ${t.tgid}`,
            href: `/team/${t.tgid}`,
            score,
          });
        }

        for (const c of coachLatestByCcid.values()) {
          const first = String(c.firstName ?? "").trim();
          const last = String(c.lastName ?? "").trim();
          const name = `${first} ${last}`.trim();
          const score = scoreOf(name) ?? scoreOf(c.ccid);
          if (score == null) continue;
          addResult({
            type: "Coach",
            label: name || `Coach ${c.ccid}`,
            href: `/coach/${c.ccid}`,
            score,
          });
        }

        for (const p of playerLatestByUid.values()) {
          const first = String(p.firstName ?? "").trim();
          const last = String(p.lastName ?? "").trim();
          const name = `${first} ${last}`.trim();
          const pgid = String(p.pgid ?? "").trim();
          const score = scoreOf(name) ?? scoreOf(pgid);
          if (score == null) continue;
          const tgid = String(p.tgid ?? "").trim();
          const teamRow = tgid ? teamLatestByTgid.get(tgid) || null : null;
          const teamName = teamRow
            ? `${String(teamRow.tdna ?? "").trim()} ${String(teamRow.tmna ?? "").trim()}`.trim()
            : tgid
              ? `TGID ${tgid}`
              : "";
          const labelBase = name || (pgid ? `PGID ${pgid}` : "Unknown Player");
          const metaParts = [];
          if (pgid) metaParts.push(`PGID ${pgid}`);
          if (teamName) metaParts.push(teamName);
          const label = metaParts.length ? `${labelBase} (${metaParts.join(", ")})` : labelBase;
          const params = new URLSearchParams();
          if (p.seasonYear != null) params.set("season", String(p.seasonYear));
          params.set("player", labelBase);
          addResult({
            type: "Player",
            label,
            href: `/player-stats?${params.toString()}`,
            score,
          });
        }

        const seenBowls = new Set();
        for (const b of bowlRows) {
          const name = String(b.bnme ?? "").trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seenBowls.has(key)) continue;
          const score = scoreOf(name);
          if (score == null) continue;
          seenBowls.add(key);
          addResult({
            type: "Bowl",
            label: name,
            href: `/postseason/bowl?name=${encodeURIComponent(name)}`,
            score,
          });
        }

        results.sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          return a.label.localeCompare(b.label);
        });

        setSearchResults(results.slice(0, 12));
        setSearchLoading(false);
      })().catch(() => {
        if (!alive) return;
        setSearchLoading(false);
      });
    }, 200);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [activeId, searchQuery]);

  useEffect(() => {
    if (clearingStorage) return;
    let alive = true;
    (async () => {
      if (!activeId) {
        if (alive) setActiveDynastyHasSeasons(false);
        return;
      }
      const count = await db.games.where({ dynastyId: activeId }).count();
      if (alive) setActiveDynastyHasSeasons(count > 0);
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);

  const activeDynasty = useMemo(
    () => dynasties.find((d) => d.id === activeId) || null,
    [dynasties, activeId]
  );
  const otherDynasties = useMemo(
    () => dynasties.filter((d) => d.id !== activeId),
    [dynasties, activeId]
  );

  function openDynastyActions(d) {
    setSelectedDynasty(d);
    setShowDynastyActions(true);
  }

  async function loadDynasty(id) {
    await setActiveDynastyId(id);
    setActiveId(id);
    setShowDynastyActions(false);
    setSelectedDynasty(null);
    navigate("/");
    window.location.reload();
  }

  function askDeleteDynasty() {
    setShowDynastyActions(false);
    setShowDeleteConfirm(true);
  }

  async function confirmDeleteDynasty() {
    const d = selectedDynasty;
    setShowDeleteConfirm(false);
    setSelectedDynasty(null);
    if (!d) return;

    setDeletingDynasty(true);
    setClearingStorage(true);
    const result = await deleteDynasty(d.id);
    if (result?.blocked) {
      setDeletingDynasty(false);
      setDeleteBlocked(true);
      setClearingStorage(false);
      return;
    }
    if (result?.clearedAll) {
      setActiveId(null);
      navigate("/");
      window.location.reload();
      return;
    }
    await refresh();
    navigate("/");
    window.location.reload();
  }

  async function optimizeDatabase() {
    setOptimizeBlocked(false);
    setOptimizeErr("");
    setOptimizeBusy(true);
    try {
      const payload = await exportDatabase();
      db.close();
      const result = await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = () => resolve({ clearedAll: true, blocked: false });
        req.onerror = () => resolve({ clearedAll: false, blocked: false, error: req.error });
        req.onblocked = () => resolve({ clearedAll: false, blocked: true });
      });

      if (result?.blocked) {
        setOptimizeBusy(false);
        setOptimizeBlocked(true);
        await db.open();
        return;
      }

      await db.open();
      await importDatabase(payload);
      window.location.reload();
    } catch (e) {
      setOptimizeErr(e?.message || String(e));
      setOptimizeBusy(false);
      try {
        await db.open();
      } catch {
        // ignore open errors
      }
    }
  }

  function resetImportState() {
    setImportPayload(null);
    setImportPreview(null);
    setImportErr("");
    setImportStatus("");
    setImportBusy(false);
    setImportFileName("");
  }

  async function onExportDatabase() {
    setImportErr("");
    setImportStatus("");
    try {
      const payload = await exportDatabase();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dynasty-tracker-backup-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setImportStatus("Export complete.");
    } catch (e) {
      setImportErr(e?.message || String(e));
    }
  }

  async function onSelectBackupFile(e) {
    const file = e.target.files?.[0] || null;
    resetImportState();
    if (!file) return;
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const validation = validateBackupPayload(payload);
      if (!validation.ok) {
        setImportErr(validation.error);
        return;
      }
      const preview = await getImportPreview(payload);
      if (preview.idConflicts.length) {
        setImportErr("Backup conflicts with existing dynasty IDs.");
        setImportPreview(preview);
        return;
      }
      setImportPayload(payload);
      setImportPreview(preview);
    } catch (err) {
      setImportErr(err?.message || "Unable to read backup file.");
    }
  }

  async function onImportDatabase() {
    if (!importPayload) return;
    setImportErr("");
    setImportStatus("");
    setImportBusy(true);
    try {
      await importDatabase(importPayload);
      await refresh();
      setShowBackupModal(false);
      resetImportState();
      navigate("/");
      window.location.reload();
    } catch (e) {
      setImportErr(e?.message || String(e));
      setImportBusy(false);
    }
  }


  async function onCreateDynasty() {
    setNewErr("");
    try {
      const d = await createDynasty({ name: newName, startYear: newStartYear });
      setShowNewDynasty(false);
      setNewName("");
      setNewStartYear(2025);
      await refresh();
      setPendingFirstDynastyId(d.id);
      setShowImportSeason(true);
    } catch (e) {
      setNewErr(e?.message || String(e));
    }
  }

  function toggleHeaderPanel(name) {
    setOpenHeaderPanel((cur) => (cur === name ? null : name));
  }

  return (
    <div className="shell">
      <div className="mobileHeader">
        <div className="mobileTitle">NCAA Next Dynasty Tracker</div>
        <div className="headerMenus">
          <div className="headerNavGroup">
            <div className="headerNavButtons">
              <button
                className="headerNavBtn"
                onClick={() => navigate("/coaches")}
                title="Coaches"
              >
                Coaches
              </button>

              <button
                className="headerNavBtn"
                onClick={() => navigate("/coaches-poll")}
                title="Coach's Poll Rankings"
              >
                Coach&apos;s Poll Rankings
              </button>

              <button
                className="headerNavBtn"
                onClick={() => navigate(`/standings?conf=All&ts=${Date.now()}`)}
                title="Conference Standings"
              >
                Conference Standings
              </button>
              <button
                className="headerNavBtn"
                onClick={() => navigate("/postseason")}
                title="Postseason"
              >
                Postseason
              </button>

              <button
                className="headerNavBtn"
                onClick={() => navigate("/")}
                title="Schedule / Results"
              >
                Schedule / Results
              </button>

              <button
                className="headerNavBtn"
                onClick={() => navigate("/team-stats")}
                title="Team Stats"
              >
                Team Stats
              </button>

              <button
                className="headerNavBtn"
                onClick={() => navigate("/player-stats")}
                title="Player Stats"
              >
                Player Stats
              </button>

              <button
                className="headerNavBtn"
                onClick={() => navigate("/teams")}
                title="Teams"
              >
                Teams
              </button>
            </div>
          </div>

          <div className="headerDivider" role="presentation" />

          <div className={`headerMenu ${openHeaderPanel === "dynasties" ? "open" : ""}`}>
            <button
              className="headerTrigger"
              onClick={() => toggleHeaderPanel("dynasties")}
              aria-expanded={openHeaderPanel === "dynasties"}
            >
              Dynasties
            </button>
            <div className="headerPanel">
              <div className="sideNav">
                {activeDynasty ? (
                  <a
                    href="#"
                    className="active"
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenHeaderPanel(null);
                      if (dynasties.length === 1) {
                        openDynastyActions(activeDynasty);
                        return;
                      }
                      setShowDynastyActions(false);
                      setSelectedDynasty(null);
                      navigate("/");
                    }}
                    title="Go to Schedule / Results"
                  >
                    <span>{activeDynasty.name}</span>
                    <span className="badge active">Active</span>
                  </a>
                ) : (
                  <span className="kicker">No dynasty loaded</span>
                )}

                {otherDynasties.map((d) => (
                  <a
                    key={d.id}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenHeaderPanel(null);
                      openDynastyActions(d);
                    }}
                  >
                    <span>{d.name}</span>
                  </a>
                ))}
              </div>

              <div className="sidebarActionStack">
                <button
                  className="sidebarBtn"
                  onClick={() => {
                    setOpenHeaderPanel(null);
                    setShowNewDynasty(true);
                  }}
                  style={{ width: "100%" }}
                >
                  + New Dynasty
                </button>

                <button
                  className="sidebarBtn"
                  onClick={() => {
                    setOpenHeaderPanel(null);
                    resetImportState();
                    setShowBackupModal(true);
                  }}
                  style={{ width: "100%" }}
                >
                  Import / Export
                </button>
              </div>
            </div>
          </div>

          <button
            className="headerAddSeason"
            onClick={() => setShowImportSeason(true)}
            title="Upload New Season"
            aria-label="Upload New Season"
            disabled={!activeId}
          >
            <span className="headerAddSeasonIcon">+</span>
          </button>
        </div>
      </div>
      {!clearingStorage && (
        <div className="shellGrid">
          <aside className="sidebar">
          <div className="brandRow" style={{ marginBottom: 10 }}>
            <h1>NCAA Next Dynasty Tracker</h1>
          </div>

          {/* Navigation */}
          <div className="sideSection" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
            <div className="sideTitle" style={{ marginBottom: 8 }}>
              Navigation
            </div>

            <div className="sideNav">
              {[
                {
                  label: "Coach's Poll Rankings",
                  title: "Coach's Poll Rankings",
                  href: "/coaches-poll",
                },
                {
                  label: "Coaches",
                  title: "Coaches",
                  href: "/coaches",
                },
                {
                  label: "Conference Standings",
                  title: "Conference Standings",
                  href: `/standings?conf=All&ts=${Date.now()}`,
                },
                {
                  label: "Postseason",
                  title: "Postseason",
                  href: "/postseason",
                },
                {
                  label: "Schedule / Results",
                  title: "Schedule / Results",
                  href: "/",
                },
                {
                  label: "Team Stats",
                  title: "Team Stats",
                  href: "/team-stats",
                },
                {
                  label: "Player Stats",
                  title: "Player Stats",
                  href: "/player-stats",
                },
                {
                  label: "Teams",
                  title: "Teams",
                  href: "/teams",
                },
              ]
                .slice()
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((item) => (
                  <a
                    key={item.label}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(item.href);
                    }}
                    title={item.title}
                  >
                    <span>{item.label}</span>
                  </a>
                ))}
            </div>
          </div>

          {/* Search */}
          <div className="sideSection">
            <div className="sideTitle" style={{ marginBottom: 8 }}>
              Search
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teams, coaches, or players..."
              style={{ width: "100%" }}
              aria-label="Search teams, coaches, or players"
            />
            {searchQuery.trim().length >= 2 ? (
              <div className="sideNav" style={{ marginTop: 10 }}>
                {searchLoading ? (
                  <span className="kicker">Searching...</span>
                ) : searchResults.length ? (
                  searchResults.map((r) => (
                    <a
                      key={`${r.type}-${r.href}`}
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(r.href);
                      }}
                      title={`${r.type}: ${r.label}`}
                    >
                      <span>{r.label}</span>
                      <span className="badge">{r.type}</span>
                    </a>
                  ))
                ) : (
                  <span className="kicker">No matches.</span>
                )}
              </div>
            ) : null}
          </div>

          {/* Dynasties */}
          <div className="sideSection">
            <div className="sideTitleRow">
              <div className="sideTitle">Dynasties</div>
              <button className="toggleBtn" onClick={() => setDynastyOpen((v) => !v)}>
                {dynastyOpen ? "Collapse" : "Expand"}
              </button>
            </div>

            {dynastyOpen ? (
              <>
                <div className="sideNav">
                  {activeDynasty ? (
                    <>
                      <a
                        href="#"
                        className="active"
                        onClick={(e) => {
                          e.preventDefault();
                          if (dynasties.length === 1) {
                            openDynastyActions(activeDynasty);
                            return;
                          }
                          setShowDynastyActions(false);
                          setSelectedDynasty(null);
                          navigate("/");
                        }}
                        title="Go to Schedule / Results"
                      >
                        <span>{activeDynasty.name}</span>
                        <span className="badge active">Active</span>
                      </a>
                    </>
                  ) : null}

                  {otherDynasties.map((d) => (
                    <a
                      key={d.id}
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        openDynastyActions(d);
                      }}
                    >
                      <span>{d.name}</span>
                    </a>
                  ))}
                </div>

              <div className="sidebarActionStack">
                {activeDynasty ? (
                  <button
                    className="primary"
                    onClick={() => setShowImportSeason(true)}
                    style={{ width: "100%" }}
                    disabled={!activeId}
                  >
                    + Upload New Season
                  </button>
                ) : null}

                <button
                  className="sidebarBtn"
                  onClick={() => setShowNewDynasty(true)}
                  style={{ width: "100%" }}
                >
                  + New Dynasty
                </button>

                <button
                  className="sidebarBtn"
                  onClick={() => {
                    resetImportState();
                    setShowBackupModal(true);
                  }}
                  style={{ width: "100%" }}
                >
                  Import / Export
                </button>

                <button
                  className="sidebarBtn"
                  onClick={() => setShowOptimizeModal(true)}
                  style={{ width: "100%" }}
                >
                  Optimize Database
                </button>
              </div>
            </>
          ) : null}
        </div>
          </aside>

          <main className="main">
          {dynasties.length === 0 && !showNewDynasty ? (
            <CreateDynastySplash onCreate={() => setShowNewDynasty(true)} />
          ) : dynasties.length === 0 ? null : (
              <div
                className={[
                  "card",
                  "routedCard",
                  isTeamsPage ? "cardWide" : "",
                  isSchedulePage ? "cardSchedule" : "",
                  location.pathname === "/coaches-poll" ? "pollRankingsCard" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
              <div className="breadcrumbRow">
                <BackBreadcrumb />
              </div>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/teams" element={<TeamsIndex />} />
                <Route path="/team/:tgid" element={<Team />} />
                <Route path="/team-stats" element={<TeamStats />} />
                <Route path="/player-stats" element={<PlayerStats />} />
                <Route path="/player/:playerUid" element={<Player />} />
                <Route path="/coaches" element={<Coaches />} />
                <Route path="/coaches-poll" element={<CoachesPollRankings />} />
                <Route path="/coach/:ccid" element={<Coach />} />
                <Route path="/postseason" element={<Postseason />} />
                <Route path="/postseason/bowl" element={<BowlResults />} />
                <Route path="/standings" element={<ConferenceStandings />} />
                <Route path="/import" element={<ImportSeason />} />
                <Route path="*" element={<div>Not found</div>} />
              </Routes>
            </div>
          )}
          </main>
        </div>
      )}

      {/* New Dynasty Modal */}
      {showNewDynasty && (
        <Modal title="Create New Dynasty" maxWidth={420}>
          <div className="importModal">
            <label className="importField">
              <span>Dynasty Name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., My Dynasty"
              />
            </label>

            <label className="importField">
              <span>Starting Year</span>
              <input
                type="number"
                value={newStartYear}
                onChange={(e) => setNewStartYear(Number(e.target.value))}
              />
            </label>

            {newErr && <p className="kicker" style={{ color: "#ff9b9b" }}>{newErr}</p>}

            <div className="importActions">
              {hasAnySeasons ? (
                <button onClick={() => setShowNewDynasty(false)}>Cancel</button>
              ) : null}
              <button className="primary" onClick={onCreateDynasty}>
                Create Dynasty
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Upload Season Modal */}
      {showImportSeason && (
        <Modal title="Upload New Season" maxWidth={420}>
          <ImportSeason
            inline
            hideCancel={!activeDynastyHasSeasons}
            onClose={() => {
              setShowImportSeason(false);
              setPendingFirstDynastyId(null);
            }}
            onImported={async (result) => {
              setShowImportSeason(false);
              if (pendingFirstDynastyId) {
                await loadDynasty(pendingFirstDynastyId);
                setPendingFirstDynastyId(null);
              }
              const importedSeasons = Array.isArray(result?.seasons) ? result.seasons : null;
              const latestImported =
                importedSeasons && importedSeasons.length
                  ? Math.max(...importedSeasons.map((s) => Number(s.seasonYear)).filter(Number.isFinite))
                  : Number.isFinite(Number(result?.seasonYear))
                    ? Number(result.seasonYear)
                    : null;

              if (latestImported != null) {
                const params = new URLSearchParams();
                params.set("season", String(latestImported));
                params.set("ts", String(Date.now()));
                navigate({ pathname: "/", search: `?${params.toString()}` });
              } else {
                navigate(`/?ts=${Date.now()}`);
              }
            }}
          />
        </Modal>
      )}

      {/* Dynasty Options Modal */}
      {showDynastyActions && selectedDynasty && (
        <Modal title="Dynasty Options">
          <p className="kicker">
            Selected: <b>{selectedDynasty.name}</b>
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowDynastyActions(false)}>Cancel</button>
            {dynasties.length > 1 ? (
              <button className="primary" onClick={() => loadDynasty(selectedDynasty.id)}>
                Load
              </button>
            ) : null}
            <button className="danger" onClick={askDeleteDynasty}>
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedDynasty && (
        <Modal title="Confirm Delete">
          <p>
            Delete dynasty <b>{selectedDynasty.name}</b>?
          </p>
          <p className="kicker">
            This permanently deletes all seasons, teams, and games for this dynasty.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="danger" onClick={confirmDeleteDynasty}>
              Yes, delete
            </button>
          </div>
        </Modal>
      )}

      {deletingDynasty && (
        <div className="modalOverlay">
          <div className="card" style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
            <div className="loadingSpinner" aria-hidden="true" />
            <div style={{ marginTop: 12, fontWeight: 700 }}>Deleting dynasty...</div>
            <div className="kicker" style={{ marginTop: 6 }}>
              Please wait while storage is cleared.
            </div>
          </div>
        </div>
      )}

      {deleteBlocked && (
        <Modal title="Unable to Clear Storage" maxWidth={520}>
          <p>
            The database could not be deleted because another tab or window is still using it.
          </p>
          <p className="kicker">
            Please close other tabs for this app and try deleting the dynasty again.
          </p>
          <div className="importActions">
            <button onClick={() => setDeleteBlocked(false)}>Close</button>
          </div>
        </Modal>
      )}

      {optimizeBusy && (
        <div className="modalOverlay">
          <div className="card" style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
            <div className="loadingSpinner" aria-hidden="true" />
            <div style={{ marginTop: 12, fontWeight: 700 }}>Optimizing database...</div>
            <div className="kicker" style={{ marginTop: 6 }}>
              Please wait while data is compacted.
            </div>
          </div>
        </div>
      )}

      {optimizeBlocked && (
        <Modal title="Unable to Optimize" maxWidth={520}>
          <p>
            The database could not be rebuilt because another tab or window is still using it.
          </p>
          <p className="kicker">
            Close other tabs for this app and try again.
          </p>
          <div className="importActions">
            <button onClick={() => setOptimizeBlocked(false)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Backup Modal */}
      {showBackupModal && (
        <Modal title="Import / Export">
          <div className="importModal backupModal">
            <div className="backupSection">
              <h3 style={{ marginTop: 0 }}>Export Database</h3>
              <p className="kicker importDescription">
                Exports the entire local database to one file.
              </p>
              <div className="importActions">
                <button className="primary" onClick={onExportDatabase}>
                  Export Database
                </button>
              </div>
            </div>

            <div className="backupDivider" />

            <div className="backupSection">
              <h3 style={{ marginTop: 0 }}>Import Database</h3>
              <p className="kicker importDescription">
                Only Dynasties with matching names will be overwritten.
              </p>

              <div className="backupFilePicker">
                <input
                  id="backupFileInput"
                  className="backupFileInput"
                  type="file"
                  accept=".json"
                  onChange={onSelectBackupFile}
                />
                <label className="fileButton" htmlFor="backupFileInput">
                  Choose Backup File
                </label>
                <div className="backupFileName">
                  {importFileName ? importFileName : "No file chosen"}
                </div>
              </div>

              {importPreview ? (
                <div className="backupPreview">
                  <div className="kicker">Dynasties in file: {importPreview.totalDynasties}</div>
                  <div className="kicker">
                    Will overwrite:{" "}
                    {importPreview.overwriteNames.length
                      ? importPreview.overwriteNames.join(", ")
                      : "None"}
                  </div>
                  <div className="kicker">
                    Will add:{" "}
                    {importPreview.addNames.length ? importPreview.addNames.join(", ") : "None"}
                  </div>
                </div>
              ) : null}

              {importErr ? (
                <div className="kicker backupError">{importErr}</div>
              ) : null}

              {importStatus ? (
                <div className="kicker backupStatus">{importStatus}</div>
              ) : null}

              <div className="importActions">
                <button
                  onClick={() => {
                    setShowBackupModal(false);
                    resetImportState();
                  }}
                >
                  Close
                </button>
                <button
                  className="primary"
                  onClick={onImportDatabase}
                  disabled={!importPayload || importBusy}
                >
                  Import Database
                </button>
              </div>
            </div>

          </div>
        </Modal>
      )}

      {showOptimizeModal && (
        <Modal title="Optimize Database" maxWidth={520}>
          <div className="importModal backupModal">
            <div className="backupSection">
              <p className="kicker importDescription">
                Compacts local storage by rebuilding the database. Dynasties remain intact.
              </p>
              <p className="kicker importDescription">
                <b>Only use this if experiencing storage or performance issue.</b>
              </p>
              {optimizeErr ? <div className="kicker backupError">{optimizeErr}</div> : null}
              <div className="importActions">
                <button onClick={() => setShowOptimizeModal(false)}>Close</button>
                <button
                  className="danger"
                  onClick={() => {
                    setShowOptimizeModal(false);
                    optimizeDatabase();
                  }}
                >
                  Optimize Database
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
