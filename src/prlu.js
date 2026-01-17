function toIntOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function buildPrluLurtByLuvl(prluRows) {
  const byLuvl = Array.from({ length: 60 }, () => null);
  for (const row of prluRows || []) {
    const luvl = toIntOrNull(row?.LUVL ?? row?.luvl);
    const lurt = toIntOrNull(row?.LURT ?? row?.lurt);
    if (luvl == null || lurt == null) continue;
    if (luvl < 0 || luvl >= byLuvl.length) continue;
    byLuvl[luvl] = lurt;
  }

  const missing = [];
  for (let i = 0; i < byLuvl.length; i++) {
    if (byLuvl[i] == null) missing.push(i);
  }
  if (missing.length) {
    throw new Error(`PRLU missing LUVL mappings: ${missing.join(", ")}`);
  }

  return byLuvl;
}

export function prluLurtFromLuvl(value, prluLurtByLuvl) {
  if (!prluLurtByLuvl) throw new Error("PRLU mapping not loaded (prluLurtByLuvl is required)");
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const idx = Math.trunc(n);
  if (idx < 0 || idx >= prluLurtByLuvl.length) return null;
  return prluLurtByLuvl[idx] ?? null;
}

