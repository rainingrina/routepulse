/**
 * GET /api/health — operational endpoint added in Milestone 1 (not one of the 38 product
 * endpoints in 06_API_SPEC.md). Public, no session needed. Used by scripts and the demo checklist.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  /** Real (wall-clock) server time, ISO 8601 UTC — not simulation time. */
  serverTime: string;
  version: string;
}
