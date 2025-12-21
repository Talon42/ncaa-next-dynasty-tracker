import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { requestPersistentStorage } from "./persistence";
import "./styles.css";
import {
  ensureBundledLogoBaseLoaded,
  refreshTeamLogosForActiveDynastyMostRecentSeason,
} from "./logoService";

requestPersistentStorage();

// Silent: load CSV base + refresh active dynasty mappings
(async () => {
  try {
    await ensureBundledLogoBaseLoaded();
    await refreshTeamLogosForActiveDynastyMostRecentSeason();
  } catch {
    // silent by design
  }
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* basename fixes GitHub Pages deployments under a repo subpath */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
