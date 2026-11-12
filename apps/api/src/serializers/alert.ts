import type { AlertDtoCoordinator, CustomerAlertDto, NotificationDto, ReasonCode } from '@routepulse/shared';
import { LEVEL_TEXT, REASON_PLAIN, REASON_SHORT } from '../engines/eta.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OPTION_SELECT, toOptionDto, type OptionRow } from './recovery.js';
import { alertSummary } from './shipment.js';
import { plainRecovery } from '../services/recoveryService.js';
import { hhmm } from '../engines/eta.js';

/** Alert and notification serializers (API §2.2, §10, §11). Customers get plain words only. */

export const ALERT_SELECT = {
  id: true,
  status: true,
  openedAt: true,
  resolvedAt: true,
  topFactor: true,
  topReason: true,
  chosenAt: true,
  customerResponse: true,
  customerRespondedAt: true,
  chosenByUserId: true,
  proposedOptionId: true,
  chosenOptionId: true,
  options: { select: OPTION_SELECT },
  shipment: {
    select: {
      id: true,
      code: true,
      riskLevel: true,
      etaAt: true,
      etaLowAt: true,
      etaHighAt: true,
      promisedBy: true,
      lane: { select: { name: true } },
      order: { select: { code: true, customer: { select: { name: true } } } },
    },
  },
} as const satisfies Prisma.AlertSelect;

export type AlertRow = Prisma.AlertGetPayload<{ select: typeof ALERT_SELECT }>;

const active = (status: AlertRow['status']) => status === 'OPEN' || status === 'ACTION_CHOSEN';

/** Coordinator alert. `summary` is built from stored facts: current level and the top factor at opening. */
export function toAlertCoordinator(a: AlertRow, chosenBy: { id: string; name: string } | null): AlertDtoCoordinator {
  const level = a.shipment.riskLevel;
  const top = a.topReason ? `top factor at opening: ${REASON_SHORT[a.topReason]}` : 'no single top factor';
  const summary = active(a.status) ? `${level ? LEVEL_TEXT[level] : 'Calculating'} · ${top}` : `Resolved · ${top}`;
  return {
    ...alertSummary(a),
    view: 'coordinator',
    shipment: { id: a.shipment.id, code: a.shipment.code, customerName: a.shipment.order.customer.name, laneName: a.shipment.lane.name },
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    summary,
    proposedOption: optionOf(a, a.proposedOptionId),
    chosenOption: optionOf(a, a.chosenOptionId),
    chosenBy,
    chosenAt: a.chosenAt ? a.chosenAt.toISOString() : null,
    customerResponse: a.customerResponse,
    customerRespondedAt: a.customerRespondedAt ? a.customerRespondedAt.toISOString() : null,
  };
}

function optionRow(a: AlertRow, id: string | null): OptionRow | null {
  return id ? (a.options.find((o) => o.id === id) ?? null) : null;
}
function optionOf(a: AlertRow, id: string | null) {
  const o = optionRow(a, id);
  return o ? toOptionDto(o) : null;
}

/**
 * Customer-facing action line (spec §5.5): the proposal at opening ("Proposed — Plant X team
 * confirming"), a NEW_WINDOW awaiting acceptance, or the confirmed action. Plain words only.
 * null → the UI says "Plant X team is reviewing options".
 */
function customerAction(a: AlertRow): CustomerAlertDto['action'] {
  const chosen = optionRow(a, a.chosenOptionId);
  if (chosen && chosen.status === 'AWAITING_CUSTOMER') {
    const p = chosen.params as Record<string, unknown>;
    const end = typeof p['newWindowEndS'] === 'number' ? hhmm(p['newWindowEndS']) : '';
    return { label: 'PROPOSED', kind: 'NEW_WINDOW', text: `New arrival window until ${end} — accept to confirm.` };
  }
  if (chosen && chosen.status === 'CHOSEN') {
    const eta = chosen.newEtaAt ? ` New estimate ${hhmm(Math.floor(chosen.newEtaAt.getTime() / 1000))}.` : '';
    return { label: 'CONFIRMED', kind: chosen.kind, text: `Plant X arranged ${plainRecovery(chosen.kind)}.${eta}` };
  }
  const proposed = optionRow(a, a.proposedOptionId);
  if (a.status === 'OPEN' && proposed) {
    const eta = proposed.newEtaAt ? `, new estimate ${hhmm(Math.floor(proposed.newEtaAt.getTime() / 1000))}` : '';
    return { label: 'PROPOSED', kind: proposed.kind, text: `Proposed — Plant X team confirming: ${plainRecovery(proposed.kind)}${eta}.` };
  }
  return null;
}

export function plainReasonOf(reason: ReasonCode | null): string {
  return reason ? REASON_PLAIN[reason] : 'Delay on the route';
}

/**
 * Customer alert: no parties, codes or driver identity. `action` is null until recovery exists
 * (Milestone 8) — the UI then shows "Plant X team is reviewing options" (architecture §11).
 * A response can be given while the alert is OPEN, or once while it is ACTION_CHOSEN (API §10.3).
 */
export function toAlertCustomer(a: AlertRow): CustomerAlertDto {
  const s = a.shipment;
  const predicted = (s.etaAt ?? s.promisedBy).toISOString();
  return {
    view: 'customer',
    id: a.id,
    status: a.status,
    openedAt: a.openedAt.toISOString(),
    shipmentId: s.id,
    shipmentCode: s.code,
    orderCode: s.order.code,
    predictedArrivalAt: predicted,
    etaLowAt: (s.etaLowAt ?? s.etaAt ?? s.promisedBy).toISOString(),
    etaHighAt: (s.etaHighAt ?? s.etaAt ?? s.promisedBy).toISOString(),
    promisedBy: s.promisedBy.toISOString(),
    plainReason: plainReasonOf(a.topReason),
    action: customerAction(a),
    customerResponse: a.customerResponse,
    customerRespondedAt: a.customerRespondedAt ? a.customerRespondedAt.toISOString() : null,
    canRespond:
      a.status === 'OPEN' ||
      (a.status === 'ACTION_CHOSEN' && (a.customerResponse === null || optionRow(a, a.chosenOptionId)?.status === 'AWAITING_CUSTOMER')),
  };
}

export const NOTIFICATION_SELECT = {
  id: true,
  kind: true,
  templateKey: true,
  params: true,
  text: true,
  simTime: true,
  readAt: true,
  shipmentId: true,
  alertId: true,
  shipment: { select: { code: true } },
} as const satisfies Prisma.NotificationSelect;

export type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

export function toNotificationDto(n: NotificationRow): NotificationDto {
  const params: Record<string, string | number> = {};
  if (n.params && typeof n.params === 'object' && !Array.isArray(n.params)) {
    for (const [k, v] of Object.entries(n.params as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') params[k] = v;
    }
  }
  return {
    id: n.id,
    kind: n.kind,
    templateKey: n.templateKey,
    params,
    text: n.text,
    simTime: n.simTime.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
    shipmentId: n.shipmentId,
    shipmentCode: n.shipment?.code ?? null,
    alertId: n.alertId,
  };
}
