import { db } from "./db";

const VIEW_VALUES = new Set(["cards", "table"]);

export function normalizeView(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return VIEW_VALUES.has(v) ? v : null;
}

export function readViewFromSearch(search) {
  const params = new URLSearchParams(search || "");
  return normalizeView(params.get("view"));
}

function viewKey(page, dynastyId) {
  return `view:${page}:${dynastyId}`;
}

function globalViewKey(dynastyId) {
  return `view:global:${dynastyId}`;
}

export function readCachedViewPreference({ dynastyId }) {
  if (!dynastyId) return null;
  try {
    const value = sessionStorage.getItem(globalViewKey(dynastyId));
    return normalizeView(value);
  } catch {
    return null;
  }
}

function writeCachedViewPreference({ dynastyId, view }) {
  if (!dynastyId) return;
  const normalized = normalizeView(view);
  if (!normalized) return;
  try {
    sessionStorage.setItem(globalViewKey(dynastyId), normalized);
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.)
  }
}

export async function readViewPreference({ page, dynastyId }) {
  if (!page || !dynastyId) return null;
  const cached = readCachedViewPreference({ dynastyId });
  if (cached) return cached;
  const globalRow = await db.settings.get(globalViewKey(dynastyId));
  const globalValue = normalizeView(globalRow?.value);
  if (globalValue) return globalValue;

  const row = await db.settings.get(viewKey(page, dynastyId));
  const legacyValue = normalizeView(row?.value);
  if (legacyValue) {
    await db.settings.put({ key: globalViewKey(dynastyId), value: legacyValue });
    writeCachedViewPreference({ dynastyId, view: legacyValue });
  }
  return legacyValue;
}

export async function writeViewPreference({ page, dynastyId, view }) {
  if (!page || !dynastyId) return;
  const normalized = normalizeView(view);
  if (!normalized) return;
  await db.settings.put({ key: globalViewKey(dynastyId), value: normalized });
  writeCachedViewPreference({ dynastyId, view: normalized });
}
