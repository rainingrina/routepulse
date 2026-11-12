/**
 * Recovery configuration (engine doc §1 and §8, architecture §12). All values are FICTIONAL demo
 * assumptions [A], fixed by the golden test.
 */
export const RECOVERY_CONFIG = {
  /** Fictional rate card (spec §5.1): dispatch fee, per km, load-transfer fee, INR. */
  dispatchInr: 3000,
  perKmInr: 55,
  transferFeeInr: 2000,
  /** Replacement search radius, km. */
  replacementRadiusKm: 50,
  /** Replacement truck travel speed, km/h. */
  replacementSpeedKmh: 40,
  /** Load transfer time at the breakdown, minutes. */
  transferMinutes: 45,
  /** Split eligibility: more than one order line, or more than this many tonnes. */
  splitMinTonnes: 10,
  /** NEW_WINDOW: road arrival rounded UP to this grid; at most this far beyond the current promise. */
  newWindowStepMinutes: 30,
  newWindowMaxHours: 48,
} as const;

/**
 * Road distance (km) from a truck's parked location to the road network of a lane, for the
 * replacement-truck rule. Decision 2026-11-12 (M8): the hand-traced map coordinates are display
 * only, so the distance is a documented fictional value per seeded yard; trucks at Plant X use the
 * shipment's distance along its route. A truck at any other location has no known road distance and
 * is not a candidate. Khopoli yard ≈ 20 km by road (seed comment; engine doc Example 3).
 */
export const YARD_ROAD_KM: Readonly<Record<string, number>> = {
  'Khopoli yard': 20,
};

export const SUGGESTION_RULE =
  'Suggested = among feasible options that meet the current promise (excluding new window and notify only), the lowest estimated cost; ties → earliest arrival. If none meets the promise, the feasible option with the smallest delay.';
