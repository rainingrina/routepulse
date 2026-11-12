import type { DisruptionKind, Party, ReasonCode, RiskLevel } from '../enums.js';
import type { Id, ISODateTime } from './common.js';

/** API spec §2.2 and §5.4–5.6 (#7–#9). Party and reason are set by the server from the kind. */

export interface DisruptionDto {
  id: Id;
  kind: DisruptionKind;
  origin: 'SEED' | 'SIMULATOR';
  label: string;
  segmentCodes: string[];
  shipmentId: Id | null;
  slowdownPct: number | null;
  extraMinutesPerTruck: number | null;
  stopMinutes: number | null;
  party: Party;
  reason: ReasonCode;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  endedEarlyAt: ISODateTime | null;
  active: boolean;
}

export type CreateDisruptionRequest =
  | { kind: 'WEATHER_SLOWDOWN'; label?: string; segmentCodes: string[]; slowdownPct: number; durationMinutes: number }
  | { kind: 'ROAD_CLOSURE'; label?: string; segmentCodes: string[]; durationMinutes: number }
  | { kind: 'GATE_CONGESTION'; label?: string; extraMinutesPerTruck: number; durationMinutes: number }
  | { kind: 'TRUCK_BREAKDOWN'; label?: string; shipmentId: Id; repairMinutes: number };

export interface CreateDisruptionResponse {
  disruption: DisruptionDto;
  impact: {
    affectedShipmentIds: Id[];
    affectedCount: number;
    levelChanges: { shipmentId: Id; code: string; from: RiskLevel | null; to: RiskLevel | null }[];
    nowAtRiskCount: number;
    summary: string;
  };
}
