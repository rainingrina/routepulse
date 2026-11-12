import type { DriverReportDto, DriverTripShipment } from '@routepulse/shared';
import type { driverTripFacts, getReport } from '../services/reportService.js';

type ReportRow = Awaited<ReturnType<typeof getReport>>;

/** DriverReportDto (API §2.2): coordinator and the reporting driver only — never customers. */
export function toDriverReportDto(r: ReportRow): DriverReportDto {
  return {
    id: r.id,
    shipmentId: r.shipmentId,
    shipmentCode: r.shipment.code,
    reporter: { id: r.reporter.id, name: r.reporter.name },
    simTime: r.simTime.toISOString(),
    chipReason: r.chipReason,
    text: r.text,
    suggestedReason: r.suggestedReason,
    matchedKeywords: [...r.matchedKeywords],
    reason: r.reason,
    estimatedMinutes: r.estimatedMinutes,
    appliedMinutes: r.appliedMinutes,
    party: r.party,
    status: r.status,
    reviewedBy: r.reviewer ? { id: r.reviewer.id, name: r.reviewer.name } : null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    originalReason: r.originalReason,
    originalParty: r.originalParty,
  };
}

/** DriverTripShipment (API §9) for the driver's own shipment. `instruction` arrives with recovery (Milestone 7). */
export function toDriverTripShipment(f: Awaited<ReturnType<typeof driverTripFacts>>): DriverTripShipment {
  const c = f.row.order.customer;
  return {
    view: 'driver',
    id: f.row.id,
    code: f.row.code,
    customerName: c.name,
    city: c.city,
    destination: { lat: Number(c.lat), lng: Number(c.lng) },
    currentMilestone: f.milestone,
    nextMilestone: f.next.nextMilestone,
    canRecordNext: f.next.canRecordNext,
    nextBlockedReason: f.next.nextBlockedReason,
    etaAt: f.row.etaAt ? f.row.etaAt.toISOString() : null,
    promisedBy: f.row.promisedBy.toISOString(),
    stopped: f.stopped,
    instruction: null,
    openReports: f.row.reports.map((x) => ({ id: x.id, reason: x.reason, status: x.status, simTime: x.simTime.toISOString() })),
  };
}
