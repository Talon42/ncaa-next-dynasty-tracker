import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import ImportSeason from "./pages/ImportSeason";
import {
  createDynasty,
  deleteDynasty,
  getActiveDynastyId,
  listDynasties,
  setActiveDynastyId,
} from "./db";

function Modal({ title, children, onClose }) {
  return (
    <div className="modalOverlay">
      <div className="card" style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();

  const [dynasties, setDynasties] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // New dynasty modal
  const [showNewDynasty, setShowNewDynasty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStartYear, setNewStartYear] = useState(2024);
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

  function openDynastyActions(d) {
    setSelectedDynasty(d);
    setShowDynastyActions(true);
  }

  async function loadDynasty(id) {
    await setActiveDynastyId(id);
    setActiveId(id);
    setShowDynastyActions(false);
    setSelectedDynasty(null);

    // Go to home page (schedule/results)
    navigate("/");

    // Simple/robust refresh for now so all pages pick up new active dynasty
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

    // Always go home after delete (per your requirement)
    navigate("/");
    window.location.reload();
  }

  async function onCreateDynasty() {
    setNewErr("");
    try {
      const d = await createDynasty({ name: newName, startYear: newStartYear });
      setShowNewDynasty(false);
      setNewName("");
      setNewStartYear(2024);
      await refresh();

      // After creating, load it and go home
      await loadDynasty(d.id);
    } catch (e) {
      setNewErr(e?.message || String(e));
    }
  }

  return (
    <div className="shell">
      <div className="shellGrid">
        <aside className="sidebar">
          <div className="brandRow">
            <h1>NCAA Next Dynasty Tracker</h1>
            <span className="badge">Local • Offline</span>
          </div>

          <button
            className="primary"
            onClick={() => navigate("/import")}
            style={{ width: "100%", marginBottom: 10 }}
          >
            + Upload New Season
          </button>

          <div className="sideSection">
            <div className="sideTitle">Dynasties</div>

            <button onClick={() => setShowNewDynasty(true)} style={{ width: "100%", marginBottom: 10 }}>
              + New Dynasty
            </button>

            <div className="sideNav">
              {dynasties.map((d) => (
                <a
                  key={d.id}
                  href="#"
                  className={d.id === activeId ? "active" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    openDynastyActions(d);
                  }}
                >
                  <span>{d.name}</span>
                  {d.id === activeId ? <span className="badge">Loaded</span> : null}
                </a>
              ))}
            </div>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Version</div>
            <p className="kicker" style={{ marginTop: 0 }}>
              v0.4 • Dynasties actions
            </p>
          </div>
        </aside>

        <main className="main">
          <div className="card">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/import" element={<ImportSeason />} />
              <Route path="*" element={<div>Not found</div>} />
            </Routes>
          </div>
        </main>
      </div>

      {/* New Dynasty Modal */}
      {showNewDynasty ? (
        <Modal title="Create New Dynasty" onClose={() => setShowNewDynasty(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Dynasty Name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Talon Dynasty"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>Starting Year</span>
              <input type="number" value={newStartYear} onChange={(e) => setNewStartYear(e.target.value)} />
            </label>

            {newErr ? (
              <p className="kicker" style={{ color: "#ff9b9b" }}>
                {newErr}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewDynasty(false)}>Cancel</button>
              <button className="primary" onClick={onCreateDynasty}>
                Create Dynasty
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Dynasty Actions Modal */}
      {showDynastyActions && selectedDynasty ? (
        <Modal title="Dynasty Options" onClose={() => setShowDynastyActions(false)}>
          <p className="kicker" style={{ marginTop: 0 }}>
            Selected: <b>{selectedDynasty.name}</b>
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                setShowDynastyActions(false);
                setSelectedDynasty(null);
              }}
            >
              Cancel
            </button>

            <button className="danger" onClick={askDeleteDynasty}>
              Delete
            </button>

            <button className="primary" onClick={() => loadDynasty(selectedDynasty.id)}>
              Load
            </button>
          </div>
        </Modal>
      ) : null}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedDynasty ? (
        <Modal title="Confirm Delete" onClose={() => setShowDeleteConfirm(false)}>
          <p style={{ marginTop: 0 }}>
            Delete dynasty <b>{selectedDynasty.name}</b>?
          </p>
          <p className="kicker">
            This will permanently delete all seasons, teams, and games for this dynasty from your local database.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="danger" onClick={confirmDeleteDynasty}>
              Yes, delete
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
