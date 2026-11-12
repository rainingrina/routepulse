/**
 * Recovery options (#29) and choose (#30) are served by the real API since Milestone 8, and by the
 * development mock in mock mode. Kept as a single switch so the feature can be hidden again if the
 * backend is deployed without it.
 */
export const RECOVERY_AVAILABLE: boolean = true;

export const RECOVERY_UNAVAILABLE_TEXT = 'Recovery options are not available yet — the recovery engine is the next milestone. Alerts, ETA and attribution shown here are live.';
