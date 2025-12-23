// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import ImportSeason from "./pages/ImportSeason";
import Team from "./pages/Team";
import ConferenceStandings from "./pages/ConferenceStandings";
import TeamsIndex from "./pages/TeamsIndex";
import TeamStats from "./pages/TeamStats";
import Postseason from "./pages/Postseason";
import BowlResults from "./pages/BowlResults";

import {
  createDynasty,
  db,
  deleteDynasty,
  getActiveDynastyId,
  listDynasties,
  setActiveDynastyId,
} from "./db";

function Modal({ title, children }) {
  return (
    <div className="modalOverlay">
      <div className="card" style={{ width: "100%", maxWidth: 560 }}>
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
    location.pathname === "/postseason";

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

  return (
    <div className="shell">
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
                <button
                  className="sidebarBtn"
                  onClick={() => setShowNewDynasty(true)}
                  style={{ width: "100%", marginBottom: 10 }}
                >
                  + New Dynasty
                </button>

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

                      <button
                        className="primary"
                        onClick={() => setShowImportSeason(true)}
                        style={{ width: "100%", marginTop: 6, marginBottom: 6 }}
                        disabled={!activeId}
                      >
                        + Upload New Season
                      </button>
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
              </>
            ) : null}
          </div>
        </aside>

        <main className="main">
          {dynasties.length === 0 && !showNewDynasty ? (
            <CreateDynastySplash onCreate={() => setShowNewDynasty(true)} />
          ) : dynasties.length === 0 ? null : (
            <div className={`card routedCard ${isTeamsPage ? "cardWide" : ""}`}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/teams" element={<TeamsIndex />} />
                <Route path="/team/:tgid" element={<Team />} />
                <Route path="/team-stats" element={<TeamStats />} />
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
        <Modal title="Create New Dynasty">
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
        <Modal title="Upload New Season">
          <ImportSeason
            inline
            hideCancel={!hasAnySeasons}
            onClose={() => {
              setShowImportSeason(false);
              setPendingFirstDynastyId(null);
            }}
            onImported={async () => {
              setShowImportSeason(false);
              if (pendingFirstDynastyId) {
                await loadDynasty(pendingFirstDynastyId);
                setPendingFirstDynastyId(null);
              }
              navigate(`/?ts=${Date.now()}`);
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

    </div>
  );
}
