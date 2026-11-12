import { describe, expect, it } from 'vitest';
import type { AuditItem, RecoveryOptionDto, ShipmentListItemCoordinator } from '../../api/contract';
import { orderOptions, decisionMade } from '../recovery/order';
import { activitySummary, isDomainAction } from './activityFormat';
import { countByLevel, filterShipments, newlyAtRisk, parseLevelFilter } from './listFilters';
import { sliceLine } from '../../map/geometry';

const row = (id: string, code: string, riskLevel: ShipmentListItemCoordinator['riskLevel']) =>
  ({ id, code, riskLevel }) as ShipmentListItemCoordinator;

const list = [row('a', 'SHP-1042', 'AT_RISK'), row('b', 'SHP-1044', 'WATCH'), row('c', 'SHP-1038', 'ON_TRACK'), row('d', 'SHP-1031', null)];

describe('shipment list filters (UI plan §6.3)', () => {
  it('filters by level chip and keeps the API order', () => {
    expect(filterShipments(list, 'ALL', '').map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterShipments(list, 'WATCH', '').map((s) => s.id)).toEqual(['b']);
  });
  it('searches codes case-insensitively, combined with the chip', () => {
    expect(filterShipments(list, 'ALL', 'shp-104').map((s) => s.id)).toEqual(['a', 'b']);
    expect(filterShipments(list, 'AT_RISK', '1044')).toEqual([]);
  });
  it('counts by level and ignores shipments without a level (arrived)', () => {
    expect(countByLevel(list)).toEqual({ ON_TRACK: 1, WATCH: 1, AT_RISK: 1, LATE: 0 });
  });
  it('parses unknown URL filter values as All', () => {
    expect(parseLevelFilter('AT_RISK')).toBe('AT_RISK');
    expect(parseLevelFilter('nonsense')).toBe('ALL');
    expect(parseLevelFilter(null)).toBe('ALL');
  });
  it('detects shipments that just turned AT_RISK, not ones already at risk or new to the list', () => {
    const prev = new Map([
      ['a', 'WATCH' as const],
      ['b', 'AT_RISK' as const],
    ]);
    const next = [row('a', 'SHP-1042', 'AT_RISK'), row('b', 'SHP-1044', 'AT_RISK'), row('z', 'SHP-2000', 'AT_RISK')];
    expect(newlyAtRisk(prev, next).map((s) => s.id)).toEqual(['a']);
    expect(newlyAtRisk(null, next)).toEqual([]);
  });
});

const audit = (action: string, data: Record<string, unknown> = {}): AuditItem => ({
  id: action,
  actor: null,
  action,
  entityType: 'Shipment',
  entityId: 'x',
  simTime: null,
  createdAt: '2026-11-12T05:00:00.000Z',
  data,
});

describe('activity feed (L7: audit, domain actions only)', () => {
  it('hides auth and simulation-clock actions', () => {
    expect(isDomainAction('auth.login')).toBe(false);
    expect(isDomainAction('sim.clock')).toBe(false);
    expect(isDomainAction('recovery.choose')).toBe(true);
    expect(isDomainAction('report.create')).toBe(true);
  });
  it('summarises known actions and falls back without inventing details', () => {
    expect(activitySummary(audit('report.create', { reason: 'BREAKDOWN' }))).toBe('Driver reported: Breakdown');
    expect(activitySummary(audit('report.create'))).toBe('Driver report received');
    expect(activitySummary(audit('recovery.choose', { kind: 'REPLACEMENT_TRUCK' }))).toBe('Recovery chosen: Replacement truck');
    expect(activitySummary(audit('milestone.record', { milestone: 'NOT_A_MILESTONE' }))).toBe('Milestone recorded');
  });
});

const opt = (id: string, o: Partial<RecoveryOptionDto>) => ({ id, kind: 'REROUTE', feasible: true, isSuggested: false, meetsPromise: false, extraCostInr: 0, status: 'PROPOSED', ...o }) as RecoveryOptionDto;

describe('recovery card order (UI plan §9.1)', () => {
  it('Suggested → other feasible (meets promise, then cost) → NEW_WINDOW → NOTIFY_ONLY → infeasible', () => {
    const ordered = orderOptions([
      opt('notify', { kind: 'NOTIFY_ONLY' }),
      opt('reroute-x', { kind: 'REROUTE', feasible: false }),
      opt('window', { kind: 'NEW_WINDOW', meetsPromise: true }),
      opt('split', { kind: 'SPLIT', extraCostInr: 11800 }),
      opt('cheap-miss', { kind: 'REROUTE', extraCostInr: 100 }),
      opt('meets', { kind: 'SPLIT', meetsPromise: true, extraCostInr: 9000 }),
      opt('rt', { kind: 'REPLACEMENT_TRUCK', isSuggested: true, meetsPromise: true, extraCostInr: 6100 }),
    ]).map((o) => o.id);
    expect(ordered).toEqual(['rt', 'meets', 'cheap-miss', 'split', 'window', 'notify', 'reroute-x']);
  });
  it('detects a decision already made (chosen or awaiting the customer)', () => {
    expect(decisionMade([opt('a', {}), opt('b', { status: 'CHOSEN' })])?.id).toBe('b');
    expect(decisionMade([opt('a', { status: 'AWAITING_CUSTOMER' })])?.id).toBe('a');
    expect(decisionMade([opt('a', {})])).toBeNull();
  });
});

describe('sliceLine (map segment highlight)', () => {
  it('returns the sub-line between two fractions of the length', () => {
    const line: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    expect(sliceLine(line, 0.2, 0.5)).toEqual([
      [2, 0],
      [5, 0],
    ]);
  });
  it('keeps interior vertices inside the slice', () => {
    const line: [number, number][] = [
      [0, 0],
      [5, 0],
      [10, 0],
    ];
    expect(sliceLine(line, 0.1, 0.9)).toEqual([
      [1, 0],
      [5, 0],
      [9, 0],
    ]);
  });
});
