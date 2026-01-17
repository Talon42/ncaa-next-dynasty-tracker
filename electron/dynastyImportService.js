import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { extractDynastyDatabasesToTempFiles } from "./tdbExtract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export const REQUIRED_TYPES = [
  "TEAM",
  "SCHD",
  "TSSE",
  "BOWL",
  "COCH",
  "PRLU",
  "PLAY",
  "PSOF",
  "PSDE",
  "PSKI",
  "PSKP",
  // Offensive line stats (not present in older saves)
  "PSOL",
  "AAPL",
  "OSPA",
];

export function exportCsvFromDynastyFile({ dynastyFilePath, maxRows } = {}) {
  if (!dynastyFilePath) throw new Error("Missing dynastyFilePath");

  const extracted = extractDynastyDatabasesToTempFiles(dynastyFilePath);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynasty-tracker-csv-"));

  const args = [
    "run",
    "--project",
    path.join(repoRoot, "tools", "DynastyTdbDump", "DynastyTdbDump.csproj"),
    "--",
    "--db",
    extracted.db1Path,
    "--tables",
    REQUIRED_TYPES.join(","),
    "--csv",
    "--outDir",
    outDir,
  ];

  if (Number.isFinite(Number(maxRows)) && Number(maxRows) > 0) {
    args.push("--maxRows", String(Math.trunc(Number(maxRows))));
  }

  const res = spawnSync("dotnet", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(res.stderr || `dotnet exit ${res.status}`);
  }

  const files = [];
  for (const t of REQUIRED_TYPES) {
    const filePath = path.join(outDir, `${t}.csv`);
    if (!fs.existsSync(filePath)) {
      // PSOL may not exist in older saves; keep dynasty export usable.
      if (t === "PSOL") continue;
      throw new Error(`Missing exported CSV: ${t}.csv`);
    }
    const text = fs.readFileSync(filePath, "utf8");
    files.push({ type: t, name: `${t}.csv`, text });
  }

  return {
    outDir,
    extracted,
    files,
  };
}
