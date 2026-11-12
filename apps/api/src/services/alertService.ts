import type { CustomerResponse, NotificationKind, RiskLevel } from '@routepulse/shared';
import { REASON_PLAIN, REASON_SHORT, type EtaResult } from '../engines/eta.js';
import { DomainError, notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { shortTime } from '../serializers/shipment.js';
import { fromS, toS } from '../sim/world.js';
import { writeAudit } from './auditService.js';
import type { Actor } from './simulationService.js';

/**
 * Alert and notification engine (architecture §11, spec §5.5). Runs inside the recalculation
 * pipeline (same transaction), consuming only the authoritative risk results — no thresholds of
 * its own.
 *
 *   [*] → OPEN            level becomes AT_RISK (or LATE) and the shipment has no active alert
 *   OPEN → RESOLVED       level below AT_RISK, or the shipment arrived
 *   ACTION_CHOSEN → RESOLVED   only when the recovery completes = the shipment arrives (approved
 *                         2026-11-12: an alert with an active recovery action stays open even when
 *                         the risk improves; no cancel operation exists)
 *
 * One active alert per shipment (partial unique index, AC-M4.7): staying at risk across any number
 * of recalculations never opens a second alert; a new episode starts only after resolution.
 * Ids are deterministic, so identical runs produce identical rows.
 */

const AT_RISK: readonly RiskLevel[] = ['AT_RISK', 'LATE'];

interface ShipmentFacts {
  id: string;
  code: string;
  promisedBy: Date;
  arrivedAt: Date | null;
  firstAtRiskAt: Date | null;
  customerNotifiedAt: Date | null;
  order: { code: string; customerId: string };
}

async function notify(
  tx: Prisma.TransactionClient,
  n: { id: string; audience: 'COORDINATOR' | 'CUSTOMER'; customerId: string | null; shipmentId: string; alertId: string | null; kind: NotificationKind; params: Record<string, string | number>; text: string; atS: number },
): Promise<void> {
  await tx.notification.create({
    data: {
      id: n.id,
      audience: n.audience,
      customerId: n.audience === 'CUSTOMER' ? n.customerId : null,
      shipmentId: n.shipmentId,
      alertId: n.alertId,
      kind: n.kind,
      templateKey: `notif.${n.kind}`,
      params: n.params,
      text: n.text,
      simTime: fromS(n.atS),
    },
  });
}

async function event(tx: Prisma.TransactionClient, id: string, shipmentId: string, type: 'ALERT_OPENED' | 'ALERT_RESOLVED' | 'CUSTOMER_NOTIFIED', atS: number, data: Record<string, string>) {
  await tx.shipmentEvent.create({ data: { id, shipmentId, type, simTime: fromS(atS), source: 'SYSTEM', actorUserId: null, data } });
}

/** Opens and resolves alerts from the pipeline's fresh results. Returns true if anything changed. */
export async function evaluateAlerts(tx: Prisma.TransactionClient, simTimeS: number, results: ReadonlyMap<string, EtaResult>): Promise<boolean> {
  const ids = [...results.keys()].sort();
  if (ids.length === 0) return false;
  const [ships, actives] = await Promise.all([
    tx.shipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, promisedBy: true, arrivedAt: true, firstAtRiskAt: true, customerNotifiedAt: true, order: { select: { code: true, customerId: true } } },
    }),
    tx.alert.findMany({ where: { shipmentId: { in: ids }, status: { in: ['OPEN', 'ACTION_CHOSEN'] } }, select: { id: true, shipmentId: true, status: true } }),
  ]);
  const facts = new Map(ships.map((s) => [s.id, s]));
  const activeOf = new Map(actives.map((a) => [a.shipmentId, a]));
  let changed = false;
  for (const id of ids) {
    const r = results.get(id) as EtaResult;
    const s = facts.get(id);
    if (!s || s.arrivedAt) continue; // arrival is handled once, at finalisation (onArrived)
    const atRisk = AT_RISK.includes(r.level);
    const alert = activeOf.get(id);
    if (atRisk && !alert) {
      await openAlert(tx, simTimeS, s, r);
      changed = true;
    } else if (!atRisk && alert && alert.status === 'OPEN') {
      await resolveAlert(tx, simTimeS, s, alert.id, r.level);
      changed = true;
    }
  }
  return changed;
}

