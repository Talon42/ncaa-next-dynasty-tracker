import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, getActiveDynastyId, getDynasty } from "../db";
import { importSeasonBatch, seasonExists } from "../csvImport";

function Modal({ title, children, onCancel, onConfirm, confirmText }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#141414",
          color: "#f1f1f1",
          border: "1px solid #333",
          borderRadius: 8,
          width: "100%",
          maxWidth: 560,
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid #333" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>

        <div style={{ padding: 16 }}>{children}</div>

        <div style={{ padding: 16, borderTop: "1px solid #333", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export default function ImportSeason() {
  const navigate = useNavigate();

  const [dynastyId, setDynastyId] = useState(null);
  const [dynastyName, setDynastyName] = useState("");
  const [seasonYear, setSeasonYear] = useState(2025);
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [existingYears, setExistingYears] = useState([]);
  const [willOverwrite, setWillOverwrite] = useState(false);

  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingYear, setPendingYear] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);

  useEffect(() => {
    (async () => {
      const id = await getActiveDynastyId();
      setDynastyId(id);
      const d = await getDynasty(id);
      setDynastyName(d?.name ?? "");
      setSeasonYear(d?.currentYear ?? 2025);

      if (!id) return;

      const allGames = await db.games.where({ dynastyId: id }).toArray();
      const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
      setExistingYears(years);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!dynastyId) return;
        const yearNum = Number(seasonYear);
        if (!Number.isFinite(yearNum)) {
          setWillOverwrite(false);
          return;
        }
        const exists = await seasonExists({ dynastyId, seasonYear: yearNum });
        setWillOverwrite(exists);
      } catch {
        setWillOverwrite(false);
      }
    })();
  }, [dynastyId, seasonYear]);

  const existingYearsLabel = useMemo(() => (existingYears.length ? existingYears.join(", ") : "None yet"), [existingYears]);

  function onPickFiles(e) {
    setFiles(Array.from(e.target.files || []));
  }

  async function refreshExistingYears() {
    const allGames = await db.games.where({ dynastyId }).toArray();
    const years = Array.from(new Set(allGames.map((g) => g.seasonYear))).sort((a, b) => b - a);
    setExistingYears(years);
  }

  async function runImport(yearNum, filesToUse) {
    setStatus("");
    setBusy(true);
    try {
      const result = await importSeasonBatch({ dynastyId, seasonYear: yearNum, files: filesToUse });
      await refreshExistingYears();
      setStatus(`Imported ${result.seasonYear}: ${result.teams} teams, ${result.games} games`);
      setTimeout(() => navigate("/"), 400);
    } catch (err) {
      setStatus(err && err.message ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onImportClicked() {
    setStatus("");

    if (!dynastyId) {
      setStatus("No dynasty loaded. Select a dynasty from the sidebar.");
      return;
    }

    const yearNum = Number(seasonYear);
    if (!Number.isFinite(yearNum)) {
      setStatus("Season year must be a valid number.");
      return;
    }
    if (!files.length) {
    setStatus("Please select TEAM.csv, SCHD.csv, TSSE.csv, and BOWL.csv.");
      return;
    }

    const exists = await seasonExists({ dynastyId, seasonYear: yearNum });
    if (exists) {
      setPendingYear(yearNum);
      setPendingFiles(files);
      setShowOverwriteModal(true);
      return;
    }

    await runImport(yearNum, files);
  }

  function cancelOverwrite() {
    setShowOverwriteModal(false);
    setPendingYear(null);
    setPendingFiles([]);
    setStatus("Cancelled overwrite.");
  }

  async function confirmOverwrite() {
    const yearNum = pendingYear;
    const filesToUse = pendingFiles;
    setShowOverwriteModal(false);
    setPendingYear(null);
    setPendingFiles([]);
    if (yearNum == null) return;
    await runImport(yearNum, filesToUse);
  }

  return (
    <div>
      <div className="hrow">
        <div>
          <h2>Import Season</h2>
          {dynastyName ? <p className="kicker">Dynasty: {dynastyName}</p> : <p className="kicker">No dynasty loaded.</p>}
        </div>
      </div>

      {dynastyId ? (
        <div style={{ marginBottom: 10 }}>
          <b>Existing seasons:</b> {existingYearsLabel}
        </div>
      ) : null}

      {willOverwrite ? (
        <div style={{ padding: 10, border: "1px solid #caa", marginBottom: 12 }}>
          <b>Overwrite warning:</b> Season <b>{seasonYear}</b> already exists. Importing will delete and replace that season’s data.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Season Year</span>
          <input type="number" value={seasonYear} onChange={(e) => setSeasonYear(e.target.value)} style={{ width: 120 }} disabled={busy} />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>CSV Files</span>
          <input type="file" accept=".csv,text/csv" multiple onChange={onPickFiles} disabled={busy} />
        </label>

        <button className="primary" onClick={onImportClicked} disabled={busy}>
          {busy ? "Importing..." : willOverwrite ? "Overwrite Season" : "Import Season"}
        </button>

        <button onClick={() => navigate("/")} disabled={busy}>
          Cancel
        </button>
      </div>

      <div>
        <h3 style={{ marginBottom: 6 }}>Selected files</h3>
        {files.length ? (
          <ul>
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        ) : (
          <p>No files selected yet.</p>
        )}
      </div>

      {status ? (
        <p style={{ marginTop: 12 }}>
          <b>Status:</b> {status}
        </p>
      ) : null}

      {showOverwriteModal ? (
        <Modal title="Overwrite Season?" onCancel={cancelOverwrite} onConfirm={confirmOverwrite} confirmText="Yes, overwrite">
          <p style={{ marginTop: 0 }}>
            Season <b>{pendingYear}</b> already exists.
          </p>
          <p>
            This will <b>DELETE</b> and <b>REPLACE</b> all stored records for that season year (TEAM + SCHD, and future required CSVs).
          </p>
          <p style={{ marginBottom: 0 }}>Continue?</p>
        </Modal>
      ) : null}
    </div>
  );
}
