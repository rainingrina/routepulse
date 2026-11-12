import type { Id } from './common.js';
import type { Segment } from './geo.js';

/** API spec §14a (#38). Coordinator only. */

export interface ReferenceResponse {
  lanes: { id: Id; code: string; name: string; customerId: Id }[];
  routes: { id: Id; code: string; laneId: Id; name: string; isPrimary: boolean; segments: Segment[] }[];
  segments: { segmentCode: string; name: string; routeCodes: string[] }[];
  transporters: { id: Id; code: string; name: string; fleetSize: number; isSmall: boolean }[];
  customers: { id: Id; code: string; name: string; city: string }[];
  trucks: {
    id: Id;
    code: string;
    transporterId: Id;
    status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE';
    locationLabel: string;
    hasDefaultDriver: boolean;
  }[];
}
