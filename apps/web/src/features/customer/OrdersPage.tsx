import { useState } from 'react';
import { Link } from 'react-router';
import { RISK_LEVELS, type CustomerAlertDto, type OrderSummary, type ShipmentListItemCustomer } from '../../api/contract';
import { useOrders } from '../../api/hooks/portal';
import { useAlerts, useShipments } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { Card, EmptyState, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge } from '../../components/display/StatusBadge';
import { ChevronRight, ICON_STROKE, Inbox } from '../../components/icons';
import { SegmentedControl } from '../../components/primitives/radix';
import { t } from '../../i18n/en';
import { formatDayTime } from '../../i18n/format';
import { CustomerAlertBanner } from './CustomerAlertBanner';

type Tab = 'open' | 'delivered';

/** At-risk orders first (UI plan §11.1): worst level, then the earliest promise. */
export function sortOrdersForCustomer(orders: readonly OrderSummary[]): OrderSummary[] {
  const rank = (o: OrderSummary) => (o.worstRiskLevel ? RISK_LEVELS.indexOf(o.worstRiskLevel) : -1);
  return [...orders].sort((a, b) => rank(b) - rank(a) || a.promisedBy.localeCompare(b.promisedBy) || a.code.localeCompare(b.code));
}

/**
 * Customer orders (UI plan §11.1; #12, #14, #26, #28). Server-scoped to the customer's company.
 * Order cards take the estimate and plain status from the order's shipments (#14, customer view).
 */
export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>('open');
  const orders = useOrders({ status: tab });
  const shipments = useShipments({ status: tab === 'open' ? 'live' : 'delivered', sort: 'promise' });
  const alerts = useAlerts({ status: 'active' });
  const active = (alerts.data?.items ?? []).filter((a): a is CustomerAlertDto => a.view === 'customer');
  const byOrder = new Map<string, ShipmentListItemCustomer[]>();
  for (const s of shipments.data?.items ?? []) {
    if (s.view !== 'customer') continue;
    byOrder.set(s.orderId, [...(byOrder.get(s.orderId) ?? []), s]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Your orders</h1>
          <p className="text-body text-text-secondary">Estimated arrival at your receiving gate · {t.ruleBased.toLowerCase()} · {t.timesInIst}</p>
        </div>
        <SegmentedControl<Tab>
          label="Show orders"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'delivered', label: 'Delivered' },
          ]}
        />
      </div>

      {alerts.isError ? (
        <ErrorState compact title="Couldn't load alerts" error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : (
        active.map((a) => <CustomerAlertBanner key={a.id} alert={a} />)
      )}

      {orders.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : orders.isError ? (
        <ErrorState title="Couldn't load your orders" error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={tab === 'open' ? 'No open orders' : 'No delivered orders yet'} />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label={tab === 'open' ? 'Open orders' : 'Delivered orders'}>
          {sortOrdersForCustomer(orders.data.items).map((o) => (
            <li key={o.id}>
              <OrderCard order={o} shipments={byOrder.get(o.id) ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order: o, shipments }: { order: OrderSummary; shipments: ShipmentListItemCustomer[] }) {
  const { sync } = useSync();
  const lead = shipments[0] ?? null;
  const status = o.status === 'DELIVERED' ? 'DELIVERED' : o.worstRiskLevel;
  return (
    <Link
      to={`/orders/${encodeURIComponent(o.id)}`}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs hover:border-border-strong focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-h3 text-text code-label">{o.code}</p>
          <p className="text-small text-text-secondary">{o.lines.map((l) => `${l.gradeCode} · ${l.quantityT} t`).join(', ')}</p>
        </div>
        {status ? <StatusBadge status={status} size="sm" /> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-body">
        <div>
          <dt className="text-small text-text-muted">Promised by</dt>
          <dd className="text-text tabular">{formatDayTime(o.promisedBy)}</dd>
        </div>
        <div>
          <dt className="text-small text-text-muted">{o.status === 'DELIVERED' ? 'Arrived' : 'Estimated arrival'}</dt>
          <dd className="text-text">
            {o.status === 'DELIVERED' ? (
              lead?.arrivedAt ? <span className="tabular">{formatDayTime(lead.arrivedAt)}</span> : '—'
            ) : (
              <EtaDisplay at={lead?.etaAt ?? null} low={lead?.etaLowAt ?? null} high={lead?.etaHighAt ?? null} reference={sync?.simTime} />
            )}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-2 text-small text-text-secondary">
        <span>
          {lead ? lead.plainStatus : o.status === 'DELIVERED' ? 'Delivered' : 'Being planned'}
          {o.shipmentCount > 1 ? ` · ${o.shipmentCount} shipments` : ''}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
      </div>
    </Link>
  );
}
