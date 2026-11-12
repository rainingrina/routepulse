import { PARTIES } from '../../api/contract';
import { partySwatch } from '../../components/display/basics';
import { cn } from '../../components/cn';
import { partyLabel } from '../../i18n/en';

/** Fixed-order party legend (UI plan: colour + text, never colour alone). */
export function PartyLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-small text-text-secondary', className)} aria-label="Legend">
      {PARTIES.map((p) => (
        <li key={p} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-sm', partySwatch[p])} />
          {partyLabel[p]}
        </li>
      ))}
    </ul>
  );
}
