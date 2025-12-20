import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureDefaultDynasty } from "../db";
import { importSeasonBatch, seasonExists } from "../csvImport";

export default function ImportSeason() {
  const navigate = useNavigate();

  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await ensureDefaultDynasty();
      setSeasonYear(d.currentYear);
    })();
  }, []);

  function onPickFiles(e) {
    setFiles(Array.from(e.target.files || []));
  }

  async function onImport() {
    setStatus("");
    setBusy(true);
    try {
      const d = await ensureDefaultDynasty();
      const year = Number(seasonYear);

      const exists = await seasonExists({ dynastyId: d.id, seasonYear: year });
      if (exists) {
        const ok = window.confirm(
          `Season ${year} already exists for this dynasty.\n\nOverwrite it? This will delete and replace ALL records for ${year}.`
        );
        if (!ok) {
          setBusy(false);
          setStatus("Cancelled.");
          return;
        }
      }

      const result = await importSeasonBatch({ seasonYear: year, files });
      setStatus(`Imported ${result.seasonYear}: ${result.teams} teams, ${result.games} games`);
      setTimeout(() => navigate("/"), 400);
    } catch (err) {
      setStatus(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Import Season (Batch CSV Upload)</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Season Year</span>
          <input
            type="number"
            value={seasonYear}
            onChange={(e) => setSeasonYear(e.target.value)}
            style={{ width: 120 }}
            disabled={busy}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>CSV Files</span>
          <input type="file" accept=".csv,text/csv" multiple onChange={onPickFiles} disabled={busy} />
        </label>

        <button onClick={onImport} disabled={busy}>
          {busy ? "Importing..." : "Import"}
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

      <p style={{ marginTop: 16 }}>
        Required (Phase 1): files ending in <b>TEAM.csv</b> and <b>SCHD.csv</b> (only last 4 chars before .csv are checked).
      </p>
    </div>
  );
}
