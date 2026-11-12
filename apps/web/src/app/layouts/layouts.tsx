import { Outlet } from 'react-router';
import { useDriverReports } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { CountBadge } from '../../components/display/basics';
import { Factory, ICON_STROKE } from '../../components/icons';
import { SimClockControl } from '../../features/simulation/SimClockControl';
import { t } from '../../i18n/en';
import { useCurrentUser } from '../RoleGuard';
import { NotificationBell } from './NotificationBell';
import { LayoutOutlet, MockModeBanner, SkipLink, SyncBanners, TopNavLink, UserMenu, Wordmark } from './shell';

/** UI plan §3 coordinator top bar (64 px) + "Fictional data · Plant X" strip. Desktop-first. */
export function CoordinatorLayout() {
  const pending = useDriverReports({ status: 'PENDING_REVIEW' });
  const pendingCount = pending.data?.items.length ?? 0;
  return (
    <div className="flex h-dvh flex-col">
      <SkipLink />
      <MockModeBanner />
      <header className="z-20 shrink-0 border-b border-border bg-surface">
        <div className="flex h-16 items-center gap-4 px-4 xl:px-6">
          <Wordmark />
          <nav aria-label="Main" className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <TopNavLink to="/control-tower">{t.nav.controlTower}</TopNavLink>
            <TopNavLink to="/dashboard">{t.nav.dashboard}</TopNavLink>
            <TopNavLink to="/reports">
              {t.nav.reports}
              <CountBadge count={pendingCount} label={`${pendingCount} pending review`} />
            </TopNavLink>
            <TopNavLink to="/simulation">{t.nav.simulation}</TopNavLink>
          </nav>
          <div className="flex-1" />
          <div className="hidden lg:block">
            <SimClockControl canControl />
          </div>
          <NotificationBell />
          <UserMenu />
        </div>
        <p className="border-t border-border bg-surface-subtle px-4 py-0.5 text-small text-text-muted xl:px-6">
          {t.fictionalNotice} · {t.ruleBased}s · {t.timesInIst}
        </p>
      </header>
      <SyncBanners />
      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <LayoutOutlet />
      </main>
    </div>
  );
}

/** UI plan §3 customer top bar: company name, Orders, Notifications, user menu, "Times shown in IST". */
export function CustomerLayout() {
  const user = useCurrentUser();
  const { sync } = useSync();
  const unread = sync?.unreadNotifications ?? 0;
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <MockModeBanner />
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-h3 text-text">{user.customer?.name ?? user.name}</span>
            <span className="text-small text-text-muted">
              Deliveries from Plant X · <Wordmark className="!text-small" />
            </span>
          </div>
          <nav aria-label="Main" className="ml-2 flex items-center gap-1">
            <TopNavLink to="/orders">{t.nav.orders}</TopNavLink>
            <TopNavLink to="/notifications">
              {t.nav.notifications}
              <CountBadge count={unread} label={`${unread} unread`} />
            </TopNavLink>
          </nav>
          <div className="flex-1" />
          <span className="hidden text-small text-text-muted md:inline">{t.timesInIst}</span>
          <UserMenu />
        </div>
        <p className="border-t border-border bg-surface-subtle px-4 py-0.5 text-center text-small text-text-muted">
          {t.fictionalNotice}
        </p>
      </header>
      <SyncBanners />
      <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">
        <LayoutOutlet />
      </main>
    </div>
  );
}

/** UI plan §12: mobile-first, compact header, content max 480 px, primary action at the bottom. */
export function DriverLayout() {
  const user = useCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <MockModeBanner />
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[480px] items-center gap-2 px-4">
          <Factory aria-hidden className="size-5 text-primary" strokeWidth={ICON_STROKE} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Wordmark className="!text-body" />
            <span className="truncate text-small text-text-muted">{user.transporter?.name ?? t.fictionalNotice}</span>
          </div>
          <UserMenu />
        </div>
      </header>
      <SyncBanners />
      <main id="main" className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4 text-body-lg">
        <LayoutOutlet />
      </main>
      <p className="py-2 text-center text-small text-text-muted">{t.fictionalNotice}</p>
    </div>
  );
}

/** Login layout (UI plan §5): navy brand panel (the only gradient) + form column. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <MockModeBanner />
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="flex h-[120px] shrink-0 flex-col justify-center bg-linear-to-b from-navy-900 to-navy-800 px-6 lg:h-auto lg:w-[45%] lg:justify-between lg:px-12 lg:py-12">
          <div>
            <Wordmark inverse className="!text-h2" />
            <p className="mt-2 hidden max-w-md text-h2 font-normal text-on-primary/90 lg:block">{t.tagline}</p>
            <ul className="mt-8 hidden flex-col gap-3 lg:flex">
              {t.login.points.map((p) => (
                <li key={p} className="flex items-center gap-2 text-body-lg text-on-primary/85">
                  <span aria-hidden className="size-1.5 rounded-full bg-accent-subtle" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="hidden text-small text-on-primary/70 lg:block">{t.fictionalDemo}</p>
        </aside>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-[400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
