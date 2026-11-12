import type { DashboardPeriod, DashboardResponse } from '@routepulse/shared';
import { DASHBOARD_DEFINITIONS, DATA_NOTE, aggregateDashboard, type ArrivedShipmentFact } from '../engines/analytics.js';
import { notFound } from '../errors/domainError.js';
import { fromS, toS, type Db } from '../sim/world.js';

/**
 * #36 dashboard (API §13, architecture §19 issues 52–55). Read-only: one query loads the filtered
 * set (shipments whose arrivedAt is in the window, plus their attribution rows and whether a
 * recovery was chosen); the pure engine computes every number. Nothing is written or cached.
 * The window ends at the last settled simulation time (the rows are consistent with it).
 */

const PERIOD_DAYS: Record<DashboardPeriod, number> = { '7d': 7, '30d': 30, '60d': 60 };

export async function getDashboard(
  db: Db,
  q: { period: DashboardPeriod; laneId: string | undefined; transporterId: string | undefined },
  settledS: number,
): Promise<DashboardResponse> {
  if (q.laneId && !(await db.lane.findUnique({ where: { id: q.laneId }, select: { id: true } }))) throw notFound();
  if (q.transporterId && !(await db.transporter.findUnique({ where: { id: q.transporterId }, select: { id: true } }))) throw notFound();
  const fromSec = settledS - PERIOD_DAYS[q.period] * 86400;
  const rows = await db.shipment.findMany({
    where: {
      arrivedAt: { gte: fromS(fromSec), lte: fromS(settledS) },
      ...(q.laneId ? { laneId: q.laneId } : {}),
      ...(q.transporterId ? { transporterId: q.transporterId } : {}),
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      arrivedAt: true,
      promisedBy: true,
      onTime: true,
      delayMinutes: true,
      firstAtRiskAt: true,
      customerNotifiedAt: true,
      renegotiated: true,
      lane: { select: { id: true, name: true } },
      transporter: { select: { id: true, name: true, fleetSize: true } },
      attributions: { select: { id: true, kind: true, reason: true, party: true, delaySeconds: true } },
      options: { where: { status: 'CHOSEN' }, select: { id: true }, take: 1 },
    },
  });
  const facts: ArrivedShipmentFact[] = rows.map((r) => ({
    id: r.id,
    laneId: r.lane.id,
    laneName: r.lane.name,
    transporterId: r.transporter.id,
    transporterName: r.transporter.name,
    fleetSize: r.transporter.fleetSize,
    arrivedS: toS(r.arrivedAt as Date),
    promisedS: toS(r.promisedBy),
    onTime: r.onTime === true,
    delayMinutes: r.delayMinutes ?? 0,
    firstAtRiskS: r.firstAtRiskAt ? toS(r.firstAtRiskAt) : null,
    customerNotifiedS: r.customerNotifiedAt ? toS(r.customerNotifiedAt) : null,
    renegotiated: r.renegotiated,
    recoveryChosen: r.options.length > 0,
    rows: r.attributions,
  }));
  return {
    filter: { period: q.period, from: fromS(fromSec).toISOString(), to: fromS(settledS).toISOString(), laneId: q.laneId ?? null, transporterId: q.transporterId ?? null },
    generatedAtSim: fromS(settledS).toISOString(),
    ...aggregateDashboard(facts, { fromS: fromSec, toS: settledS }),
    definitions: DASHBOARD_DEFINITIONS,
    dataNote: DATA_NOTE,
  };
}