async function openAlert(tx: Prisma.TransactionClient, atS: number, s: ShipmentFacts, r: EtaResult): Promise<void> {
  const alertId = `alr_${s.id}_${atS}`;
  // Proposed action = the Suggested option of the shipment's current set (architecture §11), which the
  // pipeline generated just before this step; the set's options are attached to the new alert.
  const ship = await tx.shipment.findUniqueOrThrow({ where: { id: s.id }, select: { currentOptionSetId: true } });
  const suggested = ship.currentOptionSetId ? await tx.recoveryOption.findFirst({ where: { optionSetId: ship.currentOptionSetId, isSuggested: true }, select: { id: true } }) : null;
  await tx.alert.create({
    data: { id: alertId, shipmentId: s.id, status: 'OPEN', openedAt: fromS(atS), topFactor: r.topFactor?.code ?? null, topReason: r.topFactor?.reason ?? null, proposedOptionId: suggested?.id ?? null },
  });
  if (ship.currentOptionSetId) await tx.recoveryOption.updateMany({ where: { optionSetId: ship.currentOptionSetId, alertId: null }, data: { alertId } });
  await tx.shipment.update({
    where: { id: s.id },
    data: { ...(s.firstAtRiskAt ? {} : { firstAtRiskAt: fromS(atS) }), ...(s.customerNotifiedAt ? {} : { customerNotifiedAt: fromS(atS) }) },
  });
  const promise = shortTime(toS(s.promisedBy), atS);
  const eta = shortTime(r.predictedArrivalS, atS);
  const reason = r.topFactor?.reason ?? null;
  await notify(tx, {
    id: `ntf_${alertId}_AT_RISK`,
    audience: 'COORDINATOR',
    customerId: null,
    shipmentId: s.id,
    alertId,
    kind: 'AT_RISK',
    params: { shipmentCode: s.code, promisedBy: s.promisedBy.toISOString(), predictedArrivalAt: fromS(r.predictedArrivalS).toISOString(), ...(reason ? { topReason: reason } : {}) },
    text: `${s.code} is at risk of missing ${promise}: predicted ${eta}${reason ? `, largest factor ${REASON_SHORT[reason]}` : ''}.`,
    atS,
  });
  // Customer: plain words only — no codes, parties or driver identity (AC-M4.2, AC-M1.6).
  const plain = reason ? REASON_PLAIN[reason] : 'Delay on the route';
  await notify(tx, {
    id: `ntf_${alertId}_AT_RISK_CUSTOMER`,
    audience: 'CUSTOMER',
    customerId: s.order.customerId,
    shipmentId: s.id,
    alertId,
    kind: 'AT_RISK_CUSTOMER',
    params: { orderCode: s.order.code, shipmentCode: s.code, promisedBy: s.promisedBy.toISOString(), predictedArrivalAt: fromS(r.predictedArrivalS).toISOString(), plainReason: plain },
    text: `Order ${s.order.code} is at risk of missing ${promise}. New estimate ${eta}. Reason: ${plain}. Plant X team is reviewing options.`,
    atS,
  });
  await event(tx, `sev_${alertId}_OPENED`, s.id, 'ALERT_OPENED', atS, { alertId });
  await event(tx, `sev_${alertId}_CUSTOMER_NOTIFIED`, s.id, 'CUSTOMER_NOTIFIED', atS, { alertId });
  await writeAudit(tx, { actorUserId: null, actorRole: null, action: 'alert.open', entityType: 'Alert', entityId: alertId, data: { shipmentId: s.id, shipmentCode: s.code, level: r.level, ...(reason ? { reason } : {}) } });
}

