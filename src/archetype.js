const PTEN_BY_PPOS = [
  ["Pocket Passer", "Balanced", "Scrambler"], // 0 QB
  ["Power", "Balanced", "Speed"], // 1 HB
  ["Blocking", "Balanced", "Receiving"], // 2 FB
  ["Speed", "Balanced", "Possession"], // 3 WR
  ["Blocking", "Balanced", "Receiving"], // 4 TE
  ["Run Blocker", "Balanced", "Pass Blocker"], // 5 LT
  ["Run Blocker", "Balanced", "Pass Blocker"], // 6 LG
  ["Run Blocker", "Balanced", "Pass Blocker"], // 7 C
  ["Run Blocker", "Balanced", "Pass Blocker"], // 8 RG
  ["Run Blocker", "Balanced", "Pass Blocker"], // 9 RT
  ["Pass Rusher", "Balanced", "Run Stopper"], // 10 LE
  ["Pass Rusher", "Balanced", "Run Stopper"], // 11 RE
  ["Pass Rusher", "Balanced", "Run Stopper"], // 12 DT
  ["Run Stopper", "Balanced", "Coverage"], // 13 LOLB
  ["Run Stopper", "Balanced", "Coverage"], // 14 MLB
  ["Run Stopper", "Balanced", "Coverage"], // 15 ROLB
  ["Hard Hitter", "Balanced", "Coverage"], // 16 CB
  ["Hard Hitter", "Balanced", "Coverage"], // 17 FS
  ["Hard Hitter", "Balanced", "Coverage"], // 18 SS
];

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * DB-Editor mapping (Conversions.GetPTENType + PTEN.csv):
 * - Uses PLAY.PTEN as a numeric bucket selector.
 * - Category:
 *   - PTEN < 10  => TEN1
 *   - PTEN < 20  => TEN2
 *   - else       => TEN3
 */
export function archetypeLabelFromPposAndPten(ppos, pten) {
  const pos = toInt(ppos);
  const ten = toInt(pten);
  if (pos == null || ten == null) return null;

  const labels = PTEN_BY_PPOS[pos] || null;
  if (!labels) return null;

  const idx = ten < 10 ? 0 : ten < 20 ? 1 : 2;
  return labels[idx] || null;
}

