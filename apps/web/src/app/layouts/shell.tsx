import { Suspense, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { DropdownMenu as DM } from 'radix-ui';
import { useLogout } from '../../api/hooks/auth';
import { IS_MOCK_MODE } from '../../api/services';
import { useSync } from '../../api/sync';
import { Banner, InlineError } from '../../components/display/feedback';
import { cn } from '../../components/cn';
import { ChevronDown, LogOut, User, ICON_STROKE } from '../../components/icons';
import { roleLabel, t } from '../../i18n/en';
import { useCurrentUser } from '../RoleGuard';
import { PageLoading } from '../FullPageLoading';

export function Wordmark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn('text-h3 font-semibold tracking-tight', inverse ? 'text-on-primary' : 'text-text', className)}>
      Route<span className={inverse ? 'text-on-primary' : 'text-primary'}>Pulse</span>
    </span>
  );
}

export function TopNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-body font-medium whitespace-nowrap transition-colors',
          isActive ? 'bg-primary-subtle text-primary' : 'text-text-secondary hover:bg-surface-sunken hover:text-text',
        )
      }
    >
      {children}
    </NavLink>
  );
}

/** Name, role and Log out (UI plan §3). */
export function UserMenu() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2">
      <InlineError error={logout.error} className="max-w-48" />
      <DM.Root>
        <DM.Trigger
          className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-body text-text hover:bg-surface-sunken"
          aria-label={`Account menu for ${user.name}`}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <User aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
          </span>
          <span className="hidden max-w-36 truncate font-medium lg:inline">{user.name}</span>
          <ChevronDown aria-hidden className="size-4 text-text-muted" strokeWidth={ICON_STROKE} />
        </DM.Trigger>
        <DM.Portal>
          <DM.Content
            align="end"
            sideOffset={6}
            className="z-40 min-w-56 rounded-lg border border-border bg-surface p-1 shadow-md"
          >
            <div className="px-3 py-2">
              <p className="text-body font-medium text-text">{user.name}</p>
              <p className="text-small text-text-muted">
                {roleLabel[user.role]}
                {user.customer ? ` · ${user.customer.name}` : ''}
                {user.transporter ? ` · ${user.transporter.name}` : ''}
              </p>
            </div>
            <DM.Separator className="my-1 h-px bg-border" />
            <DM.Item
              disabled={logout.isPending}
              onSelect={() =>
                logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })
              }
              className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-body text-text outline-none data-[highlighted]:bg-surface-sunken"
            >
              <LogOut aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
              {t.nav.logout}
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </div>
  );
}

export function MockModeBanner() {
  if (!IS_MOCK_MODE) return null;
  return (
    <div className="border-b border-accent/30 bg-accent-subtle px-4 py-1.5 text-center text-small font-medium text-accent">
      {t.mockBanner}
    </div>
  );
}

/** Reconnecting and simulation-error banners (UI plan §6.6, §15). */
export function SyncBanners() {
  const { sync, reconnecting } = useSync();
  if (!reconnecting && !sync?.simError) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {reconnecting ? (
        <Banner tone="warning" live>
          {t.states.reconnecting}
        </Banner>
      ) : null}
      {sync?.simError ? (
        <Banner tone="warning" live>
          {t.sim.error(sync.simError)}
        </Banner>
      ) : null}
    </div>
  );
}

export function LayoutOutlet() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Outlet />
    </Suspense>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md"
    >
      Skip to content
    </a>
  );
}