async function resolveAlert(tx: Prisma.TransactionClient, atS: number, s: ShipmentFacts, alertId: string, level: RiskLevel | 'ARRIVED'): Promise<void> {
  await tx.alert.update({ where: { id: alertId }, data: { status: 'RESOLVED', resolvedAt: fromS(atS) } });
  await event(tx, `sev_${alertId}_RESOLVED`, s.id, 'ALERT_RESOLVED', atS, { alertId, reason: level === 'ARRIVED' ? 'ARRIVED' : 'LEVEL_DROPPED' });
  await writeAudit(tx, { actorUserId: null, actorRole: null, action: 'alert.resolve', entityType: 'Alert', entityId: alertId, data: { shipmentId: s.id, shipmentCode: s.code, cause: level === 'ARRIVED' ? 'arrived' : `level ${level}` } });
  if (level === 'ARRIVED') return;
  // "Shipment returns to On track" (spec §5.5): info to the coordinator, and to the customer, who
  // always received the at-risk alert when this alert opened.
  const now = level === 'ON_TRACK' ? 'on track' : 'on watch, no longer at risk';
  await notify(tx, { id: `ntf_${alertId}_BACK_ON_TRACK`, audience: 'COORDINATOR', customerId: null, shipmentId: s.id, alertId, kind: 'BACK_ON_TRACK', params: { shipmentCode: s.code, level }, text: `${s.code} is ${now}.`, atS });
  await notify(tx, {
    id: `ntf_${alertId}_BACK_ON_TRACK_CUSTOMER`,
    audience: 'CUSTOMER',
    customerId: s.order.customerId,
    shipmentId: s.id,
    alertId,
    kind: 'BACK_ON_TRACK',
    params: { orderCode: s.order.code },
    text: `Order ${s.order.code} is expected to arrive by the promised time again.`,
    atS,
  });
}

/**
 * At arrival (finalisation, L1): resolve the active alert at `arrivedAt` and, if the shipment
 * arrived after the promise, send ARRIVED_LATE with the final delay and the main attributed cause
 * (customer: plain words only).
 */
export async function onArrived(tx: Prisma.TransactionClient, shipmentId: string): Promise<void> {
  const s = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { id: true, code: true, promisedBy: true, arrivedAt: true, delayMinutes: true, firstAtRiskAt: true, customerNotifiedAt: true, order: { select: { code: true, customerId: true } } },
  });
  if (!s.arrivedAt) return;
  const atS = toS(s.arrivedAt);
  const alert = await tx.alert.findFirst({ where: { shipmentId, status: { in: ['OPEN', 'ACTION_CHOSEN'] } }, select: { id: true } });
  if (alert) await resolveAlert(tx, atS, s, alert.id, 'ARRIVED');
  // The recovery is complete at arrival: a proposal still awaiting the customer lapses (L4), and no
  // current option set remains.
  await tx.recoveryOption.updateMany({ where: { shipmentId, status: { in: ['AWAITING_CUSTOMER', 'PROPOSED'] } }, data: { status: 'SUPERSEDED' } });
  await tx.shipment.update({ where: { id: shipmentId }, data: { currentOptionSetId: null } });
  if (s.arrivedAt.getTime() <= s.promisedBy.getTime()) return;
  if ((await tx.notification.count({ where: { shipmentId, kind: 'ARRIVED_LATE' } })) > 0) return;
  const rows = await tx.delayAttribution.findMany({ where: { shipmentId, kind: 'TIME_LOST', factor: { not: 'WIN' }, reason: { not: null } }, select: { reason: true, delaySeconds: true }, orderBy: { id: 'asc' } });
  const byReason = new Map<string, number>();
  for (const r of rows) if (r.reason) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.delaySeconds);
  const topReason = [...byReason.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] as keyof typeof REASON_PLAIN | undefined;
  const delay = s.delayMinutes ?? 0;
  const alertId = alert?.id ?? null;
  await notify(tx, { id: `ntf_${shipmentId}_ARRIVED_LATE`, audience: 'COORDINATOR', customerId: null, shipmentId, alertId, kind: 'ARRIVED_LATE', params: { shipmentCode: s.code, delayMinutes: delay }, text: `${s.code} arrived ${delay} min after the promised time.`, atS });
  await notify(tx, {
    id: `ntf_${shipmentId}_ARRIVED_LATE_CUSTOMER`,
    audience: 'CUSTOMER',
    customerId: s.order.customerId,
    shipmentId,
    alertId,
    kind: 'ARRIVED_LATE',
    params: { orderCode: s.order.code, delayMinutes: delay, ...(topReason ? { plainReason: REASON_PLAIN[topReason] } : {}) },
    text: `Order ${s.order.code} arrived ${delay} min after the promised time.${topReason ? ` Main cause: ${REASON_PLAIN[topReason]}.` : ''}`,
    atS,
  });
}

