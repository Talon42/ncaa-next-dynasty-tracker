import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { requestPersistentStorage } from "./persistence";
import "./styles.css";
import { ensureBundledLogoBaseLoaded } from "./logoService";

requestPersistentStorage(); // best-effort; safe if unsupported

// Silent: pre-load base logo CSV if present
ensureBundledLogoBaseLoaded().catch(() => {});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
