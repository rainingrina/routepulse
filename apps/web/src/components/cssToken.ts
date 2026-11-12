/**
 * Reads a design token (UI plan §2) for libraries that need a resolved colour string (Recharts SVG
 * attributes, MapLibre paint). Falls back to `currentColor` where there is no document (tests).
 */
export function cssToken(name: `--rp-${string}`): string {
  if (typeof document === 'undefined') return 'currentColor';
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || 'currentColor';
}
