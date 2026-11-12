import { describe, expect, it } from 'vitest';
import { BACKGROUND, HERO_STAGES, type MockShipment } from './shipments';

const MIN = 60_000;
const withEta = [...HERO_STAGES, ...BACKGROUND].filter((s): s is MockShipment & { eta: NonNullable<MockShipment['eta']> } => s.eta !== null);

/** The mock must not contradict the locked definitions it imitates (L3 identity, spec §5.4 rules). */
describe('mock fixtures are internally consistent', () => {
  it.each(withEta.map((s, i) => [`${s.code}#${i}`, s] as const))('%s: planned + I + P + E = predicted (L3)', (_n, s) => {
    const total = s.eta.factors.reduce((a, f) => a + f.minutes, 0);
    expect(Date.parse(s.plannedArrivalAt) + total * MIN).toBe(Date.parse(s.eta.predictedArrivalAt));
  });

  it.each(withEta.map((s, i) => [`${s.code}#${i}`, s] as const))('%s: slack = promise − predicted, level and score follow 08 §2', (_n, s) => {
    const slack = (Date.parse(s.promisedBy) - Date.parse(s.eta.predictedArrivalAt)) / MIN;
    expect(s.eta.slackMinutes).toBe(slack);
    const level = slack >= 120 ? 'ON_TRACK' : slack >= 0 ? 'WATCH' : 'AT_RISK';
    expect(s.eta.level).toBe(level);
    expect(s.eta.score).toBe(Math.min(100, Math.max(0, Math.round(50 - slack / 6))));
  });

  it.each(withEta.map((s, i) => [`${s.code}#${i}`, s] as const))('%s: WIN split sums to the WIN minutes', (_n, s) => {
    for (const f of s.eta.factors.filter((x) => x.code === 'WIN')) {
      expect(f.party).toBeNull();
      expect(f.split?.reduce((a, p) => a + p.minutes, 0)).toBe(f.minutes);
    }
  });

  it('hero checkpoints match the engine doc (Examples 2–3)', () => {
    const [s0, s1, s2, s3] = HERO_STAGES.map((s) => s.eta!);
    expect([s0!.slackMinutes, s1!.slackMinutes, s2!.slackMinutes, s3!.slackMinutes]).toEqual([220, 100, -840, 10]);
    expect([s0!.level, s1!.level, s2!.level, s3!.level]).toEqual(['ON_TRACK', 'WATCH', 'AT_RISK', 'WATCH']);
  });

  it('arrival-based facts (L1): the arrived shipment is on time by arrival, delivery still pending', () => {
    const arrived = BACKGROUND.find((s) => s.arrivedAt)!;
    expect(Date.parse(arrived.arrivedAt!) <= Date.parse(arrived.promisedBy)).toBe(arrived.onTime);
    expect(arrived.deliveredAt).toBeNull();
  });
});
