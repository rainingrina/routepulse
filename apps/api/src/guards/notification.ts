import { REASON_CODES, type ReasonCode } from '@routepulse/shared';

/** Hand-written guard for Notification.params of REPORT_NEEDS_REVIEW (architecture §8.4). Run on write. */
export interface ReportNeedsReviewParams {
  shipmentCode: string;
  reportId: string;
  reason: ReasonCode;
}

export function isReportNeedsReviewParams(v: unknown): v is ReportNeedsReviewParams {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    Object.keys(o).length === 3 &&
    typeof o['shipmentCode'] === 'string' &&
    typeof o['reportId'] === 'string' &&
    typeof o['reason'] === 'string' &&
    (REASON_CODES as readonly string[]).includes(o['reason'])
  );
}
