import type { Role } from '../enums.js';
import type { Id, ISODateTime } from './common.js';

/** API spec §14 (#37). Coordinator only; also the control tower's activity feed (L7). */

export interface AuditItem {
  id: Id;
  actor: { id: Id; name: string; role: Role } | null;
  action: string;
  entityType: string;
  entityId: Id | null;
  simTime: ISODateTime | null;
  createdAt: ISODateTime;
  data: Record<string, unknown>;
}

export interface AuditResponse {
  items: AuditItem[];
}

export interface AuditQuery {
  shipmentId?: Id;
  entityType?: string;
  entityId?: Id;
  limit?: number;
}
