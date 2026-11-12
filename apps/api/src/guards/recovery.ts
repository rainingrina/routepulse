import type { RecoveryKind } from '@routepulse/shared';

/**
 * Typed RecoveryOption.params per kind (schema §5.16) and their hand-written guard (architecture
 * §8.4), run on write and before use. Absolute times are epoch seconds.
 */
export type OptionParams =
  | { kind: 'REROUTE'; routeId: string; routeCode: string; avoidedDisruptionId: string; planChangeMinutes: number; extraKm: number }
  | { kind: 'SPLIT'; truckId: string; truckCode: string; transporterId: string; routeId: string; orderLineIds: string[]; quantityT: number; plannedDepartureS: number }
  | { kind: 'REPLACEMENT_TRUCK'; truckId: string; truckCode: string; driverUserId: string; roadKm: number; travelMinutes: number; transferMinutes: number; stopUntilS: number; breakdown: { type: 'REPORT'; reportId: string } | { type: 'DISRUPTION'; disruptionId: string } }
  | { kind: 'NEW_WINDOW'; newWindowEndS: number }
  | { kind: 'NOTIFY_ONLY' }
  | { kind: 'NONE' }; // infeasible options carry no parameters

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;
const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function isOptionParams(v: unknown, kind?: RecoveryKind): v is OptionParams {
  if (!isObj(v) || !str(v['kind'])) return false;
  if (v['kind'] === 'NONE') return true;
  if (kind && v['kind'] !== kind) return false;
  switch (v['kind']) {
    case 'REROUTE':
      return str(v['routeId']) && str(v['routeCode']) && str(v['avoidedDisruptionId']) && int(v['planChangeMinutes']) && num(v['extraKm']);
    case 'SPLIT':
      return str(v['truckId']) && str(v['truckCode']) && str(v['transporterId']) && str(v['routeId']) && Array.isArray(v['orderLineIds']) && (v['orderLineIds'] as unknown[]).every(str) && num(v['quantityT']) && int(v['plannedDepartureS']);
    case 'REPLACEMENT_TRUCK': {
      const b = v['breakdown'];
      const okB = isObj(b) && ((b['type'] === 'REPORT' && str(b['reportId'])) || (b['type'] === 'DISRUPTION' && str(b['disruptionId'])));
      return str(v['truckId']) && str(v['truckCode']) && str(v['driverUserId']) && num(v['roadKm']) && int(v['travelMinutes']) && int(v['transferMinutes']) && int(v['stopUntilS']) && okB;
    }
    case 'NEW_WINDOW':
      return int(v['newWindowEndS']);
    case 'NOTIFY_ONLY':
      return true;
    default:
      return false;
  }
}
