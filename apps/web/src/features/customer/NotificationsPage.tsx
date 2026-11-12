import { useShipments } from '../../api/hooks/world';
import { Card } from '../../components/display/basics';
import { NotificationList } from '../../app/layouts/NotificationBell';

/**
 * Customer notifications (UI plan §11.3; #31–#33): unread dots and "Mark all read". An item that
 * belongs to one of the customer's shipments opens that order. Texts are the server's plain words.
 */
export default function NotificationsPage() {
  const shipments = useShipments({ status: 'all', sort: 'promise' });
  const orderOf = new Map((shipments.data?.items ?? []).map((s) => [s.id, s.orderId]));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-h1 text-text">Notifications</h1>
        <p className="text-body text-text-secondary">Updates from Plant X about your orders. An update about an order opens that order.</p>
      </div>
      <Card className="overflow-hidden">
        <NotificationList
          title="All updates"
          className="max-h-none"
          onNavigate={() => undefined}
          linkFor={(n) => {
            const orderId = n.shipmentId ? orderOf.get(n.shipmentId) : undefined;
            return orderId ? `/orders/${encodeURIComponent(orderId)}` : null;
          }}
        />
      </Card>
    </div>
  );
}
