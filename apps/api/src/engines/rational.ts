/**
 * Exact non-negative rationals on BigInt (no floating point in the simulation, architecture §9.2).
 * Always stored reduced with den > 0.
 */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

export function rat(num: bigint | number, den: bigint | number = 1n): Rational {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) throw new RangeError('zero denominator');
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  return { num: (sign * n) / g, den: (sign * d) / g };
}

export const add = (a: Rational, b: Rational): Rational => rat(a.num * b.den + b.num * a.den, a.den * b.den);
export const mul = (a: Rational, b: Rational): Rational => rat(a.num * b.num, a.den * b.den);
export const div = (a: Rational, b: Rational): Rational => rat(a.num * b.den, a.den * b.num);
export const cmp = (a: Rational, b: Rational): number => {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
};

/** floor(r × k) for a non-negative integer k. */
export function floorTimes(r: Rational, k: bigint): bigint {
  return (r.num * k) / r.den;
}

/** ceil(x / r) for non-negative integer x and r > 0. */
export function ceilDiv(x: bigint, r: Rational): bigint {
  const n = x * r.den;
  return (n + r.num - 1n) / r.num;
}

export const toNumber = (r: Rational): number => Number(r.num) / Number(r.den);

/** Median of rationals; for an even count, the mean of the two middle values (still exact). */
export function median(values: readonly Rational[]): Rational {
  if (values.length === 0) throw new RangeError('median of empty list');
  const sorted = [...values].sort(cmp);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] as Rational;
  if (sorted.length % 2 === 1) return hi;
  return mul(add(sorted[mid - 1] as Rational, hi), rat(1, 2));
}
