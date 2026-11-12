import { useNavigate } from 'react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ListResponse, ShipmentListItem, ShipmentListItemCoordinator } from '../../api/contract';
import { useAlerts, useDashboard, useDriverReports } from '../../api/hooks/world';
import { isApiRequestError } from '../../api/client';
import { KpiCard } from '../../components/display/KpiCard';
import { Tooltip } from '../../components/primitives/radix';
import { TriangleAlert } from '../../components/icons';
import { formatDuration, formatPct } from '../../i18n/format';
import { countByLevel, type LevelFilter } from './listFilters';

function unavailableText(error: unknown): string {
  if (isApiRequestError(error) && error.kind === 'unavailable') return 'Not in mock mode';
  return 'Unavailable';
}

/** UI plan §6.2 — every value comes from an API response; nothing is computed except counts of the list. */
export function KpiStrip({
  shipments,
  level,
  onLevel,
  onShowAlerts,
}: {
  shipments: UseQueryResult<ListResponse<ShipmentListItem>>;
  level: LevelFilter;
  onLevel: (l: LevelFilter) => void;
  onShowAlerts: () => void;
}) {
  const navigate = useNavigate();
  const alerts = useAlerts({ status: 'active' });
  const reports = useDriverReports({ status: 'PENDING_REVIEW' });
  const dashboard = useDashboard({ period: '30d' });

  const items = (shipments.data?.items ?? []) as ShipmentListItemCoordinator[];
  const counts = countByLevel(items);
  const live = items.length;
  const kpis = dashboard.data?.kpis;
  const warningDef = dashboard.data?.definitions.warningLead;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 py-3 xl:px-6" role="group" aria-label="Key figures">
      <KpiCard
        label="Live shipments"
        value={live}
        caption="Not yet delivered"
        loading={shipments.isPending}
        unavailable={shipments.isError ? unavailableText(shipments.error) : null}
        onClick={() => onLevel('ALL')}
        pressed={level === 'ALL'}
        title="Show all live shipments"
      />
      <KpiCard
        label="At risk"
        value={counts.AT_RISK}
        caption={`of ${live} live`}
        tone={counts.AT_RISK > 0 ? 'danger' : 'neutral'}
        icon={counts.AT_RISK > 0 ? TriangleAlert : undefined}
        loading={shipments.isPending}
        unavailable={shipments.isError ? unavailableText(shipments.error) : null}
        onClick={() => onLevel('AT_RISK')}
        pressed={level === 'AT_RISK'}
        title="Filter the list to at-risk shipments"
      />
      <KpiCard
        label="Watch"
        value={counts.WATCH}
        caption={`of ${live} live`}
        tone={counts.WATCH > 0 ? 'warning' : 'neutral'}
        loading={shipments.isPending}
        unavailable={shipments.isError ? unavailableText(shipments.error) : null}
        onClick={() => onLevel('WATCH')}
        pressed={level === 'WATCH'}
        title="Filter the list to Watch shipments"
      />
      <KpiCard
        label="Open alerts"
        value={alerts.data?.items.length ?? 0}
        caption="Active alerts"
        loading={alerts.isPending}
        unavailable={alerts.isError ? unavailableText(alerts.error) : null}
        onClick={onShowAlerts}
        title="Show the Alerts tab"
      />
      <KpiCard
        label="Reports to review"
        value={reports.data?.items.length ?? 0}
        caption="Driver reports"
        loading={reports.isPending}
        unavailable={reports.isError ? unavailableText(reports.error) : null}
        onClick={() => void navigate('/reports')}
        title="Open the driver reports queue"
      />
      <KpiCard
        label="On-time (30 d)"
        value={formatPct(kpis?.onTimePct ?? null)}
        caption="Arrival vs agreed promise"
        loading={dashboard.isPending}
        unavailable={dashboard.isError ? unavailableText(dashboard.error) : null}
        onClick={() => void navigate('/dashboard')}
        title="Open the dashboard"
      />
      <Tooltip content={warningDef ?? 'Promised time minus the time a shipment first became At risk (median).'}>
        <div className="flex min-w-[180px] flex-1">
          <KpiCard
            label="Median warning lead"
            value={kpis?.medianWarningLeadMinutes != null ? `${kpis.medianWarningLeadMinutes < 0 ? '−' : ''}${formatDuration(kpis.medianWarningLeadMinutes)}` : '—'}
            caption={kpis?.medianWarningLeadMinutes != null && kpis.medianWarningLeadMinutes < 0 ? 'After the promised time' : 'Before the promised time'}
            loading={dashboard.isPending}
            unavailable={dashboard.isError ? unavailableText(dashboard.error) : null}
          />
        </div>
      </Tooltip>
    </div>
  );
}
