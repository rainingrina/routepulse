import type { RecoveryKind, RecoveryOptionDto } from '../../api/contract';
import { Badge } from '../../components/display/basics';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { Button } from '../../components/primitives/Button';
import { cn } from '../../components/cn';
import { CalendarClock, CircleCheck, CircleAlert, Megaphone, Route, Sparkles, Split, Truck, ICON_STROKE, type LucideIcon } from '../../components/icons';
import { formatDuration, formatInr, formatTimeRelative } from '../../i18n/format';

export const kindIcon: Record<RecoveryKind, LucideIcon> = {
  REROUTE: Route,
  SPLIT: Split,
  REPLACEMENT_TRUCK: Truck,
  NEW_WINDOW: CalendarClock,
  NOTIFY_ONLY: Megaphone,
};

/** UI plan §9.1 RecoveryCard. Shows API values only; feasibility and the suggestion come from the server. */
export function RecoveryCard({
  option: o,
  simTime,
  canChoose,
  onChoose,
  chosenLine,
}: {
  option: RecoveryOptionDto;
  simTime: string | undefined;
  canChoose: boolean;
  onChoose: () => void;
  /** e.g. "Chosen by Meera at 11:25" */
  chosenLine?: string | null;
}) {
  const Icon = kindIcon[o.kind];
  const chosen = o.status === 'CHOSEN';
  const awaiting = o.status === 'AWAITING_CUSTOMER';
  const superseded = o.status === 'SUPERSEDED';
  return (
    <article
      aria-label={`${o.title}${o.isSuggested ? ' (suggested)' : ''}${!o.feasible ? ' (not available)' : ''}`}
      className={cn(
        'relative rounded-lg border bg-surface p-3',
        o.isSuggested && o.feasible ? 'border-accent shadow-sm' : 'border-border',
        chosen && 'border-success ring-1 ring-success',
        (!o.feasible || superseded) && 'bg-surface-subtle opacity-70',
      )}
    >
      {o.isSuggested && o.feasible ? (
        <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-small font-semibold text-on-primary">
          <Sparkles aria-hidden className="size-3" strokeWidth={2} />
          Suggested
        </span>
      ) : null}
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-secondary">
          <Icon aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-body font-semibold text-text">{o.title}</h4>
          {o.feasible ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-text-secondary">
              <span>
                New ETA{' '}
                <EtaDisplay at={o.newEtaAt} low={o.etaLowAt} high={o.etaHighAt} reference={simTime} className="font-medium text-text" />
              </span>
              {o.meetsPromise ? (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <CircleCheck aria-hidden className="size-3.5" strokeWidth={2} />
                  {o.kind === 'NEW_WINDOW' && o.newWindowEnd ? `Meets the new window until ${formatTimeRelative(o.newWindowEnd, simTime)}` : 'Meets promise'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-danger">
                  <CircleAlert aria-hidden className="size-3.5" strokeWidth={2} />
                  Misses promise
                </span>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-small text-text-secondary">Not available: {o.infeasibleReason ?? 'not feasible now'}</p>
          )}
        </div>
      </div>

      {o.feasible ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2">
          <div>
            <dt className="text-[11px] leading-4 text-text-muted">Time saved vs Notify only</dt>
            <dd className="text-body font-medium text-text tabular">{o.kind === 'NOTIFY_ONLY' ? '—' : formatDuration(o.minutesSavedVsNotify)}</dd>
          </div>
          <div>
            <dt className="text-[11px] leading-4 text-text-muted">Extra cost</dt>
            <dd className="text-body font-medium text-text tabular">{formatInr(o.extraCostInr)}</dd>
            <dd className="text-[11px] leading-4 text-text-muted">{o.costNote}</dd>
          </div>
          <div>
            <dt className="text-[11px] leading-4 text-text-muted">CO₂e</dt>
            <dd className={cn('text-small', o.co2eDeltaKg === null ? 'text-text-muted' : 'font-medium text-text tabular')}>
              {o.co2eDeltaKg === null ? o.co2eNote : `${o.co2eDeltaKg > 0 ? '+' : ''}${o.co2eDeltaKg} kg`}
            </dd>
          </div>
        </dl>
      ) : null}

      {o.constraints.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-small text-text-secondary">
          {o.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {chosen ? (
          <Badge tone="success" icon={CircleCheck}>
            {chosenLine ?? 'Chosen'}
          </Badge>
        ) : awaiting ? (
          <Badge tone="warning">Waiting for customer acceptance</Badge>
        ) : superseded ? (
          <Badge>Not chosen</Badge>
        ) : o.feasible && canChoose ? (
          <Button size="sm" variant={o.isSuggested ? 'primary' : 'secondary'} onClick={onChoose}>
            Choose
          </Button>
        ) : null}
      </div>
    </article>
  );
}
