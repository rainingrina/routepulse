import { formatFull, formatTimeRelative, rangeHalfWidthMinutes } from '../../i18n/format';
import { cn } from '../cn';

/**
 * "16:20 ± 20" — the API's estimated arrival at the receiving gate (L1) with its rule-based range.
 * Shows the day when the ETA is not on the reference (simulation) day: "Fri 08:00 ± 85".
 */
export function EtaDisplay({
  at,
  low,
  high,
  reference,
  className,
}: {
  at: string | null;
  low: string | null;
  high: string | null;
  reference: string | null | undefined;
  className?: string;
}) {
  if (!at) return <span className={cn('text-text-muted', className)}>—</span>;
  const half = low && high ? rangeHalfWidthMinutes(at, low, high) : null;
  return (
    // aria-label on a plain span is ignored by screen readers (axe: aria-prohibited-attr), and the
    // visible text is aria-hidden — so the spoken form is a visually hidden copy instead.
    <span className={cn('tabular', className)}>
      <span aria-hidden>
        {formatTimeRelative(at, reference)}
        {half ? <span className="text-text-muted"> ± {half}</span> : null}
      </span>
      <span className="sr-only">
        Estimated arrival {formatFull(at)}
        {half ? `, plus or minus ${half} minutes` : ''}
      </span>
    </span>
  );
}
