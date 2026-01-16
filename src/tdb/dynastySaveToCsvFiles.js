import { decodeNameFromPlayRow, tableDumpToCsv } from "../tdbCsvBridge.js";
import { decodeDynastySaveToTables } from "./decodeWithLayout.js";

const REQUIRED_TABLES = [
  "TEAM",
  "SCHD",
  "TSSE",
  "BOWL",
  "COCH",
  "PLAY",
  "PSOF",
  "PSDE",
  "PSKI",
  "PSKP",
  "PSOL",
  "AAPL",
  "OSPA",
];

function stripInternalKeys(row) {
  if (row && typeof row === "object") {
    // Avoid per-row object copies; these rows are ephemeral and only used to emit CSV.
    delete row.__recNo;
  }
  return row;
}

export function dynastySaveBytesToCsvFiles({ saveBytes, layout, tables = REQUIRED_TABLES } = {}) {
  if (!(saveBytes instanceof Uint8Array)) throw new Error("saveBytes must be Uint8Array");
  if (!layout?.tables) throw new Error("layout is required");

  const decoded = decodeDynastySaveToTables({ saveBytes, layout, tables });

  const files = [];

  for (const tableName of tables) {
    const tableLayout = layout.tables[tableName];
    if (!tableLayout) throw new Error(`Missing layout for ${tableName}`);

    const fields = Object.keys(tableLayout.fields).map((Name) => ({ Name }));
    const rows = (decoded[tableName]?.rows || []).map(stripInternalKeys);

    const extraColumns = [];

    if (tableName === "PLAY") {
      extraColumns.push("FirstName", "LastName");
      for (const r of rows) {
        const decodedName = decodeNameFromPlayRow(r);
        r.FirstName = decodedName.FirstName;
        r.LastName = decodedName.LastName;
      }
    }

    const text = tableDumpToCsv({ fields, rows, extraColumns });
    files.push({ name: `${tableName}.csv`, text, type: "text/csv" });
  }

  return { files };
}
