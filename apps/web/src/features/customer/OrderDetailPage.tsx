import { Link, useParams } from 'react-router';
import type { ShipmentDetailCustomer, ShipmentListItemCustomer } from '../../api/contract';
import { useOrder } from '../../api/hooks/portal';
import { useNotifications, useShipmentDetail } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { Card, CardHeader, EmptyState, KeyValue, Skeleton } from '../../components/display/basics';
import { ErrorState } from '../../components/display/feedback';
import { EtaDisplay } from '../../components/display/EtaDisplay';
import { StatusBadge, statusForShipment } from '../../components/display/StatusBadge';
import { ArrowLeft, ICON_STROKE, Inbox } from '../../components/icons';
import { riskLabel, t } from '../../i18n/en';
import { formatDayTime } from '../../i18n/format';
import { MiniMap } from '../../map/MiniMap';
import { MilestoneList } from '../shipment/Milestones';
import { CustomerAlertBanner } from './CustomerAlertBanner';

/**
 * Customer order detail (UI plan §11.2; #13, #15, #10, #11, #31). Per shipment: the plain ETA card,
 * milestones without actor names, the own route map and the transporter name — never the driver.
 */
export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const order = useOrder(id);
  const notifications = useNotifications();

  if (order.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (order.isError) return <ErrorState title="Couldn't load this order" error={order.error} onRetry={() => void order.refetch()} />;
  const o = order.data;
  const shipments = o.shipments.filter((s): s is ShipmentListItemCustomer => s.view === 'customer');
  const ids = new Set(shipments.map((s) => s.id));
  const related = (notifications.data?.items ?? []).filter((n) => n.shipmentId !== null && ids.has(n.shipmentId));
  const status = o.status === 'DELIVERED' ? 'DELIVERED' : o.worstRiskLevel;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/orders" className="inline-flex items-center gap-1 self-start text-body text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
        Your orders
      </Link>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1 text-text code-label">{o.code}</h1>
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <p className="text-body text-text-secondary">
          Promised by {formatDayTime(o.promisedBy)} · {o.lines.map((l) => `${l.gradeCode} · ${l.quantityT} t`).join(', ')}
          {o.shipmentCount > 1 ? ` · ${o.shipmentCount} shipments` : ''}
        </p>
      </header>

      {shipments.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="No shipments planned yet" />
        </Card>
      ) : (
        shipments.map((s) => <CustomerShipmentCard key={s.id} item={s} />)
      )}

      <Card aria-label="Updates for this order">
        <CardHeader title="Updates for this order" titleAs="h2" />
        <div className="p-4">
          {notifications.isError ? (
            <ErrorState compact title="Couldn't load updates" error={notifications.error} onRetry={() => void notifications.refetch()} />
          ) : related.length === 0 ? (
            <p className="text-body text-text-muted">No updates yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {related.map((n) => (
                <li key={n.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-b-0 last:pb-0">
                  <span className="text-body text-text">{n.text}</span>
                  <span className="text-small text-text-muted tabular">{formatDayTime(n.simTime)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function CustomerShipmentCard({ item }: { item: ShipmentListItemCustomer }) {
  const detail = useShipmentDetail(item.id);
  const d = detail.data?.shipment.view === 'customer' ? detail.data.shipment : null;
  const status = statusForShipment(item);
  return (
    <Card aria-label={`Shipment ${item.code}`}>
      <CardHeader title={`Shipment ${item.code}`} titleAs="h2" eyebrow={item.transporterName} />
      <div className="flex flex-col gap-4 p-4">
        {detail.isPending ? (
          <Skeleton className="h-40" />
        ) : detail.isError || !d ? (
          <ErrorState compact title="Couldn't load this shipment" error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <>
            {d.openAlert ? <CustomerAlertBanner alert={d.openAlert} /> : null}
            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-4">
                <CustomerEtaCard d={d} statusLabel={status} />
                <div>
                  <h3 className="mb-2 text-h3 text-text">Progress</h3>
                  <MilestoneList milestones={d.milestones} />
                </div>
              </div>
              {d.arrivedAt ? null : <MiniMap shipmentIds={[d.id]} ariaLabel={`Map of shipment ${d.code}`} className="h-72" />}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** Plain ETA card (UI plan §11.2): arrival ± range, promise, level, plain reason, rule-based note. */
function CustomerEtaCard({ d, statusLabel }: { d: ShipmentDetailCustomer; statusLabel: ReturnType<typeof statusForShipment> }) {
  const { sync } = useSync();
  if (d.arrivedAt) {
    return (
      <dl className="grid grid-cols-2 gap-3">
        <KeyValue label="Arrived at your gate">{formatDayTime(d.arrivedAt)}</KeyValue>
        <KeyValue label="Promised by">{formatDayTime(d.promisedBy)}</KeyValue>
        <KeyValue label="Result">{d.onTime ? 'On time' : 'Later than promised'}</KeyValue>
        <KeyValue label="Unloading">{d.deliveredAt ? `Complete ${formatDayTime(d.deliveredAt)}` : 'In progress'}</KeyValue>
      </dl>
    );
  }
  const e = d.eta;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-text-muted">Estimated arrival at your gate</span>
        {statusLabel ? <StatusBadge status={statusLabel} size="sm" /> : null}
      </div>
      <EtaDisplay at={e.predictedArrivalAt} low={e.etaLowAt} high={e.etaHighAt} reference={sync?.simTime} className="text-h2 text-text" />
      <p className="text-body text-text-secondary">Promised by {formatDayTime(e.promisedBy)}</p>
      <p className="text-body text-text">{e.plainReason ?? (e.level === 'ON_TRACK' ? riskLabel.ON_TRACK : d.plainStatus)}</p>
      <p className="text-small text-text-muted">{t.ruleBased} · {d.plainStatus}</p>
    </div>
  );
}