/**
 * Customer response to an alert (API §10.3, AC-M4.6): allowed while OPEN (a later response replaces
 * the earlier one) or once while ACTION_CHOSEN. The NEW_WINDOW acceptance branch arrives with
 * recovery (Milestone 8). Coordinator notification, event and audit in the same transaction.
 */
export async function respondToAlert(tx: Prisma.TransactionClient, atS: number, input: { alertId: string; customerId: string; response: CustomerResponse; actor: Actor }): Promise<string> {
  const a = await tx.alert.findFirst({
    where: { id: input.alertId, shipment: { order: { customerId: input.customerId } } },
    select: { id: true, status: true, customerResponse: true, chosenOptionId: true, shipmentId: true, shipment: { select: { code: true } } },
  });
  if (!a) throw notFound();
  if (a.status === 'RESOLVED') throw new DomainError('INVALID_TRANSITION', 'This alert is already resolved.');
  const awaiting = a.chosenOptionId ? (await tx.recoveryOption.findUnique({ where: { id: a.chosenOptionId }, select: { status: true } }))?.status === 'AWAITING_CUSTOMER' : false;
  if (a.status === 'ACTION_CHOSEN' && a.customerResponse !== null && !awaiting) throw new DomainError('INVALID_TRANSITION', 'Your response was already recorded for this action.');
  await tx.alert.update({ where: { id: a.id }, data: { customerResponse: input.response, customerRespondedAt: fromS(atS), customerRespondedByUserId: input.actor.userId } });
  const n = await tx.notification.count({ where: { alertId: a.id, kind: 'CUSTOMER_RESPONDED' } });
  const text: Record<CustomerResponse, string> = { ACCEPT_PROPOSAL: 'accepted the proposal', PREFER_TO_WAIT: 'prefers to wait', REQUEST_CALL: 'requested a call' };
  await notify(tx, { id: `ntf_${a.id}_RESPONDED_${n + 1}`, audience: 'COORDINATOR', customerId: null, shipmentId: a.shipmentId, alertId: a.id, kind: 'CUSTOMER_RESPONDED', params: { shipmentCode: a.shipment.code, response: input.response }, text: `Customer ${text[input.response]} for ${a.shipment.code}.`, atS });
  await tx.shipmentEvent.create({ data: { id: `sev_${a.id}_RESPONDED_${n + 1}`, shipmentId: a.shipmentId, type: 'CUSTOMER_RESPONDED', simTime: fromS(atS), source: 'SYSTEM', actorUserId: input.actor.userId, data: { alertId: a.id, response: input.response } } });
  await writeAudit(tx, { actorUserId: input.actor.userId, actorRole: input.actor.role, action: 'alert.customerResponse', entityType: 'Alert', entityId: a.id, data: { shipmentId: a.shipmentId, shipmentCode: a.shipment.code, response: input.response } });
  return a.id;
}

