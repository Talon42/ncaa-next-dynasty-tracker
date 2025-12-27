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

  const [showDynastyActions, setShowDynastyActions] = useState(false);
  const [selectedDynasty, setSelectedDynasty] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [importPayload, setImportPayload] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importErr, setImportErr] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [openHeaderPanel, setOpenHeaderPanel] = useState(null);
  const lastRouteRef = useRef("");

  async function refresh() {
    const list = await listDynasties();
    setDynasties(list);
    const id = await getActiveDynastyId();
    setActiveId(id);
    const gamesCount = await db.games.count();
    setHasAnySeasons(gamesCount > 0);
  }

  useEffect(() => {
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

    await deleteDynasty(d.id);
    await refresh();
    navigate("/");
    window.location.reload();
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
      const isFirstDynasty = dynasties.length === 0;
      const d = await createDynasty({ name: newName, startYear: newStartYear });
      setShowNewDynasty(false);
      setNewName("");
      setNewStartYear(2025);
      await refresh();
      if (isFirstDynasty) {
        setPendingFirstDynastyId(d.id);
        setShowImportSeason(true);
        return;
      }
      await loadDynasty(d.id);
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
      <div className="shellGrid">
        <aside className="sidebar">
          <div className="brandRow" style={{ marginBottom: 10 }}>
            <h1>NCAA Next Dynasty Tracker</h1>
          </div>

          {/* Navigation (outside Dynasties section) */}
          <div className="sideSection" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
            <div className="sideTitle" style={{ marginBottom: 8 }}>
              Navigation
            </div>

            <div className="sideNav">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/");
                }}
                title="Schedule / Results"
              >
                <span>Schedule / Results</span>
              </a>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/teams");
                }}
                title="Teams"
              >
                <span>Teams</span>
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/team-stats");
                }}
                title="Team Stats"
              >
                <span>Team Stats</span>
              </a>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/coaches");
                }}
                title="Coaches"
              >
                <span>Coaches</span>
              </a>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/coaches-poll");
                }}
                title="Coach's Poll Rankings"
              >
                <span>Coach&apos;s Poll Rankings</span>
              </a>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/postseason");
                }}
                title="Postseason"
              >
                <span>Postseason</span>
              </a>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                navigate(`/standings?conf=All&ts=${Date.now()}`);
                }}
                title="Conference Standings"
              >
                <span>Conference Standings</span>
              </a>
            </div>
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
            hideCancel={!hasAnySeasons}
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

    </div>
  );
}
