/**
 * Engine and simulation configuration (08_ETA_AND_RISK_ENGINE.md §1).
 * Values marked [A] are fictional assumptions; the golden test fixes them once recorded.
 */
export const ENGINE_CONFIG = {
  /** Simulation grid, minutes (architecture §9.1). */
  stepMinutes: 5,
  /** Standard loading time per truck, minutes [A]. */
  loadingMinutes: 40,
  /** Loading bays at Plant X [A]. */
  loadingBays: 3,
  /** Default unloading time when a customer does not set one (schema default). */
  defaultUnloadingMinutes: 60,
  /** Autopilot tracking ping interval, minutes. */
  pingIntervalMinutes: 30,
} as const;

/** Business-time offset for Asia/Kolkata (no daylight saving), minutes. */
export const IST_OFFSET_MINUTES = 330;
