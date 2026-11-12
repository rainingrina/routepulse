/**
 * Largest-remainder rounding (08_ETA_AND_RISK_ENGINE.md §3.3).
 *
 * Splits `total` (an integer) into integer parts proportional to `weights`, so the parts always
 * sum exactly to `total`. Each part gets floor(share); the leftover units go to the largest
 * remainders. Ties go to the lower index, which keeps the result deterministic.
 * If every weight is 0, the result is all zeros and `total` must be 0.
 */
export function largestRemainder(weights: readonly number[], total: number): number[] {
  if (!Number.isInteger(total) || total < 0) throw new RangeError('total must be a non-negative integer');
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError('weights must be finite and ≥ 0');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    if (total !== 0) throw new RangeError('cannot distribute a non-zero total over zero weights');
    return weights.map(() => 0);
  }
  const exact = weights.map((w) => (w / sum) * total);
  const parts = exact.map((x) => Math.floor(x));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}

/** Rounds exact values to integers whose sum equals round(Σ values) — used for factor bars. */
export function roundPreservingSum(values: readonly number[]): number[] {
  const total = Math.round(values.reduce((a, b) => a + b, 0));
  return largestRemainder(values, total);
}
