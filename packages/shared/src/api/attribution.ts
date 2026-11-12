import type { AttributionKind, AttributionStatus, FactorCode, Party, ReasonCode } from '../enums.js';
import type { Id, ISODateTime, Minutes } from './common.js';

/** API spec §12. Delay minutes by party for one shipment (F1). "Attributed to", never "fault". */

export interface AttributionRowDto {
  id: Id;
  sourceKey: string;
  factor: FactorCode | null;
  reason: ReasonCode | null;
  kind: AttributionKind;
  label: string;
  party: Party;
  /** From integer delaySeconds; largest-remainder rounding so the rows sum to the shipment total. */
  minutes: Minutes;
  status: AttributionStatus;
  originalParty: Party | null;
  overrideNote: string | null;
  overriddenBy: { id: Id; name: string } | null;
  overriddenAt: ISODateTime | null;
}

export interface AttributionResponse {
  shipmentId: Id;
  status: AttributionStatus;
  /** Minutes beyond the agreed promise; null until the shipment has arrived (L1). */
  delayMinutes: Minutes | null;
  totalsByParty: Record<Party, Minutes>;
  rows: AttributionRowDto[];
  /** But-for rule; null until the shipment has arrived (AC-F1.2). */
  countsAgainstTransporter: boolean | null;
  ruleText: string;
}

/** POST /api/shipments/:shipmentId/attribution/overrides (#35) */
export interface AttributionOverrideRequest {
  attributionId: Id;
  newParty: Party;
  /** 5–280 characters */
  note: string;
}
