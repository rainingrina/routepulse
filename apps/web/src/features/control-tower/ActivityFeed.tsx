import { Link } from 'react-router';
import { useAudit } from '../../api/hooks/world';
import { EmptyState, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { History } from '../../components/icons';
import { formatDayTime } from '../../i18n/format';
import { activityShipmentCode, activitySummary, isDomainAction } from './activityFormat';

/** UI plan §6.5 Activity tab — source GET /api/audit (#37, L7), domain actions only, newest first. */
export function ActivityFeed({ shipmentId }: { shipmentId?: string }) {
  const audit = useAudit({ limit: 50, ...(shipmentId ? { shipmentId } : {}) });
  if (audit.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (audit.isError) return <ErrorState compact title="Couldn't load activity" error={audit.error} onRetry={() => void audit.refetch()} />;
  const items = audit.data.items.filter((i) => isDomainAction(i.action));
  if (items.length === 0) return <EmptyState icon={History} title="No activity yet" />;
  return (
    <ul className="divide-y divide-border" aria-label="Recent activity">
      {items.map((i) => {
        const code = activityShipmentCode(i);
        return (
          <li key={i.id} className="flex flex-col gap-0.5 px-4 py-2.5">
            <span className="text-body text-text">{activitySummary(i)}</span>
            <span className="text-small text-text-muted tabular">
              {i.entityType === 'Shipment' && i.entityId && code ? (
                <Link to={`/shipments/${encodeURIComponent(i.entityId)}`} className="font-medium text-primary hover:underline">
                  {code}
                </Link>
              ) : code ? (
                <span className="font-medium text-text-secondary">{code}</span>
              ) : null}
              {code ? ' · ' : ''}
              {i.actor ? `${i.actor.name} · ` : ''}
              {i.simTime ? formatDayTime(i.simTime) : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
