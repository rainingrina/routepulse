import type { EventSource, MilestoneEntry } from '../../api/contract';
import { cn } from '../../components/cn';
import { CircleCheck, CircleDot, Circle, ICON_STROKE } from '../../components/icons';
import { milestoneLabel } from '../../i18n/en';
import { formatDayTime } from '../../i18n/format';

const sourceLabel: Record<EventSource, string> = {
  DRIVER: 'Driver',
  COORDINATOR: 'Coordinator',
  SIMULATION: 'Simulation',
  SEED: 'Seed',
  SYSTEM: 'System',
};

function stateText(m: MilestoneEntry): string {
  return m.state === 'DONE' ? 'done' : m.state === 'CURRENT' ? 'current' : 'pending';
}

/** Compact horizontal stepper for the quick panel (UI plan §6.5 item 4). */
export function MilestoneStepper({ milestones }: { milestones: MilestoneEntry[] }) {
  return (
    <ol className="flex gap-1" aria-label="Milestones">
      {milestones.map((m) => (
        <li key={m.milestone} className="flex min-w-0 flex-1 flex-col gap-1" aria-label={`${milestoneLabel[m.milestone]}: ${stateText(m)}`}>
          <span
            aria-hidden
            className={cn(
              'h-1.5 rounded-full',
              m.state === 'DONE' ? 'bg-primary' : m.state === 'CURRENT' ? 'bg-primary/60' : 'bg-surface-sunken',
            )}
          />
        </li>
      ))}
    </ol>
  );
}

/** Vertical milestone list with time and source (UI plan §7.4). Customer view has no actor names. */
export function MilestoneList({ milestones }: { milestones: MilestoneEntry[] }) {
  return (
    <ol className="flex flex-col" aria-label="Milestones">
      {milestones.map((m, i) => {
        const Icon = m.state === 'DONE' ? CircleCheck : m.state === 'CURRENT' ? CircleDot : Circle;
        const last = i === milestones.length - 1;
        return (
          <li key={m.milestone} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span aria-hidden className={cn('absolute top-6 bottom-0 left-[11px] w-px', m.state === 'DONE' ? 'bg-primary' : 'bg-border')} />
            ) : null}
            <Icon
              aria-hidden
              className={cn('relative size-6 shrink-0 bg-surface', m.state === 'PENDING' ? 'text-border-strong' : 'text-primary', m.state === 'CURRENT' && 'motion-safe:animate-pulse')}
              strokeWidth={ICON_STROKE}
            />
            <div className="flex min-w-0 flex-col">
              <span className={cn('text-body', m.state === 'PENDING' ? 'text-text-muted' : 'font-medium text-text')}>
                {milestoneLabel[m.milestone]}
                <span className="sr-only"> ({stateText(m)})</span>
              </span>
              {m.at ? (
                <span className="text-small text-text-muted tabular">
                  {formatDayTime(m.at)}
                  {m.source ? ` · ${sourceLabel[m.source]}${m.actorName ? ` · ${m.actorName}` : ''}` : ''}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
