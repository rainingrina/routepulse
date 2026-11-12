/**
 * Display formatting only. Times arrive as ISO 8601 UTC (simulation time) and are shown in
 * Asia/Kolkata (API §1). Nothing here calculates an ETA, slack or risk — those come from the API.
 */
const TZ = 'Asia/Kolkata';

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' });
const dateKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat('en-IN');

/** "16:20" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "Thu 16:20" */
export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  return `${dayFmt.format(d)} ${timeFmt.format(d)}`;
}

/** "16:20" when on the same IST day as `reference`, otherwise "Fri 08:00". */
export function formatTimeRelative(iso: string, reference: string | null | undefined): string {
  if (reference && dateKeyFmt.format(new Date(iso)) === dateKeyFmt.format(new Date(reference))) return formatTime(iso);
  return formatDayTime(iso);
}

/** Long form for screen-reader labels: "Friday 13 Nov, 08:00". */
export function formatFull(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/** Half-width of an ETA range in whole minutes (display of API-supplied low/high values). */
export function rangeHalfWidthMinutes(atIso: string, lowIso: string, highIso: string): number {
  const at = Date.parse(atIso);
  return Math.round(Math.max(at - Date.parse(lowIso), Date.parse(highIso) - at) / 60_000);
}

/** "45 min", "1 h 40 m", "14 h", "1 d 2 h" */
export function formatDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m} min`;
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return mins > 0 ? `${hours} h ${mins} m` : `${hours} h`;
}

/** Slack text from the API's `slackMinutes` (spec §5.4: slack = promise − ETA). */
export function formatSlack(slackMinutes: number): string {
  if (slackMinutes >= 0) return `${formatDuration(slackMinutes)} spare`;
  return `Misses by ${formatDuration(slackMinutes)}`;
}

export function formatInr(amount: number): string {
  return inrFmt.format(amount);
}

export function formatInt(n: number): string {
  return intFmt.format(n);
}

export function formatPct(p: number | null): string {
  return p === null ? '—' : `${p.toFixed(1)}%`;
}

/** "+120 min" for factor bars. */
export function formatMinutesDelta(minutes: number): string {
  return `+${intFmt.format(minutes)} min`;
}
