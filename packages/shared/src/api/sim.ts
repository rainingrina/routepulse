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

/** POST /api/sim/clock (#5) — coordinator only, DEMO_MODE required. */
export type SimClockRequest =
  | { action: 'PLAY' }
  | { action: 'PAUSE' }
  | { action: 'SET_SPEED'; speed: 1 | 10 | 60 }
  /** Multiple of 5, 5–720. */
  | { action: 'ADVANCE'; minutes: number }
  /** Later than simTime, ≤ simTime + 24 h, on a 5-minute boundary. */
  | { action: 'ADVANCE_TO'; to: ISODateTime };

export interface SimClockResponse extends SimStateDto {
  /** 5-minute grid steps processed by this call. */
  stepsExecuted: number;
}

/** POST /api/sim/reset (#6) — coordinator only, DEMO_MODE required. */
export interface SimResetRequest {
  confirm: true;
}

export interface SimResetResponse extends SimStateDto {
  durationMs: number;
}
