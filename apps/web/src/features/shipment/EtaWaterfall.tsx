import type { CSSProperties, ReactNode } from 'react';
import { PARTIES, type EtaExplanationCoordinator, type Factor, type Party } from '../../api/contract';
import { partySwatch } from '../../components/display/basics';
import { cn } from '../../components/cn';
import { partyLabel } from '../../i18n/en';
import { formatDayTime, formatDuration, formatTime } from '../../i18n/format';
import { PHASE_LABEL } from './FactorList';

/**
 * ETA waterfall (UI plan §7.3). A time axis from the planned arrival to the predicted arrival at the
 * receiving gate (L1): every factor of #18 is one bar starting where the previous one ended, so the
 * bars add up exactly as the four-term identity (planned + so far + plan change + expected). All
 * values are the API's; nothing is re-rounded or recomputed except positions on the axis.
 *
 * Reference marks: Promised by (dashed line), Road arrival (thin tick), the applicable receiving
 * window (sage band; an accepted override extends it). The chart is visual only — the factor list and
 * the identity table under it carry the same values for assistive technology.
 */

const MS_PER_MIN = 60_000;
const PHASES: Factor['phase'][] = ['INCURRED', 'PLAN_CHANGE', 'EXPECTED'];

export interface WaterfallBar {
  key: string;
  phase: Factor['phase'];
  label: string;
  /** Offset from the planned arrival, minutes. */
  start: number;
  minutes: number;
  party: Party | null;
  split: { party: Party; minutes: number }[] | null;
  pending: boolean;
}

/** Cumulative bars in API order (INCURRED → PLAN_CHANGE → EXPECTED). Pure; exported for tests. */
export function waterfallBars(factors: Factor[]): WaterfallBar[] {
  const out: WaterfallBar[] = [];
  let cum = 0;
  for (const phase of PHASES) {
    factors.forEach((f, i) => {
      if (f.phase !== phase) return;
      out.push({
        key: `${phase}-${f.code}-${i}`,
        phase,
        label: f.label,
        start: cum,
        minutes: f.minutes,
        party: f.party,
        split: f.split,
        pending: f.reviewStatus === 'PENDING_REVIEW',
      });
      cum += f.minutes;
    });
  }
  return out;
}

const intFmt = new Intl.NumberFormat('en-IN');
/** "+120 min" / "−30 min" / "0 min". */
export function signedMinutes(m: number): string {
  if (m === 0) return '0 min';
  return `${m < 0 ? '−' : '+'}${intFmt.format(Math.abs(m))} min`;
}

const sign = (m: number) => (m < 0 ? '−' : '+');

