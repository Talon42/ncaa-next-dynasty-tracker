import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

export default function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1>NCAA Next Dynasty Tracker</h1>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<div>Not found</div>} />
      </Routes>
    </div>
  );
}