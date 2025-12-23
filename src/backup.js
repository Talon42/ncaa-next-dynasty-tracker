import { db, getActiveDynastyId, setActiveDynastyId } from "./db";

const BACKUP_FORMAT = "dynasty-tracker-backup";
const BACKUP_VERSION = 1;
const ACTIVE_KEY = "activeDynastyId";
const DYNASTY_TABLES = [
  "teams",
  "teamSeasons",
  "games",
  "teamStats",
  "teamLogos",
  "logoOverrides",
  "bowlGames",
  "coaches",
  "coachQuotes",
];

function normalizeName(name) {
  return (name ?? "").trim();
}

export async function exportDatabase() {
  const tables = {};
  for (const table of db.tables) {
    tables[table.name] = await table.toArray();
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid backup file." };
  }
  if (payload.format !== BACKUP_FORMAT) {
    return { ok: false, error: "Unsupported backup format." };
  }
  if (payload.version !== BACKUP_VERSION) {
    return { ok: false, error: "Unsupported backup version." };
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    return { ok: false, error: "Backup file is missing tables." };
  }
  if (!Array.isArray(payload.tables.dynasties)) {
    return { ok: false, error: "Backup file has no dynasties." };
  }
  return { ok: true };
}

export async function getImportPreview(payload) {
  const imported = payload?.tables?.dynasties ?? [];
  const existing = await db.dynasties.toArray();
  const existingByName = new Map();
  const existingById = new Map();
  existing.forEach((d) => {
    existingById.set(d.id, d);
    const key = normalizeName(d.name);
    if (!existingByName.has(key)) existingByName.set(key, []);
    existingByName.get(key).push(d);
  });

  const overwriteNames = new Set();
  const addNames = new Set();
  const idConflicts = [];

  imported.forEach((d) => {
    const nameKey = normalizeName(d.name);
    if (!nameKey) return;
    if (existingByName.has(nameKey)) {
      overwriteNames.add(nameKey);
    } else {
      addNames.add(nameKey);
    }

    const existingMatch = existingById.get(d.id);
    if (existingMatch && normalizeName(existingMatch.name) !== nameKey) {
      idConflicts.push({
        existingName: existingMatch.name,
        incomingName: d.name,
      });
    }
  });

  const tableCounts = {};
  if (payload?.tables) {
    Object.entries(payload.tables).forEach(([name, rows]) => {
      tableCounts[name] = Array.isArray(rows) ? rows.length : 0;
    });
  }

  return {
    totalDynasties: imported.length,
    overwriteNames: Array.from(overwriteNames),
    addNames: Array.from(addNames),
    idConflicts,
    tableCounts,
  };
}

export async function importDatabase(payload) {
  const validation = validateBackupPayload(payload);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const importedDynasties = payload.tables.dynasties ?? [];
  const importedIds = new Set(importedDynasties.map((d) => d.id));
  const importedNameToId = new Map();
  importedDynasties.forEach((d) => {
    const key = normalizeName(d.name);
    if (!importedNameToId.has(key)) importedNameToId.set(key, d.id);
  });

  const existingDynasties = await db.dynasties.toArray();
  const existingById = new Map(existingDynasties.map((d) => [d.id, d]));
  const importedNameSet = new Set(
    importedDynasties.map((d) => normalizeName(d.name)).filter(Boolean)
  );

  const idConflicts = [];
  importedDynasties.forEach((d) => {
    const existingMatch = existingById.get(d.id);
    if (existingMatch && normalizeName(existingMatch.name) !== normalizeName(d.name)) {
      idConflicts.push({ existing: existingMatch.name, incoming: d.name });
    }
  });
  if (idConflicts.length) {
    throw new Error("Backup conflicts with existing dynasty IDs. Resolve duplicates first.");
  }

  const deleteIds = existingDynasties
    .filter((d) => importedNameSet.has(normalizeName(d.name)))
    .map((d) => d.id);

  const availableTables = new Set(db.tables.map((t) => t.name));
  const dynTables = DYNASTY_TABLES.filter((name) => availableTables.has(name));

  const currentActiveId = await getActiveDynastyId();
  const currentActiveName = currentActiveId ? existingById.get(currentActiveId)?.name : null;
  const desiredActiveId = currentActiveName && importedNameToId.has(normalizeName(currentActiveName))
    ? importedNameToId.get(normalizeName(currentActiveName))
    : currentActiveId;

  const settingsRows = payload.tables.settings ?? [];
  const importedActiveSetting = Array.isArray(settingsRows)
    ? settingsRows.find((row) => row?.key === ACTIVE_KEY)?.value ?? null
    : null;

  const shouldReplaceGlobals = existingDynasties.length === 0;

  const tablesForTx = [
    db.dynasties,
    db.settings,
    ...dynTables.map((name) => db[name]),
  ];
  if (shouldReplaceGlobals && availableTables.has("logoBaseByName")) {
    tablesForTx.push(db.logoBaseByName);
  }

  await db.transaction("rw", tablesForTx, async () => {
    if (deleteIds.length) {
      await db.dynasties.where("id").anyOf(deleteIds).delete();
      for (const tableName of dynTables) {
        await db[tableName].where("dynastyId").anyOf(deleteIds).delete();
      }
    }

    if (importedDynasties.length) {
      await db.dynasties.bulkPut(importedDynasties);
    }

    for (const tableName of dynTables) {
      const rows = Array.isArray(payload.tables[tableName]) ? payload.tables[tableName] : [];
      const filtered = rows.filter((row) => importedIds.has(row.dynastyId));
      if (filtered.length) {
        await db[tableName].bulkPut(filtered);
      }
    }

    if (shouldReplaceGlobals && availableTables.has("logoBaseByName")) {
      const rows = Array.isArray(payload.tables.logoBaseByName)
        ? payload.tables.logoBaseByName
        : [];
      await db.logoBaseByName.clear();
      if (rows.length) {
        await db.logoBaseByName.bulkPut(rows);
      }
    }

    if (desiredActiveId && importedIds.has(desiredActiveId)) {
      await setActiveDynastyId(desiredActiveId);
    } else if (!desiredActiveId && importedActiveSetting && importedIds.has(importedActiveSetting)) {
      await setActiveDynastyId(importedActiveSetting);
    }
  });

  return {
    importedDynasties: importedDynasties.length,
    overwrittenDynasties: deleteIds.length,
  };
}
