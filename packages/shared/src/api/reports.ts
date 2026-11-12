import type { DriverReasonCode, Milestone, Party, ReasonCode, ReportStatus } from '../enums.js';
import type { EtaExplanationCoordinator } from './eta.js';
import type { Id, ISODateTime, Minutes } from './common.js';

/** API spec §2.2, §9. Driver problem reports and their two-step confirmation (F2, F3). */

export interface DriverReportDto {
  id: Id;
  shipmentId: Id;
  shipmentCode: string;
  reporter: { id: Id; name: string };
  simTime: ISODateTime;
  chipReason: ReasonCode | null;
  text: string | null;
  suggestedReason: ReasonCode | null;
  matchedKeywords: string[];
  reason: ReasonCode;
  estimatedMinutes: Minutes | null;
  appliedMinutes: Minutes;
  party: Party;
  status: ReportStatus;
  reviewedBy: { id: Id; name: string } | null;
  reviewedAt: ISODateTime | null;
  reviewNote: string | null;
  originalReason: ReasonCode | null;
  originalParty: Party | null;
}

/** Driver's view of one assigned live shipment (API §9). */
export interface DriverTripShipment {
  view: 'driver';
  id: Id;
  code: string;
  customerName: string;
  city: string;
  destination: { lat: number; lng: number };
  currentMilestone: Milestone;
  nextMilestone: Milestone | null;
  canRecordNext: boolean;
  /** e.g. "38 km to destination" */
  nextBlockedReason: string | null;
  etaAt: ISODateTime | null;
  promisedBy: ISODateTime;
  stopped: boolean;
  /** Derived, not stored (recovery hand-over instructions arrive with Milestone 7). */
  instruction: string | null;
  openReports: { id: Id; reason: ReasonCode; status: ReportStatus; simTime: ISODateTime }[];
}

/** A shipment this driver handed over in a REPLACEMENT_TRUCK recovery (D3). */
export interface DriverHandover {
  shipmentId: Id;
  shipmentCode: string;
  toTruckCode: string;
  toDriverName: string;
  at: ISODateTime;
}

/** POST /api/driver-reports/classify (#22) */
export interface ClassifyRequest {
  text: string;
}
export interface ClassifyResponse {
  suggestedReason: ReasonCode | null;
  matchedKeywords: string[];
  /** STRONG ≥ 2 keywords for one reason; WEAK = 1; NONE = 0 */
  strength: 'STRONG' | 'WEAK' | 'NONE';
  defaultMinutes: Minutes | null;
  defaultParty: Party | null;
  method: 'KEYWORD_LIST_V1';
}

export const REPORT_ESTIMATE_MINUTES = [30, 60, 120, 240] as const;

/** POST /api/shipments/:shipmentId/driver-reports (#23) */
export interface CreateDriverReportRequest {
  chipReason?: DriverReasonCode;
  /** ≤ 280 characters */
  text?: string;
  /** The reason the driver confirmed (a driver-chip reason). */
  reason: DriverReasonCode;
  estimatedMinutes?: (typeof REPORT_ESTIMATE_MINUTES)[number];
}
export interface CreateDriverReportResponse {
  report: DriverReportDto;
  /** null for coordinator callers */
  trip: DriverTripShipment | null;
}

/** GET /api/driver-reports (#24) */
export interface DriverReportListResponse {
  items: DriverReportDto[];
}

/** POST /api/driver-reports/:reportId/review (#25) */
export interface ReviewDriverReportRequest {
  reason: ReasonCode;
  party: Party;
  /** 5–280 characters; required when reason or party differs from the report. */
  note?: string;
}
export interface ReviewDriverReportResponse {
  report: DriverReportDto;
  eta: EtaExplanationCoordinator;
}
