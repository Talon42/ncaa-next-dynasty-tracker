import { NavLink, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ImportSeason from "./pages/ImportSeason";

const linkStyle = ({ isActive }) => ({
  marginRight: 12,
  textDecoration: "none",
  fontWeight: isActive ? "700" : "400",
});

export default function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1>NCAA Next Dynasty Tracker</h1>

      <nav style={{ marginBottom: 16 }}>
        <NavLink to="/" end style={linkStyle}>
          Schedule / Results
        </NavLink>
        <NavLink to="/import" style={linkStyle}>
          Import Season
        </NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/import" element={<ImportSeason />} />
        <Route path="*" element={<div>Not found</div>} />
      </Routes>
    </div>
  );
}
