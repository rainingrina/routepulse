import type { AuditItem, CustomerResponse, Milestone, ReasonCode, RecoveryKind } from '../../api/contract';
import { customerResponseLabel, milestoneLabel, reasonLabel, recoveryKindLabel } from '../../i18n/en';

/** L7 / UI plan §6.5: the activity feed shows domain actions only. */
const DOMAIN_PREFIXES = ['milestone.', 'report.', 'disruption.', 'alert.', 'recovery.', 'attribution.'];

export function isDomainAction(action: string): boolean {
  return DOMAIN_PREFIXES.some((p) => action.startsWith(p));
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * One-line summary for an audit row. `AuditItem.data` is untyped in API §14; the keys read here
 * (milestone, reason, label, response, kind) are UNCONFIRMED and listed in the handoff (§5). Unknown
 * shapes fall back to a generic sentence, never to invented details.
 */
export function activitySummary(item: AuditItem): string {
  const d = item.data;
  const milestone = str(d.milestone) as Milestone | null;
  const reason = str(d.reason) as ReasonCode | null;
  const kind = str(d.kind) as RecoveryKind | null;
  const response = str(d.response) as CustomerResponse | null;
  switch (item.action) {
    case 'milestone.record':
      return milestone && milestoneLabel[milestone] ? `Milestone recorded: ${milestoneLabel[milestone]}` : 'Milestone recorded';
    case 'milestone.override':
      return milestone && milestoneLabel[milestone] ? `Milestone overridden: ${milestoneLabel[milestone]}` : 'Milestone overridden';
    case 'report.create':
      return reason && reasonLabel[reason] ? `Driver reported: ${reasonLabel[reason]}` : 'Driver report received';
    case 'report.review':
      return 'Driver report reviewed';
    case 'disruption.create':
      return str(d.label) ? `Disruption started: ${str(d.label)}` : 'Disruption started';
    case 'disruption.end':
      return 'Disruption ended';
    case 'alert.open':
      return 'Alert opened';
    case 'alert.resolve':
      return 'Alert resolved';
    case 'alert.customerResponse':
      return response && customerResponseLabel[response] ? `Customer ${customerResponseLabel[response].toLowerCase()}` : 'Customer responded';
    case 'recovery.choose':
      return kind && recoveryKindLabel[kind] ? `Recovery chosen: ${recoveryKindLabel[kind]}` : 'Recovery option chosen';
    case 'recovery.apply':
      return 'Recovery applied';
    case 'attribution.override':
      return 'Delay attribution changed';
    default:
      return item.action;
  }
}

export function activityShipmentCode(item: AuditItem): string | null {
  return str(item.data.shipmentCode);
}
