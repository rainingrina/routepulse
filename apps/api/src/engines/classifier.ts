import type { DriverReasonCode } from '@routepulse/shared';

/**
 * Driver-report reason classifier, method KEYWORD_LIST_V1 (spec §5.8, API §9.2, AC-F2.2).
 *
 * A fixed English word list — not a model, nothing learned. It only SUGGESTS a reason and shows the
 * matched words; it never confirms anything (the driver confirms, the coordinator reviews).
 * Text is lower-cased, hyphens and apostrophes are removed ("e-way" → "eway"), and split into
 * words; a keyword matches a whole word. The reason with the most distinct matched keywords is
 * suggested; a tie between reasons gives no suggestion. Strength: STRONG ≥ 2 keywords for the
 * suggested reason, WEAK = 1, NONE = 0 (API §9.2). OTHER has no keywords.
 */
export const CLASSIFIER_METHOD = 'KEYWORD_LIST_V1';

export const KEYWORDS: Readonly<Record<Exclude<DriverReasonCode, 'OTHER'>, readonly string[]>> = {
  BREAKDOWN: ['breakdown', 'broke', 'broken', 'tyre', 'tyres', 'tire', 'tires', 'puncture', 'punctured', 'flat', 'engine', 'axle', 'brake', 'brakes', 'overheating', 'overheated', 'clutch', 'battery', 'mechanic', 'repair'],
  PLANT_GATE_WAIT: ['plant', 'gate', 'loading', 'bay', 'dispatch'],
  TRAFFIC: ['traffic', 'jam', 'congestion', 'accident', 'tollbooth'],
  ROAD_CLOSED: ['closed', 'closure', 'blocked', 'diversion', 'landslide', 'barricade'],
  HEAVY_RAIN: ['rain', 'raining', 'rains', 'flood', 'flooded', 'flooding', 'waterlogged', 'waterlogging', 'storm'],
  DOCUMENTS: ['document', 'documents', 'papers', 'permit', 'eway', 'invoice', 'checkpost', 'checkpoint', 'challan'],
  UNLOADING_WAIT: ['unload', 'unloading', 'unloaded', 'dock', 'forklift'],
};

export interface Classification {
  suggestedReason: DriverReasonCode | null;
  matchedKeywords: string[];
  strength: 'STRONG' | 'WEAK' | 'NONE';
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’-]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

export function classify(text: string): Classification {
  const present = new Set(words(text));
  let best: { reason: DriverReasonCode; matched: string[] } | null = null;
  let tie = false;
  for (const [reason, list] of Object.entries(KEYWORDS) as [DriverReasonCode, readonly string[]][]) {
    const matched = list.filter((k) => present.has(k));
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matched.length) {
      best = { reason, matched };
      tie = false;
    } else if (matched.length === best.matched.length) tie = true;
  }
  if (!best || tie) {
    // No (unique) suggestion: still show every matched word so the driver sees why.
    const all = Object.values(KEYWORDS).flatMap((list) => list.filter((k) => present.has(k)));
    return { suggestedReason: null, matchedKeywords: [...new Set(all)], strength: 'NONE' };
  }
  return { suggestedReason: best.reason, matchedKeywords: best.matched, strength: best.matched.length >= 2 ? 'STRONG' : 'WEAK' };
}
