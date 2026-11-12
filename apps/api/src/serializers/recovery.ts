import type { RecoveryOptionDto } from '@routepulse/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** RecoveryOptionDto (API §2.2). Coordinator only. CO₂e stays null until G-CO2 (AC-S1.1, L10). */
export const OPTION_SELECT = {
  id: true,
  optionSetId: true,
  kind: true,
  feasible: true,
  infeasibleReason: true,
  newEtaAt: true,
  etaLowAt: true,
  etaHighAt: true,
  meetsPromise: true,
  minutesSavedVsNotify: true,
  extraCostInr: true,
  co2eDeltaKg: true,
  co2eMethod: true,
  isSuggested: true,
  constraints: true,
  params: true,
  status: true,
} as const satisfies Prisma.RecoveryOptionSelect;

export type OptionRow = Prisma.RecoveryOptionGetPayload<{ select: typeof OPTION_SELECT }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const FALLBACK_TITLE: Record<OptionRow['kind'], string> = {
  REPLACEMENT_TRUCK: 'Replacement truck',
  REROUTE: 'Reroute',
  SPLIT: 'Split shipment',
  NEW_WINDOW: 'Agree new delivery window',
  NOTIFY_ONLY: 'Notify only',
};

export function toOptionDto(o: OptionRow): RecoveryOptionDto {
  const p = (o.params ?? {}) as Record<string, unknown>;
  return {
    id: o.id,
    optionSetId: o.optionSetId,
    kind: o.kind,
    title: typeof p['title'] === 'string' ? p['title'] : FALLBACK_TITLE[o.kind],
    feasible: o.feasible,
    infeasibleReason: o.infeasibleReason,
    newEtaAt: iso(o.newEtaAt),
    etaLowAt: iso(o.etaLowAt),
    etaHighAt: iso(o.etaHighAt),
    meetsPromise: o.meetsPromise,
    minutesSavedVsNotify: o.minutesSavedVsNotify,
    newWindowEnd: o.kind === 'NEW_WINDOW' && typeof p['newWindowEndS'] === 'number' ? new Date(p['newWindowEndS'] * 1000).toISOString() : null,
    extraCostInr: o.extraCostInr,
    costNote: 'Estimate from fictional rate card',
    co2eDeltaKg: o.co2eDeltaKg === null ? null : Number(o.co2eDeltaKg),
    co2eNote: o.co2eMethod ?? 'CO₂e — method under verification',
    isSuggested: o.isSuggested,
    constraints: [...o.constraints],
    status: o.status,
  };
}
