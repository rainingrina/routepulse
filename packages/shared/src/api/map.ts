import type { DisruptionKind, Milestone, RiskLevel } from '../enums.js';
import type { Id, ISODateTime } from './common.js';
import type { GeoJSONLineString, Segment } from './geo.js';

/** API spec §6 (#10, #11). Route geometry is hand-traced demo data (`x_source: HAND_TRACED_DEMO`). */

export interface MapLayersResponse {
  plant: { name: string; lat: number; lng: number };
  sites: { customerId: Id; name: string; city: string; lat: number; lng: number; receivingHours: string }[];
  routes: {
    id: Id;
    code: string;
    laneId: Id;
    name: string;
    isPrimary: boolean;
    lengthKm: number;
    geometry: GeoJSONLineString;
    segments: Segment[];
  }[];
  activeDisruptions: { id: Id; kind: DisruptionKind; label: string; segmentCodes: string[] }[];
}

export interface PositionItem {
  shipmentId: Id;
  code: string;
  routeId: Id;
  lat: number;
  lng: number;
  bearing: number;
  progressPct: number;
  currentMilestone: Milestone;
  riskLevel: RiskLevel | null;
  stopped: boolean;
}

export interface PositionsResponse {
  simTime: ISODateTime;
  items: PositionItem[];
}
