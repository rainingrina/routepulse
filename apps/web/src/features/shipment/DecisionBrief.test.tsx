import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AlertDto, EtaExplanationCoordinator, EtaResponse, ListResponse, RecoveryOptionsResponse, ShipmentDetailCoordinator } from '../../api/contract';
import { ApiRequestError } from '../../api/client';
import { qk } from '../../api/queryClient';
import { renderWithData, text } from '../../test/render';
import { DecisionBrief } from './DecisionBrief';

// Real API responses captured from the running backend (realApi.test.tsx).
const fx = JSON.parse(readFileSync(new URL('../../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as {
  heroDetail: { shipment: ShipmentDetailCoordinator };
  heroEta: EtaResponse;
  alerts: ListResponse<AlertDto>;
  alertsAfterChoose: ListResponse<AlertDto>;
  optionsAfterChoose: RecoveryOptionsResponse;
  heroOptions: RecoveryOptionsResponse;
};
const s = fx.heroDetail.shipment;
const eta = fx.heroEta.eta as EtaExplanationCoordinator;
const forHero = (l: ListResponse<AlertDto>) => ({ items: l.items.filter((a) => a.view === 'coordinator' && a.shipment.id === s.id) });
const empty = { items: [] };

const keys = {
  active: qk.alerts({ shipmentId: s.id, status: 'active' }),
  resolved: qk.alerts({ shipmentId: s.id, status: 'RESOLVED' }),
  pending: qk.driverReports({ shipmentId: s.id, status: 'PENDING_REVIEW' }),
  confirmed: qk.driverReports({ shipmentId: s.id, status: 'CONFIRMED' }),
  options: qk.recoveryOptions(s.id),
  replay: qk.replay(s.id),
};

const render = (data: [readonly unknown[], unknown][], errors: [readonly unknown[], unknown][] = []) =>
  renderWithData(<DecisionBrief shipment={s} eta={eta} etaPending={false} attribution={null} simTime="2026-11-19T05:55:00.000Z" />, { data, errors });

describe('DecisionBrief (real API responses)', () => {
  it('after the decision: selected action, who and when, cost and the recorded before → after ETA', () => {
    const t = text(
      render([
        [keys.active, forHero(fx.alertsAfterChoose)],
        [keys.resolved, empty],
        [keys.pending, empty],
        [keys.confirmed, empty],
        [keys.options, fx.optionsAfterChoose],
        [
          keys.replay,
          {
            shipmentId: s.id,
            code: s.code,
            promisedBy: s.promisedBy,
            plannedArrivalAt: s.plannedArrivalAt,
            firstAtRiskAt: s.firstAtRiskAt,
            leadTimeMinutes: null,
            events: [],
            snapshots: [
              { id: 'a', simTime: '2026-11-19T05:40:00.000Z', trigger: 'REPORT', predictedArrivalAt: '2026-11-20T02:30:00.000Z', etaLowAt: '2026-11-20T01:10:00.000Z', etaHighAt: '2026-11-20T03:50:00.000Z', slackMinutes: -840, level: 'AT_RISK', score: 90, confidence: 'MEDIUM', position: { lat: 18.7, lng: 73.4 }, factors: [] },
              { id: 'b', simTime: '2026-11-19T05:55:00.000Z', trigger: 'RECOVERY', predictedArrivalAt: '2026-11-19T12:20:00.000Z', etaLowAt: '2026-11-19T11:40:00.000Z', etaHighAt: '2026-11-19T13:00:00.000Z', slackMinutes: 10, level: 'WATCH', score: 40, confidence: 'MEDIUM', position: { lat: 18.7, lng: 73.4 }, factors: [] },
            ],
          },
        ],
      ]),
    );
    expect(t).toContain('Replacement truck TRK-11 from Khopoli yard');
    expect(t).toContain('Selected');
    expect(t).toContain('Meera · Thu 11:25');
    expect(t).toContain('₹6,100');
    expect(t).toContain('Time saved vs notify only (estimate)');
    expect(t).toContain('Fri 08:00 before · recorded Thu 11:10');
    expect(t).toContain('Thu 17:50 after · Thu 11:25');
    expect(t).toContain('−14 h 10 m');
    expect(t).toContain('in-app notification created');
    expect(t).toContain('Delivery and read status are not tracked');
  });

  it('before any decision: proposal is not shown as selected; incident and recovery empty states', () => {
    const t = text(render([[keys.active, forHero(fx.alerts)], [keys.resolved, empty], [keys.pending, empty], [keys.confirmed, empty], [keys.options, fx.heroOptions]]));
    expect(t).toContain('Proposed · awaiting customer');
    expect(t).not.toContain('Selected');
    expect(t).toContain('No driver incident reported.');
    expect(t).not.toContain('Estimated arrival (recorded snapshots)');
    const none = text(render([[keys.active, empty], [keys.resolved, empty], [keys.pending, empty], [keys.confirmed, empty], [keys.options, { ...fx.heroOptions, options: [] }]]));
    expect(none).toContain('No recovery action selected yet.');
  });

  it('a failed request is reported in its own section, not hidden or replaced with guesses', () => {
    const err = new ApiRequestError({ kind: 'http', status: 500, code: 'INTERNAL', message: 'Server error.', requestId: 'req-1' });
    const t = text(render([[keys.active, empty], [keys.resolved, empty], [keys.options, fx.heroOptions], [keys.confirmed, empty]], [[keys.pending, err]]));
    expect(t).toContain('couldn’t load driver reports');
    expect(t).toContain('No recovery action selected yet.');
  });
});
