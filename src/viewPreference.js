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

export async function readViewPreference({ page, dynastyId }) {
  if (!page || !dynastyId) return null;
  const row = await db.settings.get(viewKey(page, dynastyId));
  return normalizeView(row?.value);
}

export async function writeViewPreference({ page, dynastyId, view }) {
  if (!page || !dynastyId) return;
  const normalized = normalizeView(view);
  if (!normalized) return;
  await db.settings.put({ key: viewKey(page, dynastyId), value: normalized });
}
