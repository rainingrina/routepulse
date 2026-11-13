import { Outlet, useLocation } from 'react-router';
import { useDriverReports } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { CountBadge } from '../../components/display/basics';
import { Bell, FlaskConical, LayoutDashboard, ListChecks, Package, Radar } from '../../components/icons';
import { SimClockControl } from '../../features/simulation/SimClockControl';
import { t } from '../../i18n/en';
import { BP, useMediaQuery } from '../useMediaQuery';
import { useCurrentUser } from '../currentUser';
import { NotificationBell } from './NotificationBell';
import { ContextStrip, LayoutOutlet, MobileNav, MockModeBanner, SkipLink, SyncBanners, TopNavLink, UserMenu, Wordmark, type NavItem } from './shell';

/**
 * Coordinator frame (UI plan §3, v2): one 56 px graphite bar — wordmark, the four sections, the
 * simulation clock, notifications and account — then a thin context strip. Below 1024 px the
 * sections move into a sheet; the clock stays available on the Control Tower dock and the
 * Simulation page.
 */
export function CoordinatorLayout() {
  const pending = useDriverReports({ status: 'PENDING_REVIEW' });
  const pendingCount = pending.data?.items.length ?? 0;
  const isLg = useMediaQuery(BP.lg);
  const isXl = useMediaQuery(BP.xl);
  // The Control Tower drops the context strip to give the map the full height (team request, 2026-11-13).
  const onControlTower = useLocation().pathname.startsWith('/control-tower');
  const isWide = useMediaQuery(BP.wide);
  const badge = <CountBadge count={pendingCount} label={`${pendingCount} pending review`} />;
  const items: NavItem[] = [
    { to: '/control-tower', label: t.nav.controlTower, icon: Radar },
    { to: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { to: '/reports', label: t.nav.reports, icon: ListChecks, badge },
    { to: '/simulation', label: t.nav.simulation, icon: FlaskConical },
  ];
  return (
    <div className="flex h-dvh flex-col">
      <SkipLink />
      <MockModeBanner />
      <header className="on-dark z-20 shrink-0 bg-nav-bg">
        <div className="flex h-14 items-center gap-3 px-3 xl:px-5">
          {!isLg ? <MobileNav items={items} footer={<SimClockControl canControl onDark wrap />} /> : null}
          <Wordmark inverse />
          {isLg ? (
            <nav aria-label="Main" className="ml-2 flex shrink-0 items-center gap-1 xl:ml-4">
              {items.map((it) => (
                <TopNavLink key={it.to} to={it.to} icon={it.icon} title={isXl ? undefined : it.label}>
                  {/* 1024–1279 px: icon-only links (label kept for assistive tech) so the clock fits. */}
                  <span className={isXl ? undefined : 'sr-only'}>{it.label}</span>
                  {it.badge}
                </TopNavLink>
              ))}
            </nav>
          ) : null}
          <div className="flex-1" />
          {isLg ? <SimClockControl canControl onDark compact={!isWide} /> : null}
          <NotificationBell onDark />
          <UserMenu onDark />
        </div>
      </header>
      {onControlTower ? null : (
        <ContextStrip>
          {t.fictionalNotice} · {t.ruleBased}s · {t.timesInIst}
        </ContextStrip>
      )}
      <SyncBanners />
      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <LayoutOutlet />
      </main>
    </div>
  );
}

/** Customer frame (UI plan §3, §11): company identity, Orders and Notifications, account. */
export function CustomerLayout() {
  const user = useCurrentUser();
  const { sync } = useSync();
  const unread = sync?.unreadNotifications ?? 0;
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <MockModeBanner />
      <header className="on-dark sticky top-0 z-20 bg-nav-bg">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-3 sm:gap-3 md:px-4">
          <span className="hidden md:inline-flex">
            <Wordmark inverse />
          </span>
          <span aria-hidden className="hidden h-6 w-px bg-nav-border md:block" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight md:flex-none">
            <span className="truncate text-body font-semibold text-nav-text-strong">{user.customer?.name ?? user.name}</span>
            <span className="truncate text-small text-nav-text">Deliveries from Plant X</span>
          </div>
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1 md:ml-4">
            <TopNavLink to="/orders" icon={Package}>
              <span className="hidden md:inline">{t.nav.orders}</span>
              <span className="sr-only md:hidden">{t.nav.orders}</span>
            </TopNavLink>
            <TopNavLink to="/notifications" icon={Bell}>
              <span className="hidden md:inline">{t.nav.notifications}</span>
              <span className="sr-only md:hidden">{t.nav.notifications}</span>
              <CountBadge count={unread} label={`${unread} unread`} />
            </TopNavLink>
          </nav>
          <div className="hidden flex-1 md:block" />
          <UserMenu onDark />
        </div>
      </header>
      <ContextStrip className="text-center">
        {t.fictionalNotice} · {t.timesInIst}
      </ContextStrip>
      <SyncBanners />
      <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 md:py-6">
        <LayoutOutlet />
      </main>
    </div>
  );
}

/** UI plan §12: mobile-first, compact bar, content max 480 px, primary action at the bottom. */
export function DriverLayout() {
  const user = useCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <MockModeBanner />
      <header className="on-dark sticky top-0 z-20 bg-nav-bg">
        <div className="mx-auto flex h-14 max-w-[480px] items-center gap-2 px-3">
          <Wordmark inverse className="!text-body" />
          <span aria-hidden className="h-5 w-px bg-nav-border" />
          <span className="min-w-0 flex-1 truncate text-small text-nav-text">{user.transporter?.name ?? t.fictionalNotice}</span>
          <UserMenu onDark />
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

/** Login layout (UI plan §5): graphite brand panel + form column on the warm canvas. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <MockModeBanner />
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="on-dark relative flex shrink-0 flex-col justify-center overflow-hidden bg-nav-bg px-6 py-6 lg:w-[44%] lg:justify-between lg:px-12 lg:py-12">
          <div>
            <Wordmark inverse className="!text-h2" />
            <p className="mt-3 hidden max-w-md text-h2 font-normal text-nav-text-strong lg:block">{t.tagline}</p>
            <ul className="mt-8 hidden flex-col gap-3 lg:flex">
              {t.login.points.map((p) => (
                <li key={p} className="flex items-center gap-3 text-body-lg text-nav-text">
                  <span aria-hidden className="size-1.5 rounded-full bg-accent-fill" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="hidden text-small text-nav-text lg:block">{t.fictionalDemo}</p>
          <span aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 hidden size-72 rounded-full border border-nav-border lg:block" />
          <span aria-hidden className="pointer-events-none absolute -right-8 -bottom-8 hidden size-40 rounded-full border border-nav-border lg:block" />
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
