import { add, cmp, div, median, rat, type Rational } from './rational.js';

/**
 * Transporter pace from delivered history (engine doc §5.1; decision O-13).
 *
 *   r = median over delivered shipments of (TRANSPORTER-attributed TIME_LOST seconds ÷ baseline seconds)
 *   p = 1 / (1 + r), clamped to [0.80, 1.00]
 *
 * Uses (transporter, lane) history with ≥ 5 shipments, else the transporter's history on all lanes,
 * else p = 1. Everything is an exact rational, so the simulation stays deterministic.
 * Example: Ghatline on the Pune lane → r = 20/270 = 0.0741, p = 270/290 ≈ 0.931.
 */
export interface PaceSample {
  transporterId: string;
  laneId: string;
  transporterSeconds: number;
  baselineSeconds: number;
}

export const MIN_HISTORY = 5;
const P_MIN = rat(80, 100);
const P_MAX = rat(1);

export function paceFromRate(r: Rational): Rational {
  const p = div(rat(1), add(rat(1), r));
  if (cmp(p, P_MIN) < 0) return P_MIN;
  if (cmp(p, P_MAX) > 0) return P_MAX;
  return p;
}

export function derivePaces(samples: readonly PaceSample[]): (transporterId: string, laneId: string) => Rational {
  const ratio = (s: PaceSample) => rat(s.transporterSeconds, s.baselineSeconds);
  const byPair = new Map<string, Rational[]>();
  const byTransporter = new Map<string, Rational[]>();
  for (const s of samples) {
    if (s.baselineSeconds <= 0) continue;
    const key = `${s.transporterId}|${s.laneId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), ratio(s)]);
    byTransporter.set(s.transporterId, [...(byTransporter.get(s.transporterId) ?? []), ratio(s)]);
  }
  return (transporterId, laneId) => {
    const pair = byPair.get(`${transporterId}|${laneId}`) ?? [];
    if (pair.length >= MIN_HISTORY) return paceFromRate(median(pair));
    const all = byTransporter.get(transporterId) ?? [];
    if (all.length >= MIN_HISTORY) return paceFromRate(median(all));
    return rat(1);
  };
}
