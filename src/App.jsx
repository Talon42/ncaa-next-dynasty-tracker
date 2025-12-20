import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import ImportSeason from "./pages/ImportSeason";
import { createDynasty, deleteDynasty, getActiveDynastyId, listDynasties, setActiveDynastyId } from "./db";

function Modal({ title, children }) {
  return (
    <div className="modalOverlay">
      <div className="card" style={{ width: "100%", maxWidth: 560 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function CreateDynastySplash({ onCreate }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Create your first dynasty</h2>
      <p className="kicker">
        Dynasties are stored locally on your PC. Create one to start importing seasons.
      </p>
      <button className="primary" onClick={onCreate}>
        + New Dynasty
      </button>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();

  const [dynasties, setDynasties] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // Collapsible sidebar section
  const [dynastyOpen, setDynastyOpen] = useState(true);

  // New dynasty modal
  const [showNewDynasty, setShowNewDynasty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStartYear, setNewStartYear] = useState(2025);
  const [newErr, setNewErr] = useState("");

  // Dynasty action modal (load/delete)
  const [showDynastyActions, setShowDynastyActions] = useState(false);
  const [selectedDynasty, setSelectedDynasty] = useState(null);

  // Delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function refresh() {
    const list = await listDynasties();
    setDynasties(list);
    const id = await getActiveDynastyId();
    setActiveId(id);
  }

  useEffect(() => {
    refresh();
  }, []);

  const activeDynasty = useMemo(() => dynasties.find((d) => d.id === activeId) || null, [dynasties, activeId]);
  const otherDynasties = useMemo(() => dynasties.filter((d) => d.id !== activeId), [dynasties, activeId]);

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
      const d = await createDynasty({ name: newName, startYear: newStartYear });
      setShowNewDynasty(false);
      setNewName("");
      setNewStartYear(2025);
      await refresh();
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
            <span className="badge">Local • Offline</span>
          </div>

          {/* Dynasties section (collapsible) */}
          <div className="sideSection" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
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
                  {/* Active first */}
                  {activeDynasty ? (
                    <>
                      <a
                        href="#"
                        className="active"
                        onClick={(e) => {
                          e.preventDefault();
                          openDynastyActions(activeDynasty);
                        }}
                      >
                        <span>{activeDynasty.name}</span>
                        <span className="badge active">Active</span>
                      </a>

                      {/* Upload directly beneath active dynasty */}
                      <button
                        className="primary"
                        onClick={() => navigate("/import")}
                        style={{ width: "100%", marginTop: 6, marginBottom: 6 }}
                        disabled={!activeId}
                      >
                        + Upload New Season
                      </button>
                    </>
                  ) : null}

                  {/* If dynasties exist but none active */}
                  {!activeDynasty && dynasties.length > 0 ? (
                    <>
                      <button className="primary" style={{ width: "100%" }} disabled>
                        + Upload New Season
                      </button>
                      <p className="kicker" style={{ marginTop: 8 }}>
                        Select a dynasty to load it.
                      </p>
                    </>
                  ) : null}

                  {/* Other dynasties */}
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

                  {dynasties.length === 0 ? (
                    <p className="kicker" style={{ marginTop: 8 }}>
                      No dynasties yet.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              /* Collapsed state: show active + upload only (compact) */
              <div className="sideNav">
                {activeDynasty ? (
                  <>
                    <a
                      href="#"
                      className="active"
                      onClick={(e) => {
                        e.preventDefault();
                        openDynastyActions(activeDynasty);
                      }}
                    >
                      <span>{activeDynasty.name}</span>
                      <span className="badge active">Active</span>
                    </a>

                    <button className="primary" onClick={() => navigate("/import")} style={{ width: "100%" }} disabled={!activeId}>
                      + Upload New Season
                    </button>
                  </>
                ) : (
                  <p className="kicker" style={{ marginTop: 0 }}>
                    Expand to manage dynasties.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="sideSection">
            <div className="sideTitle">Version</div>
            <p className="kicker" style={{ marginTop: 0 }}>v0.6 • UI polish</p>
          </div>
        </aside>

        <main className="main">
          {dynasties.length === 0 ? (
            <CreateDynastySplash onCreate={() => setShowNewDynasty(true)} />
          ) : (
            <div className="card">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/import" element={<ImportSeason />} />
                <Route path="*" element={<div>Not found</div>} />
              </Routes>
            </div>
          )}
        </main>
      </div>

      {/* New Dynasty Modal */}
      {showNewDynasty ? (
        <Modal title="Create New Dynasty">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Dynasty Name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., My Dynasty"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Starting Year</span>
              <input type="number" value={newStartYear} onChange={(e) => setNewStartYear(e.target.value)} />
            </label>

            {newErr ? <p className="kicker" style={{ color: "#ff9b9b" }}>{newErr}</p> : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewDynasty(false)}>Cancel</button>
              <button className="primary" onClick={onCreateDynasty}>Create Dynasty</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Dynasty Actions Modal */}
      {showDynastyActions && selectedDynasty ? (
        <Modal title="Dynasty Options">
          <p className="kicker" style={{ marginTop: 0 }}>
            Selected: <b>{selectedDynasty.name}</b>
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowDynastyActions(false); setSelectedDynasty(null); }}>
              Cancel
            </button>
            <button className="danger" onClick={askDeleteDynasty}>Delete</button>
            <button className="primary" onClick={() => loadDynasty(selectedDynasty.id)}>Load</button>
          </div>
        </Modal>
      ) : null}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedDynasty ? (
        <Modal title="Confirm Delete">
          <p style={{ marginTop: 0 }}>
            Delete dynasty <b>{selectedDynasty.name}</b>?
          </p>
          <p className="kicker">
            This will permanently delete all seasons, teams, and games for this dynasty from your local database.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowDeleteConfirm(false); setShowDynastyActions(true); }}>
              Cancel
            </button>
            <button className="danger" onClick={confirmDeleteDynasty}>Yes, delete</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
