/** UI-safe constants shared by the API and the web app. All data is fictional (Plant X). */

/** Plant X — a fictional polymer plant. Real coordinates are used only as map geography. */
export const PLANT = {
  name: 'Plant X',
  lat: 19.0326,
  lng: 73.1175,
} as const;

/** Display time zone for every business time (architecture §8.5). */
export const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

/** Risk-level thresholds on slack minutes (spec §5.4); for display only — the API classifies. */
export const RISK_THRESHOLDS = {
  onTrackMinSlack: 120,
  watchMinSlack: 0,
} as const;

/** A transporter with at most this many trucks is shown as a small fleet [A]. */
export const SMALL_FLEET_MAX = 10;
