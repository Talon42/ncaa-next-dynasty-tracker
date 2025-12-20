import { NavLink, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ImportSeason from "./pages/ImportSeason";

export default function App() {
  return (
    <div className="shell">
      <div className="shellGrid">
        <aside className="sidebar">
          <div className="brandRow">
            <h1>NCAA Next Dynasty Tracker</h1>
            <span className="badge">Local • Offline</span>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Navigation</div>
            <nav className="sideNav">
              <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
                Schedule / Results
              </NavLink>
              <NavLink to="/import" className={({ isActive }) => (isActive ? "active" : "")}>
                Import Season
              </NavLink>
            </nav>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Dynasties (coming soon)</div>
            <p className="kicker" style={{ marginTop: 0 }}>
              Next we’ll add multiple dynasties and switching here.
            </p>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Version</div>
            <p className="kicker" style={{ marginTop: 0 }}>
              v0.1 • Theme + Import + Schedule
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
    </div>
  );
}
