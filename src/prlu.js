const PRLU_LURT_BY_LUVL = Array.from({ length: 60 }, (_, i) => i + 40);

export function prluLurtFromLuvl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const idx = Math.trunc(n);
  if (idx < 0 || idx >= PRLU_LURT_BY_LUVL.length) return null;
  return PRLU_LURT_BY_LUVL[idx] ?? null;
}

