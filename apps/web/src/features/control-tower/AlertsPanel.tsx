import { Link } from 'react-router';
import type { AlertDtoCoordinator } from '../../api/contract';
import { useAlerts } from '../../api/hooks/world';
import { Badge, EmptyState, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { RECOVERY_AVAILABLE } from '../recovery/availability';
import { CircleCheck, MessageSquare, TriangleAlert } from '../../components/icons';
import { customerResponseLabel, reasonLabel, recoveryKindLabel } from '../../i18n/en';
import { formatDayTime, formatTime } from '../../i18n/format';

/** UI plan §6.5 Alerts tab (#26, active = OPEN + ACTION_CHOSEN; newest first from the API). */
export function AlertsPanel({ onViewOptions }: { onViewOptions: (shipmentId: string) => void }) {
  const active = useAlerts({ status: 'active' });
  const resolved = useAlerts({ status: 'RESOLVED', limit: 5 });

  if (active.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (active.isError) return <ErrorState compact title="Couldn't load alerts" error={active.error} onRetry={() => void active.refetch()} />;

  const items = active.data.items as AlertDtoCoordinator[];
  return (
    <div className="flex flex-col gap-3 p-4">
      {items.length === 0 ? (
        <EmptyState icon={CircleCheck} title="No alerts — everything is on track" />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id}>
              <AlertCard alert={a} onViewOptions={() => onViewOptions(a.shipment.id)} />
            </li>
          ))}
        </ul>
      )}
      {resolved.data && resolved.data.items.length > 0 ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-3 py-2 text-body font-medium text-text-secondary">
            Recently resolved ({resolved.data.items.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {(resolved.data.items as AlertDtoCoordinator[]).map((a) => (
              <li key={a.id} className="px-3 py-2 text-small text-text-secondary">
                <Link to={`/shipments/${encodeURIComponent(a.shipment.id)}`} className="font-medium link">
                  {a.shipment.code}
                </Link>{' '}
                · resolved {a.resolvedAt ? formatDayTime(a.resolvedAt) : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AlertCard({ alert: a, onViewOptions }: { alert: AlertDtoCoordinator; onViewOptions: () => void }) {
  const open = a.status === 'OPEN';
  return (
    <article
      className="relative overflow-hidden rounded-xl border border-border bg-surface py-3 pr-3 pl-4 shadow-xs transition-colors hover:border-border-strong"
      aria-label={`Alert for ${a.shipment.code}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${open ? 'bg-danger' : 'bg-accent-fill'}`} />
      <div className="flex items-start gap-2">
        {open ? (
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={2} />
        ) : (
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-text code-label">{a.shipment.code}</span>
            <Badge tone={open ? 'danger' : 'accent'}>{open ? 'Open' : a.status === 'ACTION_CHOSEN' ? 'Action chosen' : 'Resolved'}</Badge>
          </div>
          <p className="mt-0.5 text-body text-text">{a.summary}</p>
          <p className="mt-0.5 text-small text-text-muted tabular">
            {a.shipment.customerName} · {a.shipment.laneName} · at risk since {formatDayTime(a.openedAt)}
            {a.topReason ? ` · ${reasonLabel[a.topReason]}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {a.status === 'ACTION_CHOSEN' && a.chosenOption ? (
          <Badge tone="success" icon={CircleCheck}>
            Action chosen: {recoveryKindLabel[a.chosenOption.kind]}
          </Badge>
        ) : a.proposedOption ? (
          <Badge tone="accent">Suggested: {recoveryKindLabel[a.proposedOption.kind]}</Badge>
        ) : null}
        {a.customerResponse ? (
          <Badge tone="primary" icon={MessageSquare}>
            Customer {customerResponseLabel[a.customerResponse].toLowerCase()}
            {a.customerRespondedAt ? ` ${formatTime(a.customerRespondedAt)}` : ''}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" onClick={onViewOptions}>
          {RECOVERY_AVAILABLE ? 'View options' : 'View shipment'}
        </Button>
        <Link
          to={`/shipments/${encodeURIComponent(a.shipment.id)}`}
          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-small font-medium text-text hover:bg-surface-subtle"
        >
          Open
        </Link>
      </div>
    </article>
  );
}
