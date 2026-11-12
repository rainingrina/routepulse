import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Popover as P } from 'radix-ui';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { CountBadge, EmptyState, Skeleton } from '../../components/display/basics';
import { ErrorState, InlineError } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { cn } from '../../components/cn';
import { Bell, Inbox, ICON_STROKE } from '../../components/icons';
import { formatDayTime } from '../../i18n/format';

/** Coordinator notification centre (#31–#33). Unread count comes from /api/sync. */
export function NotificationBell() {
  const { sync } = useSync();
  const [open, setOpen] = useState(false);
  const unread = sync?.unreadNotifications ?? 0;
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken hover:text-text"
      >
        <Bell aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
        <span className="absolute -top-0.5 -right-0.5">
          <CountBadge count={unread} label={`${unread} unread`} />
        </span>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="end"
          sideOffset={8}
          className="z-40 w-[360px] max-w-[calc(100vw-32px)] rounded-lg border border-border bg-surface shadow-md"
        >
          {open ? <NotificationList onNavigate={() => setOpen(false)} /> : null}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-h3 text-text">Notifications</h2>
        <Button
          size="sm"
          variant="ghost"
          loading={markAll.isPending}
          disabled={!list.data || list.data.unreadCount === 0}
          onClick={() => markAll.mutate()}
        >
          Mark all read
        </Button>
      </div>
      <InlineError error={markAll.error ?? markRead.error} className="px-4 pt-2" />
      <div className="overflow-y-auto">
        {list.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : list.isError ? (
          <ErrorState compact title="Couldn't load notifications" error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Inbox} title="No notifications" />
        ) : (
          <ul>
            {list.data.items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-subtle',
                    !n.readAt && 'bg-primary-subtle/50',
                  )}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    if (n.shipmentId) {
                      onNavigate();
                      void navigate(`/shipments/${encodeURIComponent(n.shipmentId)}`);
                    }
                  }}
                >
                  <span className="flex items-center gap-2 text-body text-text">
                    {!n.readAt ? <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                    {n.text}
                  </span>
                  <span className="text-small text-text-muted tabular">
                    {n.shipmentCode ? `${n.shipmentCode} · ` : ''}
                    {formatDayTime(n.simTime)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
