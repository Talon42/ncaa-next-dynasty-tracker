import { useEffect, useMemo, useState } from "react";
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
  const [dynastyOpen, setDynastyOpen] = useState(true);

  const [showNewDynasty, setShowNewDynasty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStartYear, setNewStartYear] = useState(2025);
  const [newErr, setNewErr] = useState("");

  const [showDynastyActions, setShowDynastyActions] = useState(false);
  const [selectedDynasty, setSelectedDynasty] = useState(null);
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
          </div>

          {/* Dynasties section */}
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
            ) : null}
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
    </div>
  );
}
