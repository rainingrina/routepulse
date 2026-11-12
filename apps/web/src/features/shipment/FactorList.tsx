import type { Factor } from '../../api/contract';
import { Badge, PartyChip } from '../../components/display/basics';
import { cn } from '../../components/cn';
import { factorLabel, partyLabel } from '../../i18n/en';
import { formatMinutesDelta } from '../../i18n/format';

export const PHASE_LABEL: Record<Factor['phase'], string> = {
  INCURRED: 'So far',
  PLAN_CHANGE: 'Plan change',
  EXPECTED: 'Expected',
};

const PHASE_ORDER: Factor['phase'][] = ['INCURRED', 'PLAN_CHANGE', 'EXPECTED'];

/**
 * Text equivalent of the ETA waterfall (UI plan §7.3): every factor as a row — factor, phase, minutes,
 * party, detail. Values are exactly those of the API; the list never adds or re-rounds minutes.
 */
export function FactorList({ factors, compact = false }: { factors: Factor[]; compact?: boolean }) {
  if (factors.length === 0) {
    return <p className="text-body text-text-secondary">No delay factors — the estimate equals the planned arrival.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {PHASE_ORDER.map((phase) => {
        const rows = factors.filter((f) => f.phase === phase);
        if (rows.length === 0) return null;
        return (
          <div key={phase}>
            <p className="overline mb-1 text-text-muted">{PHASE_LABEL[phase]}</p>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {rows.map((f, i) => (
                <li key={`${f.code}-${i}`} className={cn('flex flex-col gap-0.5 px-3', compact ? 'py-1.5' : 'py-2')}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-body text-text">
                      {f.label}
                      {!compact ? <span className="text-text-muted"> · {factorLabel[f.code]}</span> : null}
                    </span>
                    <span className="shrink-0 text-body font-semibold text-text tabular">{formatMinutesDelta(f.minutes)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {f.party ? (
                      <span className="text-small text-text-muted">
                        Attributed to <PartyChip party={f.party} />
                      </span>
                    ) : f.split ? (
                      <span className="text-small text-text-muted">
                        Knock-on split: {f.split.map((p) => `${partyLabel[p.party]} ${p.minutes} min`).join(' · ')}
                      </span>
                    ) : null}
                    {f.reviewStatus === 'PENDING_REVIEW' ? <Badge tone="warning">Pending coordinator review</Badge> : null}
                  </div>
                  {!compact ? <p className="text-small text-text-secondary">{f.detail}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
