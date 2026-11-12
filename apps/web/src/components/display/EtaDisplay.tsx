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
    <span className={cn('tabular', className)} aria-label={`Estimated arrival ${formatFull(at)}${half ? `, plus or minus ${half} minutes` : ''}`}>
      <span aria-hidden>
        {formatTimeRelative(at, reference)}
        {half ? <span className="text-text-muted"> ± {half}</span> : null}
      </span>
    </span>
  );
}
