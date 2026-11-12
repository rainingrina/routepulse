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
import type { NotificationDto } from '../../api/contract';

/** Coordinator notification centre (#31–#33). Unread count comes from /api/sync. */
export function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const { sync } = useSync();
  const [open, setOpen] = useState(false);
  const unread = sync?.unreadNotifications ?? 0;
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className={cn(
          'relative inline-flex size-10 items-center justify-center rounded-full',
          onDark ? 'text-nav-text hover:bg-nav-hover hover:text-nav-text-strong' : 'text-text-secondary hover:bg-surface-sunken hover:text-text',
        )}
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
          className="z-50 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-surface shadow-md"
        >
          {open ? <NotificationList onNavigate={() => setOpen(false)} /> : null}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/**
 * Notification list (#31–#33). `linkFor` decides where an item leads: the coordinator default is the
 * shipment page; the customer portal passes its own order link (or null for no navigation).
 */
export function NotificationList({
  onNavigate,
  linkFor = (n) => (n.shipmentId ? `/shipments/${encodeURIComponent(n.shipmentId)}` : null),
  className,
  title = 'Notifications',
}: {
  onNavigate: () => void;
  linkFor?: (n: NotificationDto) => string | null;
  className?: string;
  /** Header text; a page that already has its own h1 passes a sub-heading. */
  title?: string;
}) {
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  return (
    <div className={cn('flex flex-col', className ?? 'max-h-[70vh]')}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-h3 text-text">
          {title}
          {list.data && list.data.unreadCount > 0 ? <span className="ml-2 text-small font-normal text-text-muted tabular">{list.data.unreadCount} unread</span> : null}
        </h2>
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
                    'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle',
                    !n.readAt && 'bg-primary-subtle/50',
                  )}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    const to = linkFor(n);
                    if (to) {
                      onNavigate();
                      void navigate(to);
                    }
                  }}
                >
                  {/* Fixed dot column keeps read and unread text aligned. */}
                  <span className="flex w-2 shrink-0 pt-2">
                    {!n.readAt ? <span aria-label="Unread" className="size-2 rounded-full bg-accent-fill" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn('text-body text-text', !n.readAt && 'font-medium')}>{n.text}</span>
                    <span className="text-small text-text-muted tabular">
                      {n.shipmentCode ? `${n.shipmentCode} · ` : ''}
                      {formatDayTime(n.simTime)}
                    </span>
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