export function EtaWaterfall({ eta }: { eta: EtaExplanationCoordinator }) {
  const t0 = Date.parse(eta.plannedArrivalAt);
  const off = (iso: string) => (Date.parse(iso) - t0) / MS_PER_MIN;
  const bars = waterfallBars(eta.factors);
  const predicted = off(eta.predictedArrivalAt);
  const promised = off(eta.promisedBy);
  const road = off(eta.projectedRoadArrivalAt);
  const winOpen = off(eta.receivingWindow.opensAt);
  const winClose = off(eta.receivingWindow.overrideEndAt ?? eta.receivingWindow.closesAt);

  // Axis domain: every bar end and the reference marks (the window is clipped to it, not extended).
  const points = [0, predicted, promised, road, ...bars.flatMap((b) => [b.start, b.start + b.minutes])];
  const lo0 = Math.min(...points);
  const hi0 = Math.max(...points);
  const pad = Math.max((hi0 - lo0) * 0.03, 10);
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;
  const clamp = (m: number) => Math.min(Math.max(m, lo), hi);
  const band = winClose > lo && winOpen < hi ? { left: pct(clamp(winOpen)), right: pct(clamp(winClose)) } : null;

  const partiesShown = PARTIES.filter((p) => bars.some((b) => b.party === p || b.split?.some((s) => s.party === p)));
  const anyPending = bars.some((b) => b.pending);
  const anyNegative = bars.some((b) => b.minutes < 0);

  const track = (children?: ReactNode, tall = false) => (
    <div className={cn('relative', tall ? 'h-6' : 'h-5')}>
      {band ? <span className="absolute inset-y-0 bg-accent-subtle" style={{ left: `${band.left}%`, width: `${band.right - band.left}%` }} /> : null}
      <span className="absolute inset-y-0 w-px bg-text-muted/50" style={{ left: `${pct(road)}%` }} />
      <span className="absolute inset-y-0 border-l-2 border-dashed border-text" style={{ left: `${pct(promised)}%` }} />
      {children}
    </div>
  );

  const bar = (b: WaterfallBar) => {
    const from = Math.min(b.start, b.start + b.minutes);
    const style: CSSProperties = { left: `${pct(from)}%`, width: `max(${(Math.abs(b.minutes) / (hi - lo)) * 100}%, 3px)` };
    const base = 'absolute top-1 bottom-1 flex overflow-hidden rounded-sm';
    if (b.minutes < 0) return <span className={cn(base, 'border border-success bg-success-tint')} style={style} />;
    if (b.split && b.split.length > 0) {
      const total = b.split.reduce((a, s) => a + s.minutes, 0) || 1;
      return (
        <span className={cn(base, 'gap-px bg-surface', b.pending && 'opacity-60')} style={style}>
          {b.split.map((s) => (
            <span key={s.party} className={partySwatch[s.party]} style={{ width: `${(s.minutes / total) * 100}%` }} />
          ))}
        </span>
      );
    }
    return <span className={cn(base, b.party ? partySwatch[b.party] : 'bg-party-unattributed', b.pending && 'border border-dashed border-text opacity-60')} style={style} />;
  };

  return (
    <figure className="flex flex-col gap-2" aria-labelledby="eta-waterfall-caption">
      <figcaption id="eta-waterfall-caption" className="sr-only">
        ETA waterfall from the planned arrival {formatDayTime(eta.plannedArrivalAt)} to the predicted arrival at the receiving gate{' '}
        {formatDayTime(eta.predictedArrivalAt)}. The same values are listed under “Why this estimate” and in the ETA identity table.
      </figcaption>
      <div aria-hidden className="flex flex-col gap-1.5">
        <Row label="Planned arrival" value={formatDayTime(eta.plannedArrivalAt)}>
          {track(<span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-900" style={{ left: `${pct(0)}%` }} />)}
        </Row>
        {PHASES.map((phase) => {
          const rows = bars.filter((b) => b.phase === phase);
          if (rows.length === 0) return null;
          return (
            <div key={phase} className="flex flex-col gap-1.5">
              <p className="eyebrow pt-1 text-text-muted">{PHASE_LABEL[phase]}</p>
              {rows.map((b) => (
                <Row key={b.key} label={b.label} value={signedMinutes(b.minutes)} note={b.pending ? 'Pending coordinator review' : b.split ? 'Knock-on' : undefined}>
                  {track(bar(b))}
                </Row>
              ))}
            </div>
          );
        })}
        <Row label="Predicted arrival at the receiving gate" value={formatDayTime(eta.predictedArrivalAt)} strong>
          {track(
            <span
              className="absolute top-1 bottom-1 rounded-sm bg-ink-900"
              style={{ left: `${pct(Math.min(0, predicted))}%`, width: `max(${(Math.abs(predicted) / (hi - lo)) * 100}%, 3px)` }}
            />,
            true,
          )}
        </Row>
        <div className="flex justify-between text-[11px] leading-4 text-text-muted tabular">
          <span>{formatDayTime(new Date(t0 + lo * MS_PER_MIN).toISOString())}</span>
          <span>{formatDayTime(new Date(t0 + hi * MS_PER_MIN).toISOString())}</span>
        </div>
      </div>

      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-secondary">
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 border-l-2 border-dashed border-text" /> Promised by {formatDayTime(eta.promisedBy)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3.5 w-px bg-text-muted" /> Road arrival {formatDayTime(eta.projectedRoadArrivalAt)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-accent-subtle ring-1 ring-border" />
          {eta.receivingWindow.overrideEndAt
            ? `Agreed window until ${formatTime(eta.receivingWindow.overrideEndAt)}`
            : `Receiving window ${formatTime(eta.receivingWindow.opensAt)}–${formatTime(eta.receivingWindow.closesAt)}`}
        </li>
        {partiesShown.map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-[2px]', partySwatch[p])} /> {partyLabel[p]}
          </li>
        ))}
        {anyPending ? (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[2px] border border-dashed border-text opacity-60" /> Pending review
          </li>
        ) : null}
        {anyNegative ? (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[2px] border border-success bg-success-tint" /> Saves time
          </li>
        ) : null}
      </ul>

      {/* Identity line (UI plan §7.3, L3): the four terms exactly as returned. */}
      <p className="text-small text-text-secondary tabular">
        {formatTime(eta.plannedArrivalAt)} planned {sign(eta.totals.incurredMinutes)} {formatDuration(eta.totals.incurredMinutes)} so far {sign(eta.totals.planChangeMinutes)}{' '}
        {formatDuration(eta.totals.planChangeMinutes)} plan change {sign(eta.totals.expectedMinutes)} {formatDuration(eta.totals.expectedMinutes)} expected ={' '}
        {formatDayTime(eta.predictedArrivalAt)} · Rule-based estimate
      </p>
    </figure>
  );
}

function Row({ label, value, note, strong = false, children }: { label: string; value: string; note?: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3 text-small">
        <span className={cn('min-w-0 truncate', strong ? 'font-semibold text-text' : 'text-text-secondary')}>
          {label}
          {note ? <span className="text-text-muted"> · {note}</span> : null}
        </span>
        <span className={cn('shrink-0 tabular', strong ? 'font-semibold text-text' : 'font-medium text-text')}>{value}</span>
      </div>
      {children}
    </div>
  );
}
