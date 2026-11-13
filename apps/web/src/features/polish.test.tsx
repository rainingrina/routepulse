import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EtaExplanationCoordinator, EtaResponse } from '../api/contract';
import { groupTrucks, worstLevel } from '../map/truckClusters';
import { EtaWaterfall, signedMinutes, waterfallBars } from './shipment/EtaWaterfall';
import { atRiskToastContent } from './control-tower/useAtRiskNotifications';

const fx = JSON.parse(readFileSync(new URL('../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as { heroEta: EtaResponse };
const heroEta = fx.heroEta.eta as EtaExplanationCoordinator;

describe('truck clusters (screen-space, positions untouched)', () => {
  const t = (id: string, x: number, y: number, level: 'AT_RISK' | 'WATCH' | 'ON_TRACK' | null = 'WATCH') => ({ id, x, y, level });

  it('groups overlapping markers under the most urgent member', () => {
    const groups = groupTrucks([t('a', 0, 0), t('b', 10, 10, 'AT_RISK'), t('c', 200, 200)], 30, new Set());
    expect(groups).toEqual([
      { anchorId: 'b', memberIds: ['b', 'a'] },
      { anchorId: 'c', memberIds: ['c'] },
    ]);
  });

  it('never absorbs a pinned (selected / hovered) truck', () => {
    const groups = groupTrucks([t('a', 0, 0), t('b', 5, 5), t('c', 8, 8)], 30, new Set(['b']));
    expect(groups.find((g) => g.anchorId === 'b')!.memberIds).toEqual(['b']);
    expect(groups.find((g) => g.memberIds.includes('a'))!.memberIds).toEqual(['a', 'c']);
  });

  it('is deterministic for equal urgency (ties by id) and reports the worst level', () => {
    const groups = groupTrucks([t('z', 0, 0), t('m', 1, 1)], 30, new Set());
    expect(groups[0]).toEqual({ anchorId: 'm', memberIds: ['m', 'z'] });
    expect(worstLevel(['WATCH', 'AT_RISK', null])).toBe('AT_RISK');
    expect(worstLevel([null, null])).toBeNull();
  });
});

describe('ETA waterfall (real #18 response)', () => {
  it('bars are cumulative in API order and end exactly at the predicted arrival', () => {
    const bars = waterfallBars(heroEta.factors);
    expect(bars.map((b) => b.phase)).toEqual(heroEta.factors.map((f) => f.phase));
    const last = bars[bars.length - 1]!;
    const endMin = last.start + last.minutes;
    expect(Date.parse(heroEta.plannedArrivalAt) + endMin * 60_000).toBe(Date.parse(heroEta.predictedArrivalAt));
    expect(endMin).toBe(heroEta.totals.incurredMinutes + heroEta.totals.planChangeMinutes + heroEta.totals.expectedMinutes);
    expect(bars.filter((b) => b.pending).length).toBe(heroEta.factors.filter((f) => f.reviewStatus === 'PENDING_REVIEW').length);
  });

  it('formats signed contributions without inventing a sign', () => {
    expect(signedMinutes(120)).toBe('+120 min');
    expect(signedMinutes(-30)).toBe('−30 min');
    expect(signedMinutes(0)).toBe('0 min');
  });

  it('renders every factor, the reference marks and the identity line from the API values', () => {
    const html = renderToStaticMarkup(<EtaWaterfall eta={heroEta} />);
    for (const f of heroEta.factors) expect(html).toContain(f.label);
    expect(html).toContain('Promised by');
    expect(html).toContain('Road arrival');
    expect(html).toContain('Pending coordinator review');
    expect(html).toContain('Rule-based estimate');
    expect(html).toContain('aria-labelledby="eta-waterfall-caption"');
  });

  it('draws a negative contribution as time saved', () => {
    const eta: EtaExplanationCoordinator = {
      ...heroEta,
      factors: [{ ...heroEta.factors[0]!, phase: 'PLAN_CHANGE', minutes: -30, label: 'Shorter route' }],
    };
    const html = renderToStaticMarkup(<EtaWaterfall eta={eta} />);
    expect(html).toContain('−30 min');
    expect(html).toContain('Saves time');
  });
});

describe('at-risk toast content', () => {
  it('one shipment → its code and a direct action target', () => {
    expect(atRiskToastContent([{ id: 'shp_1', code: 'SHP-1042' }])).toEqual({
      title: 'SHP-1042 is at risk',
      description: 'Rule-based estimate now misses the promised time.',
      singleId: 'shp_1',
    });
  });
  it('several shipments → one batched toast', () => {
    const c = atRiskToastContent([
      { id: 'a', code: 'SHP-1' },
      { id: 'b', code: 'SHP-2' },
    ]);
    expect(c.title).toBe('2 shipments are at risk');
    expect(c.description).toBe('SHP-1, SHP-2');
    expect(c.singleId).toBeNull();
  });
});
