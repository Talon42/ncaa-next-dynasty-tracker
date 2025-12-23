import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, getActiveDynastyId, getDynasty } from "../db";
import { importSeasonBatch, seasonExists } from "../csvImport";

const REQUIRED_TYPES = ["TEAM", "SCHD", "TSSE", "BOWL", "COCH"];

function getTypeFromName(fileName) {
  const m = String(fileName ?? "").match(/([A-Za-z0-9]{4})\.csv$/i);
  return m ? m[1].toUpperCase() : null;
}

function findSeasonYearFromPath(relativePath) {
  const parts = String(relativePath ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const p of parts) {
    if (!/^\d{4}$/.test(p)) continue;
    const year = Number(p);
    if (Number.isFinite(year)) return year;
  }

  return null;
}

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

export default function ImportSeason({ inline = false, onClose, onImported, hideCancel = false } = {}) {
  const navigate = useNavigate();

  const [dynastyId, setDynastyId] = useState(null);
  const [dynastyName, setDynastyName] = useState("");
  const [mode, setMode] = useState("single"); // single | bulk
  const [seasonYear, setSeasonYear] = useState(2025);
  const [files, setFiles] = useState([]);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [existingYears, setExistingYears] = useState([]);
  const [willOverwrite, setWillOverwrite] = useState(false);

  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingYear, setPendingYear] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);

  const [showBulkOverwriteModal, setShowBulkOverwriteModal] = useState(false);
  const [pendingBulkSeasons, setPendingBulkSeasons] = useState([]);
  const [pendingBulkOverwriteYears, setPendingBulkOverwriteYears] = useState([]);

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
        if (mode !== "single") {
          setWillOverwrite(false);
          return;
        }
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
  }, [dynastyId, seasonYear, mode]);

  const existingYearsLabel = useMemo(() => (existingYears.length ? existingYears.join(", ") : "None yet"), [existingYears]);

  function onPickFiles(e) {
    setFiles(Array.from(e.target.files || []));
  }

  function onPickBulkFolders(e) {
    setBulkFiles(Array.from(e.target.files || []));
  }

  const bulkParsed = useMemo(() => {
    const invalid = [];
    const byYear = new Map();

    for (const f of bulkFiles) {
      if (!String(f?.name ?? "").toLowerCase().endsWith(".csv")) continue;

      const rel = f?.webkitRelativePath || f?.relativePath || f?.name;
      const year = findSeasonYearFromPath(rel);
      if (!year) {
        invalid.push(f);
        continue;
      }

      const cur = byYear.get(year) || [];
      cur.push(f);
      byYear.set(year, cur);
    }

    const seasons = Array.from(byYear.entries())
      .map(([year, seasonFiles]) => {
        const seen = new Set();
        for (const f of seasonFiles) {
          const t = getTypeFromName(f.name);
          if (t) seen.add(t);
        }
        const missingTypes = REQUIRED_TYPES.filter((t) => !seen.has(t));
        const fileNames = seasonFiles.map((f) => f.name).sort((a, b) => a.localeCompare(b));
        return { year, files: seasonFiles, missingTypes, fileNames };
      })
      .sort((a, b) => a.year - b.year);

    return { seasons, invalid };
  }, [bulkFiles]);

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
      sessionStorage.setItem("seasonUploadComplete", String(Date.now()));
      sessionStorage.setItem("seasonUploadLatest", String(result.seasonYear));
      setTimeout(() => {
        if (onImported) {
          onImported(result);
          return;
        }
        navigate(`/?ts=${Date.now()}`);
      }, 400);
    } catch (err) {
      setStatus(err && err.message ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runBulkImport(seasonsToImport) {
    setStatus("");
    setBusy(true);
    try {
      const results = [];
      for (let i = 0; i < seasonsToImport.length; i++) {
        const s = seasonsToImport[i];
        setStatus(`Importing ${s.year} (${i + 1}/${seasonsToImport.length})...`);
        // eslint-disable-next-line no-await-in-loop
        const r = await importSeasonBatch({ dynastyId, seasonYear: s.year, files: s.files });
        results.push(r);
      }

      await refreshExistingYears();
      setStatus(
        `Imported ${results.length} season${results.length === 1 ? "" : "s"}: ${results
          .map((r) => r.seasonYear)
          .join(", ")}`
      );
      sessionStorage.setItem("seasonUploadComplete", String(Date.now()));
      if (results.length) {
        const latestImported = Math.max(...results.map((r) => Number(r.seasonYear)).filter(Number.isFinite));
        if (Number.isFinite(latestImported)) {
          sessionStorage.setItem("seasonUploadLatest", String(latestImported));
        }
      }
      setTimeout(() => {
        if (onImported) {
          onImported({ seasons: results });
          return;
        }
        navigate(`/?ts=${Date.now()}`);
      }, 400);
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

    if (mode === "bulk") {
      const seasonsToImport = bulkParsed.seasons;

      if (!seasonsToImport.length) {
        setStatus(
          "Please select a root folder that contains year folders (e.g., 2025, 2026) with TEAM/SCHD/TSSE/BOWL/COCH CSVs."
        );
        return;
      }

      const bad = seasonsToImport.filter((s) => s.missingTypes.length);
      if (bad.length) {
        setStatus(
          `Missing required CSV(s) for: ${bad
            .map((s) => `${s.year} (${s.missingTypes.join(", ")})`)
            .join("; ")}. Required: TEAM, SCHD, TSSE, BOWL, and COCH.`
        );
        return;
      }

      const overwriteYears = [];
      for (const s of seasonsToImport) {
        // eslint-disable-next-line no-await-in-loop
        const exists = await seasonExists({ dynastyId, seasonYear: s.year });
        if (exists) overwriteYears.push(s.year);
      }

      if (overwriteYears.length) {
        setPendingBulkSeasons(seasonsToImport);
        setPendingBulkOverwriteYears(overwriteYears);
        setShowBulkOverwriteModal(true);
        return;
      }

      await runBulkImport(seasonsToImport);
      return;
    }

    const yearNum = Number(seasonYear);
    if (!Number.isFinite(yearNum)) {
      setStatus("Season year must be a valid number.");
      return;
    }
    if (!files.length) {
      setStatus("Please select TEAM.csv, SCHD.csv, TSSE.csv, BOWL.csv, and COCH.csv.");
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

  function cancelBulkOverwrite() {
    setShowBulkOverwriteModal(false);
    setPendingBulkSeasons([]);
    setPendingBulkOverwriteYears([]);
    setStatus("Cancelled bulk overwrite.");
  }

  async function confirmBulkOverwrite() {
    const seasonsToImport = pendingBulkSeasons;
    setShowBulkOverwriteModal(false);
    setPendingBulkSeasons([]);
    setPendingBulkOverwriteYears([]);
    if (!seasonsToImport?.length) return;
    await runBulkImport(seasonsToImport);
  }

  return (
    <div>
      {!inline ? (
        <div className="hrow">
          <div>
            <h2>Import Season</h2>
            {dynastyName ? (
              <p className="kicker">Dynasty: {dynastyName}</p>
            ) : (
              <p className="kicker">No dynasty loaded.</p>
            )}
          </div>
        </div>
      ) : null}

      {mode === "single" && willOverwrite ? (
        <div style={{ padding: 10, border: "1px solid #caa", marginBottom: 12 }}>
          <b>Overwrite warning:</b> Season <b>{seasonYear}</b> already exists. Importing will delete and replace that season&apos;s data.
        </div>
      ) : null}

      <div className="importModal">
        <div style={{ display: "flex", width: "100%", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className={mode === "single" ? "primary" : ""}
            onClick={() => {
              setMode("single");
              setStatus("");
            }}
            disabled={busy}
          >
            Single Season
          </button>
          <button
            className={mode === "bulk" ? "primary" : ""}
            onClick={() => {
              setMode("bulk");
              setStatus("");
            }}
            disabled={busy}
          >
            Bulk Seasons
          </button>
        </div>

        <div className="kicker" style={{ marginTop: -12 }}>
          Existing seasons: {existingYearsLabel}
        </div>

        {mode === "single" ? (
          <label className="importField">
            <span>Season Year</span>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(e.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}

        {mode === "single" ? (
          <label className="importField">
            <span>CSV Files</span>
            <input
              id="importFiles"
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={onPickFiles}
              disabled={busy}
              style={{ display: "none" }}
            />
            <label htmlFor="importFiles" className="fileButton">
              {files.length ? `Choose Files (${files.length})` : "Choose Files"}
            </label>

            <div className="importFilesMeta">
              {files.length ? (
                <>
                  <div className="kicker">Selected: {files.length} file{files.length === 1 ? "" : "s"}</div>
                  <div className="importFilesList">
                    {files.map((f) => (
                      <div key={f.name} className="importFileName">
                        {f.name}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="kicker">No files selected yet.</div>
              )}
            </div>
          </label>
        ) : (
          <label className="importField">
            <span>Seasons Folder</span>
            <div className="kicker" style={{ marginTop: -6 }}>
              Select the parent folder that contains your year folders (e.g., <b>2025</b>, <b>2026</b>). Files can be nested; the app searches for a 4-digit year in each path.
            </div>
            <input
              id="importFolders"
              type="file"
              accept=".csv,text/csv"
              // @ts-ignore - non-standard attributes supported by Chromium-based browsers
              webkitdirectory=""
              // @ts-ignore
              directory=""
              // @ts-ignore
              mozdirectory=""
              onChange={onPickBulkFolders}
              disabled={busy}
              style={{ display: "none" }}
            />
            <label htmlFor="importFolders" className="fileButton">
              {bulkFiles.length
                ? `Choose Folder (${bulkParsed.seasons.length} season${bulkParsed.seasons.length === 1 ? "" : "s"})`
                : "Choose Folder"}
            </label>

            <div className="importFilesMeta">
              {bulkParsed.seasons.length ? (
                <>
                  <div className="kicker">
                    Detected: {bulkParsed.seasons.length} season{bulkParsed.seasons.length === 1 ? "" : "s"} ({bulkParsed.seasons.map((s) => s.year).join(", ")})
                  </div>
                  <div className="importFilesList">
                    {bulkParsed.seasons.map((s) => (
                      <div key={s.year} className="importFileName">
                        <b>{s.year}</b> — {s.fileNames.join(", ")}
                        {s.missingTypes.length ? ` (missing: ${s.missingTypes.join(", ")})` : ""}
                      </div>
                    ))}
                  </div>
                  {bulkParsed.invalid.length ? (
                    <div className="kicker" style={{ marginTop: 8, color: "#ff9b9b" }}>
                      {bulkParsed.invalid.length} file{bulkParsed.invalid.length === 1 ? "" : "s"} ignored (couldn&apos;t find a 4-digit year folder in the path).
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="kicker">No folders selected yet.</div>
              )}
            </div>
          </label>
        )}

        <div className="importActions">
          {!hideCancel ? (
            <button
              onClick={() => {
                if (onClose) {
                  onClose();
                  return;
                }
                navigate("/");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}

          <button className="primary" onClick={onImportClicked} disabled={busy}>
            {busy
              ? "Importing..."
              : mode === "bulk"
                ? "Import Seasons"
                : willOverwrite
                  ? "Overwrite Season"
                  : "Import Season"}
          </button>
        </div>
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

      {showBulkOverwriteModal ? (
        <Modal title="Overwrite Seasons?" onCancel={cancelBulkOverwrite} onConfirm={confirmBulkOverwrite} confirmText="Yes, overwrite">
          <p style={{ marginTop: 0 }}>
            These seasons already exist: <b>{pendingBulkOverwriteYears.join(", ")}</b>
          </p>
          <p>
            Bulk import will <b>DELETE</b> and <b>REPLACE</b> all stored records for each of those season years.
          </p>
          <p style={{ marginBottom: 0 }}>Continue?</p>
        </Modal>
      ) : null}
    </div>
  );
}
