import type { ISODateTime } from './common.js';

/** 06_API_SPEC.md §2.2 — simulation clock state. */
export interface SimStateDto {
  simTime: ISODateTime;
  running: boolean;
  speed: 1 | 10 | 60;
  stepMinutes: number;
  /** Monotonic; refetch affected queries when it changes (API §15). */
  worldVersion: number;
  simError: string | null;
  demoMode: boolean;
}

/** GET /api/sync (#4). */
export interface SyncResponse extends SimStateDto {
  /** 0 for drivers. */
  unreadNotifications: number;
}
